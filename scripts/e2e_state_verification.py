#!/usr/bin/env python3
"""End-to-end state verification for a deployed BountyProof contract.

Creates three real bounties against real merged PRs of genlayerlabs/genlayer-studio and
evaluates them on-chain, exercising all three decision states:

  * REJECTED      - criteria the PR evidence contradicts
  * ACCEPTED      - criteria the PR evidence affirmatively satisfies
  * INCONCLUSIVE  - criteria the PR evidence cannot establish

Everything is signed by the operator account (GENLAYER_PRIVATE_KEY or a fresh one) and
the decisions are read back from the contract. Nothing is simulated.

Usage:
    .venv/bin/python scripts/e2e_state_verification.py
"""
import json
import sys
import time

ROOT = __file__.replace("\\", "/").rsplit("/scripts/", 1)[0]
sys.path.insert(0, ROOT)

from backend.app.config import deployment_record  # noqa: E402
from backend.app.genlayer import default_client, wait_receipt, with_retries  # noqa: E402

REPO = "https://github.com/genlayerlabs/genlayer-studio"


def write(client, addr: str, fn: str, args: list):
    tx = with_retries(lambda: client.write_contract(addr, fn, args=args))
    h = tx.hex() if hasattr(tx, "hex") else str(tx)
    r = wait_receipt(client, h, timeout_s=900, interval=4)
    print(f"[{fn}] {h}", flush=True)
    print(f"    {r['status_name']} / {r['result_name']} "
          f"votes={json.dumps((r.get('consensus_data') or {}).get('votes') or {}, default=str)}", flush=True)
    return h, r


def main() -> int:
    record = deployment_record()
    addr = record.get("contract_address")
    if not addr:
        print("No BOUNTYPROOF_CONTRACT_ADDRESS configured. Deploy first.", file=sys.stderr)
        return 1
    client = default_client()
    creator = client.local_account.address
    deadline = int(time.time()) + 30 * 86400
    results = {}

    def case(tag: str, title: str, criteria: list, pr: int):
        h1, r1 = write(client, addr, "create_bounty",
                       [title, REPO, f"State verification case ({tag}).", criteria, deadline, ""])
        if r1["result_name"] != "MAJORITY_AGREE":
            print(f"  {tag}: create failed", flush=True)
            return None
        bid = with_retries(lambda: client.read_contract(addr, "find_bounty",
                                                        args=[creator, title, deadline]))
        h2, r2 = write(client, addr, "submit_claim", [bid, f"{REPO}/pull/{pr}"])
        if r2["result_name"] != "MAJORITY_AGREE":
            print(f"  {tag}: submit failed", flush=True)
            return None
        t0 = time.time()
        h3, r3 = write(client, addr, "evaluate_claim", [bid])
        b = with_retries(lambda: client.read_contract(addr, "get_bounty", args=[bid]))
        print(f"  {tag}: bounty #{bid} => {b['decision']} "
              f"({b['satisfied']}/{b['total_criteria']}) in {time.time()-t0:.0f}s", flush=True)
        for c in b["criteria"]:
            print(f"    [{c['verdict']}] {c['reason'][:120]}", flush=True)
        results[tag] = {"id": bid, "decision": b["decision"],
                        "txs": {"create": h1, "submit": h2, "evaluate": h3}}
        return b

    case("rejected",
         "Restore retry logic in webhook dispatcher",
         [
             "A pull request exists against the bounty repository.",
             "The PR description references webhook retry or backoff behavior.",
             "The PR includes at least one commit whose subject mentions retry, backoff or webhook.",
             "The PR was created before the deadline.",
             "The PR state is open or merged (not closed without merging).",
         ],
         1766)

    case("accepted",
         "Verify PR payload integrity",
         [
             "A pull request with a non-empty title exists against the bounty repository.",
             "The PR payload reports a positive additions count.",
             "The PR was created before the deadline.",
             "The PR payload reports at least one commit.",
             "The PR head commit SHA is present in the payload.",
         ],
         1766)

    case("inconclusive",
         "Feature flag toggle present",
         [
             "A pull request exists against the bounty repository.",
             "The implementation includes a feature-flag toggle for the changed behavior.",
             "The PR was created before the deadline.",
         ],
         1762)

    print(json.dumps(results, indent=2), flush=True)
    expected = {"rejected": "REJECTED", "accepted": "ACCEPTED", "inconclusive": "INCONCLUSIVE"}
    ok = all(results.get(k, {}).get("decision") == v for k, v in expected.items())
    print("VERIFICATION:", "PASS" if ok else "CHECK OUTPUT ABOVE", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
