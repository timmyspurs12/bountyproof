"""Re-index the known on-chain bounties into a freshly deployed backend.

The SQLite discovery index is gitignored, so every fresh deployment starts with
an empty /api/bounties list. This script re-registers the four live bounties
from GenLayer Studionet by calling the backend's chain-validated index
endpoints (each tx is verified on-chain before being recorded — nothing here
can inject a fake entry).

Usage:
    python scripts/reindex_bounties.py https://your-backend.onrender.com
    BOUNTYPROOF_API=https://your-backend.onrender.com python scripts/reindex_bounties.py

Idempotent: safe to run repeatedly (upserts).
"""
import json
import os
import sys
import urllib.request

# Bounty id -> (title, create tx, submit tx, evaluate tx)
BOUNTIES = {
    1: (
        "Restore retry logic in webhook dispatcher",
        "0xb57ae67b36da040e66395c09f5d36b92551958d8efdfa3265104b2f0919c76a5",
        "0xfbfcf7914a7db6d66a358cb2aff420414e5668aa00ba2a66b92567c92dcc74e6",
        "0xd0cc5fc187024230cf8cdd5f360a6560f5545675ed6e14f2ad3e863a981f671e",
    ),
    2: (
        "Verify PR payload integrity",
        "0x17cba4accd6980ee2f328c4801b1fbec656a6a940db82c9f7072f75321abe672",
        "0xa99f82ae0c966cd44ff61d03074b4079b050684ce2f93b77d8cc3b6863fa64e7",
        "0xde08b63abc0e22cca22f4abb5dcb4db21943af1c2a29022a073e002614ea617d",
    ),
    3: (
        "Feature flag toggle present",
        "0x556ae2a7553223b683767c73a3806819681ec81978591e1c6b57ded35397a568",
        "0xe5ad3f4d320519eddd9c88c6e84f02b4ef8de91746e68213db0bcc2236ccb128",
        "0x4d6adde208c9367ea1a02201d39eb54ae3d4753a2afeb76914d25722fbd9496e",
    ),
    4: (
        "Document on-call runbook for webhook hotfixes",
        "0x0533aa6c424fd366a8dbd510e324f662618a6967e7370775be3a74c7f0df53a4",
        "0x272d1b5a2e3067b3fb894905147b1a4f9cc6db6dcde4237143a44bff9873342b",
        "0x826d2debb6f5f6b5156cf6450c4251556fae0a92df0c25c5f9ec1ff8becd920f",
    ),
}


def post(base: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        base + path,
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        raise SystemExit(f"POST {path} failed ({e.code}): {body}") from None


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BOUNTYPROOF_API", "")).rstrip("/")
    if not base:
        raise SystemExit("Usage: python scripts/reindex_bounties.py https://your-backend.onrender.com")
    base = base.rstrip("/")

    health = json.loads(urllib.request.urlopen(base + "/api/health", timeout=30).read())
    if not health.get("contract_configured"):
        raise SystemExit(f"Backend at {base} has no contract configured: {health}")
    print(f"Backend OK: {health.get('network')} / {health.get('contract_address')}")

    for bid, (title, create_tx, submit_tx, evaluate_tx) in BOUNTIES.items():
        post(base, "/api/index/bounty", {"bounty_id": bid, "tx_hash": create_tx, "title": title})
        post(base, "/api/index/tx", {"bounty_id": bid, "tx_hash": submit_tx, "kind": "submit"})
        post(base, "/api/index/tx", {"bounty_id": bid, "tx_hash": evaluate_tx, "kind": "evaluate"})
        print(f"  bounty #{bid}: indexed (create + submit + evaluate, chain-verified)")

    listing = json.loads(urllib.request.urlopen(base + "/api/bounties", timeout=60).read())
    print(f"Done. Dashboard now lists {len(listing['items'])} bounties; metrics: {listing['metrics']}")


if __name__ == "__main__":
    main()
