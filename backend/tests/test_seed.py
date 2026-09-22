"""The boot-time seeder must never trust the seed file: every entry is chain-verified."""
import json

from backend.app import db, seed


def _use_tmp_db(monkeypatch, tmp_path):
    monkeypatch.setenv("BOUNTYPROOF_DB_PATH", str(tmp_path / "t.db"))
    # get_conn() re-opens automatically when BOUNTYPROOF_DB_PATH changes


class FakeClient:
    def __init__(self, receipts):
        self.receipts = receipts

    def get_transaction(self, h):
        if h not in self.receipts:
            raise RuntimeError("Transaction not found")
        return self.receipts[h]


def _seed_file(tmp_path, monkeypatch, contract, bounties):
    p = tmp_path / "seed.json"
    p.write_text(json.dumps({"contract_address": contract, "bounties": bounties}))
    monkeypatch.setattr(seed, "SEED_PATH", p)
    monkeypatch.setattr(seed, "_retry", lambda fn, **kw: fn())  # no sleeps in tests


def test_seed_registers_only_chain_verified_entries(tmp_path, monkeypatch):
    _use_tmp_db(monkeypatch, tmp_path)
    contract = "0x" + "ab" * 20
    good = {"id": 1, "title": "Good", "create_tx": "0x" + "11" * 32, "submit_tx": "0x" + "22" * 32, "evaluate_tx": "0x" + "33" * 32}
    fake = {"id": 9, "title": "Fabricated", "create_tx": "0x" + "99" * 32}
    _seed_file(tmp_path, monkeypatch, contract, [good, fake])
    client = FakeClient({
        good["create_tx"]: {"hash": good["create_tx"], "status_name": "ACCEPTED"},
        good["submit_tx"]: {"hash": good["submit_tx"], "status_name": "ACCEPTED"},
        # evaluate tx deliberately missing on-chain -> must not be recorded
    })
    monkeypatch.setattr(seed, "read_bounty", lambda c, a, bid: {"title": "Good"} if bid == 1 else (_ for _ in ()).throw(RuntimeError("no such bounty")))

    stats = seed.seed_index(client, contract)
    assert stats == {"seeded": 1, "skipped": 1, "already": 0}
    ids = [r["bounty_id"] for r in db.list_bounties()]
    assert ids == [1]
    kinds = sorted(t["kind"] for t in db.txs_for_bounty(1))
    assert kinds == ["create", "submit"]  # unverifiable evaluate tx was dropped


def test_seed_is_noop_when_index_populated_or_contract_differs(tmp_path, monkeypatch):
    _use_tmp_db(monkeypatch, tmp_path)
    contract = "0x" + "ab" * 20
    entry = {"id": 1, "title": "X", "create_tx": "0x" + "11" * 32}
    # wrong contract -> no seeding at all
    _seed_file(tmp_path, monkeypatch, "0x" + "cd" * 20, [entry])
    assert seed.seed_index(FakeClient({}), contract)["seeded"] == 0
    assert db.list_bounties() == []
    # populated index -> untouched
    db.upsert_bounty(5, "0x" + "55" * 32, contract, "existing", "2026-01-01T00:00:00Z")
    _seed_file(tmp_path, monkeypatch, contract, [entry])
    assert seed.seed_index(FakeClient({}), contract)["already"] == 1
    assert [r["bounty_id"] for r in db.list_bounties()] == [5]
