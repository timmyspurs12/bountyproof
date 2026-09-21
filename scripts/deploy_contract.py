#!/usr/bin/env python3
"""Deploy the BountyProof Intelligent Contract to a GenLayer network.

Usage:
    python scripts/deploy_contract.py [--network studionet|testnetBradbury|localnet] [--rpc URL]

Reads the operator private key from GENLAYER_PRIVATE_KEY (recommended) or generates a
fresh account. Writes the resulting contract address to `deployment.json` and appends it
to `.env` (BOUNTYPROOF_CONTRACT_ADDRESS) so backend/frontend pick it up.
"""
import argparse
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.app.genlayer import build_chain, make_client, wait_receipt  # noqa: E402

CONTRACT_PATH = os.path.join(ROOT, "contracts", "bounty_proof.py")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", default=os.environ.get("GENLAYER_NETWORK", "studionet"))
    parser.add_argument("--rpc", default=os.environ.get("GENLAYER_RPC_URL", ""))
    args = parser.parse_args()

    chain = build_chain(args.network, args.rpc or None)
    pk = os.environ.get("GENLAYER_PRIVATE_KEY", "")
    client = make_client(chain, pk or None)
    print(f"Network: {chain.name} (chain id {chain.id})")
    print(f"Operator account: {client.local_account.address}")

    code = open(CONTRACT_PATH).read()
    print("Deploying contracts/bounty_proof.py ...")
    tx = client.deploy_contract(code)
    tx_hash = tx.hex() if hasattr(tx, "hex") else str(tx)
    print(f"Deploy tx: {tx_hash}")

    receipt = wait_receipt(client, tx_hash)
    address = receipt["to_address"]
    print(f"Deploy status: {receipt['status_name']} / {receipt['result_name']}")
    if receipt["result_name"] != "MAJORITY_AGREE":
        print("Deployment did not reach validator majority. Re-run the deploy.", file=sys.stderr)
        return 1

    # Sanity read against the fresh contract. A consensus pass on a crashing
    # module-level import would report "contract not found" here, so retry
    # explicitly and refuse to publish a configuration for an unusable contract.
    count = None
    for attempt in range(8):
        try:
            count = client.read_contract(address, "get_bounty_count")
            break
        except Exception as err:
            if "not found" in str(err).lower():
                print(f"Sanity read attempt {attempt + 1}: contract not visible yet", file=sys.stderr)
                time.sleep(10)
                continue
            raise
    if count is None:
        print(
            f"Deployment tx reached {receipt['result_name']} but the contract is not "
            "readable. A module-level crash in the contract code can produce this "
            "state (consensus on an identical failing execution). Check the contract source.",
            file=sys.stderr,
        )
        return 1
    print(f"Sanity read get_bounty_count() -> {count}")

    record = {
        "contract_address": address,
        "deploy_tx": tx_hash,
        "network": chain.name,
        "chain_id": chain.id,
        "rpc_url": chain.rpc_urls["default"]["http"][0],
        "deployed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "contract_path": "contracts/bounty_proof.py",
    }
    with open(os.path.join(ROOT, "deployment.json"), "w") as f:
        json.dump(record, f, indent=2)

    env_path = os.path.join(ROOT, ".env")
    lines = []
    if os.path.exists(env_path):
        lines = [l for l in open(env_path).read().splitlines() if not l.startswith("BOUNTYPROOF_CONTRACT_ADDRESS=")]
    lines.append(f"BOUNTYPROOF_CONTRACT_ADDRESS={address}")
    with open(env_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
