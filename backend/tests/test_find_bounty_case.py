"""/api/bounties/find must checksum the creator before the literal on-chain compare.

Regression: a WalletConnect session returned a lowercase address, the contract
stores EIP-55 checksummed creators, and find_bounty returned 0 → the UI said
"Bounty not found on contract after accepted transaction" for a bounty that existed.
"""
from fastapi.testclient import TestClient

from backend.app import main


class FakeChainClient:
    def __init__(self):
        self.calls = []

    def read_contract(self, address, fn, args):
        self.calls.append((fn, args))
        creator, title, deadline = args
        # literal compare, exactly like the contract
        if creator == "0xf8e604137A2F4b213AC115D33fee170EB5a63282" and title == "Escrowlens" and deadline == 1792659497:
            return 5
        return 0


def test_find_bounty_accepts_lowercase_creator(monkeypatch):
    fake = FakeChainClient()
    monkeypatch.setattr(main, "client", lambda: fake)
    monkeypatch.setattr(main, "contract_address", lambda: "0x" + "ab" * 20)
    api = TestClient(main.app)

    r = api.get("/api/bounties/find", params={
        "creator": "0xf8e604137a2f4b213ac115d33fee170eb5a63282",
        "title": "Escrowlens",
        "deadline_ts": 1792659497,
    })
    assert r.status_code == 200, r.text
    assert r.json() == {"bounty_id": 5}
    assert fake.calls[0][1][0] == "0xf8e604137A2F4b213AC115D33fee170EB5a63282"
