"""API tests: routes, validation error mapping, index integrity, contract-source rules.

Contract/RPC calls are monkeypatched; the rules under test are the backend's own
(honest error mapping, refusing to index unknown txs, never fabricating decisions).
"""
import pytest
from fastapi.testclient import TestClient

from backend.app import main as main_mod
from backend.app import db
from backend.app.validation import ValidationError


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("BOUNTYPROOF_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(main_mod, "_cache", {})
    db._local = type(db._local)()

    class FakeClient:
        chain = type(
            "Chain",
            (),
            {
                "name": "TestNet",
                "id": 1234,
                "rpc_urls": {"default": {"http": ["https://rpc.test"]}},
                "native_currency": type("NC", (), {"symbol": "GEN"})(),
            },
        )

        def get_block_number(self):
            return 42

        def get_transaction(self, h):
            if h == "0x" + "1" * 64:
                return {
                    "hash": h,
                    "status_name": "ACCEPTED",
                    "result_name": "MAJORITY_AGREE",
                    "from_address": "0x" + "a" * 40,
                    "to_address": "0x" + "b" * 40,
                    "created_at": "2026-09-21T00:00:00Z",
                    "num_of_rounds": 1,
                    "consensus_data": {"votes": {"0x" + "a" * 40: "agree"}},
                }
            raise Exception("not found")

        def read_contract(self, address, fn, args=None):
            if fn == "get_bounty_count":
                return 1
            if fn == "get_bounty" and args and args[0] == 7:
                return {
                    "id": "7",
                    "title": "Test bounty",
                    "status": "RESOLVED",
                    "decision": "ACCEPTED",
                    "satisfied": 2,
                    "total_criteria": 2,
                    "not_satisfied": 0,
                    "insufficient": 0,
                    "criteria": [
                        {"text": "c1", "verdict": "SATISFIED", "reason": "r1"},
                        {"text": "c2", "verdict": "SATISFIED", "reason": "r2"},
                    ],
                    "evidence": {"head_sha": "abc"},
                    "created_ts": 1,
                    "submitted_ts": 2,
                    "evaluated_ts": 3,
                }
            if fn == "get_all_bounties":
                return [
                    {
                        "id": "7",
                        "title": "Test bounty",
                        "status": "RESOLVED",
                        "decision": "ACCEPTED",
                        "satisfied": 2,
                        "total_criteria": 2,
                    }
                ]
            if fn == "find_bounty":
                return 7
            raise Exception("Bounty not found")

    monkeypatch.setattr(main_mod, "default_client", lambda: FakeClient())
    monkeypatch.setattr(main_mod, "contract_address", lambda: "0x" + "c" * 40)
    monkeypatch.setattr(
        main_mod,
        "deployment_record",
        lambda: {
            "contract_address": "0x" + "c" * 40,
            "deploy_tx": "0x" + "1" * 64,
            "deployed_at": "2026-09-21T00:00:00Z",
        },
    )
    monkeypatch.setitem(main_mod._state, "client", None)
    monkeypatch.setitem(main_mod._state, "chain", None)

    from fastapi.testclient import TestClient as TC

    with TC(main_mod.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["rpc_ok"] is True
    assert body["contract_configured"] is True


def test_config_shape(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    body = r.json()
    assert body["network"]["chain_id"] == 1234
    assert body["contract_address"] == "0x" + "c" * 40


def test_validate_bounty_field_error(client):
    r = client.post(
        "/api/bounties/validate",
        json={
            "title": "shrt",
            "repository_url": "https://github.com/acme/dashboard",
            "description": "",
            "criteria": ["A valid criterion text."],
            "deadline_ts": 1,  # past
            "issue_url": "",
        },
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["field"] == "title"


def test_bounties_list_contract_source(client):
    r = client.get("/api/bounties")
    assert r.status_code == 200
    body = r.json()
    assert body["contract_ok"] is True
    assert body["metrics"]["resolved"] == 0  # index empty in test db


def test_index_bounty_rejects_unknown_tx(client):
    r = client.post(
        "/api/index/bounty",
        json={"bounty_id": 99, "tx_hash": "0x" + "2" * 64, "title": "x"},
    )
    assert r.status_code == 404


def test_bounties_list_marks_stale_deployment_rows(client):
    # A row indexed under a different contract (previous deployment) must be
    # surfaced as stale, never read from the live contract, never counted.
    db.upsert_bounty(
        9, "0x" + "3" * 64, "0x" + "d" * 40, "Old deployment bounty", "2026-01-01T00:00:00Z"
    )
    r = client.get("/api/bounties")
    assert r.status_code == 200
    body = r.json()
    stale = [i for i in body["items"] if i.get("stale_deployment")]
    assert len(stale) == 1
    assert stale[0]["bounty_id"] == 9
    assert stale[0]["title"] == "Old deployment bounty"
    assert body["contract_ok"] is True  # stale rows are not contract failures
    assert body["metrics"]["resolved"] == 0  # stale rows never counted
    assert not any(i.get("contract_read_error") for i in body["items"])


def test_index_bounty_accepts_known_tx(client):
    r = client.post(
        "/api/index/bounty",
        json={"bounty_id": 7, "tx_hash": "0x" + "1" * 64, "title": "Test bounty"},
    )
    assert r.status_code == 200
    assert r.json()["indexed"] is True
    # now it appears in the list
    r2 = client.get("/api/bounties")
    assert r2.status_code == 200
    items = r2.json()["items"]
    assert any(i.get("bounty", {}).get("id") == "7" for i in items)
    assert r2.json()["metrics"]["accepted"] == 1


def test_bounty_detail_404_for_unknown(client):
    r = client.get("/api/bounties/123")
    assert r.status_code == 404


def test_bounty_detail_returns_contract_state(client):
    r = client.get("/api/bounties/7")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "contract"
    assert body["bounty"]["decision"] == "ACCEPTED"
    assert body["contract_address"] == "0x" + "c" * 40


def test_find_bounty_endpoint(client):
    r = client.get(
        "/api/bounties/find",
        params={"creator": "0x" + "a" * 40, "title": "Test bounty", "deadline_ts": 1},
    )
    assert r.status_code == 200
    assert r.json()["bounty_id"] == 7


def test_tx_lifecycle_unknown_404(client):
    r = client.get("/api/transactions/0x" + "3" * 64)
    assert r.status_code == 404


def test_tx_lifecycle_returns_votes(client):
    r = client.get("/api/transactions/0x" + "1" * 64)
    assert r.status_code == 200
    body = r.json()
    assert body["result_name"] == "MAJORITY_AGREE"
    assert body["votes"]["0x" + "a" * 40] == "agree"


def test_tx_hash_must_be_hex64(client):
    assert client.get("/api/transactions/nothex").status_code == 422


def test_evidence_preview_validates_urls(client):
    r = client.post(
        "/api/evidence/preview",
        json={"repository_url": "https://github.com/acme/dashboard", "pr_url": "https://example.com/1"},
    )
    assert r.status_code == 422
