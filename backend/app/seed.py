"""Self-seeding of the discovery index from known on-chain bounties.

Hosted free tiers (e.g. Render) have ephemeral disks, so the SQLite discovery
index is wiped on every restart. Rather than depend on a manual re-index, the
API re-registers the bounties listed in ``backend/seed_index.json`` at boot —
but only when the index is empty, only when the seed file targets the configured
contract, and only after each entry is verified against the chain with the same
rules the public ``/api/index/*`` endpoints enforce:

* the create tx must exist and be ACCEPTED/FINALIZED,
* the contract must actually hold a bounty with that id,
* submit/evaluate txs must exist on-chain.

Nothing in the seed file can put a fake entry into the index; a stale or wrong
hash is simply skipped and logged.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

from . import db
from .genlayer import read_bounty

log = logging.getLogger("bountyproof.seed")

SEED_PATH = Path(__file__).resolve().parent.parent / "seed_index.json"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _retry(fn, attempts: int = 4, base_delay: float = 1.5):
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as err:  # transient RPC hiccups on cold start
            last = err
            time.sleep(base_delay * (i + 1))
    assert last is not None
    raise last


def seed_index(client: Any, contract_address: str) -> dict[str, int]:
    """Synchronously seed the index. Returns counters for logging/tests."""
    stats = {"seeded": 0, "skipped": 0, "already": 0}
    if not SEED_PATH.exists():
        return stats
    if db.list_bounties():
        stats["already"] = 1
        return stats

    seed = json.loads(SEED_PATH.read_text())
    if str(seed.get("contract_address", "")).lower() != contract_address.lower():
        log.info("seed_index.json targets %s, configured %s — not seeding", seed.get("contract_address"), contract_address)
        return stats

    for entry in seed.get("bounties", []):
        bid = int(entry["id"])
        try:
            receipt = _retry(lambda: client.get_transaction(entry["create_tx"]))
            status = str(receipt.get("status_name", "")).upper()
            if status not in ("ACCEPTED", "FINALIZED"):
                raise RuntimeError(f"create tx is {status or 'PENDING'}")
            bounty = _retry(lambda: read_bounty(client, contract_address, bid))
        except Exception as err:
            log.warning("seed: skipping bounty #%s — chain verification failed: %s", bid, str(err)[:200])
            stats["skipped"] += 1
            continue

        db.upsert_bounty(bid, entry["create_tx"], contract_address, entry.get("title") or str(bounty.get("title", ""))[:200], _now())
        db.record_tx(entry["create_tx"], bid, "create", _now())
        for kind in ("submit", "evaluate"):
            tx = entry.get(f"{kind}_tx")
            if not tx:
                continue
            try:
                rec = _retry(lambda: client.get_transaction(tx))
                if not str(rec.get("hash", "")):
                    raise RuntimeError("no hash in receipt")
                db.record_tx(tx, bid, kind, _now())
            except Exception as err:
                log.warning("seed: bounty #%s %s tx not verifiable, not recorded: %s", bid, kind, str(err)[:200])
        stats["seeded"] += 1
        log.info("seed: bounty #%s registered (chain-verified)", bid)
    return stats


def seed_in_background(client: Any, contract_address: str) -> threading.Thread:
    """Seed without blocking API startup (health checks keep responding)."""

    def run() -> None:
        try:
            stats = seed_index(client, contract_address)
            log.info("seed complete: %s", stats)
        except Exception as err:
            log.warning("seed failed: %s", err)

    t = threading.Thread(target=run, name="bountyproof-seed", daemon=True)
    t.start()
    return t
