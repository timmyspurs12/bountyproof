"""GenLayer client access for the BountyProof backend.

Wraps genlayer-py with retry/backoff (the public testnet RPC intermittently returns
502/503) and exposes normalized helpers for receipts, lifecycle state and contract
reads. The Intelligent Contract is the single source of truth; this module never
synthesizes results.
"""
from __future__ import annotations

import os
import time
from typing import Any, Optional

from genlayer_py import create_account, create_client, studionet, testnet_bradbury, localnet
from genlayer_py.transactions.actions import TransactionStatus
from genlayer_py.types.chain import GenLayerChain

RETRYABLE_MARKERS = (
    "502", "503", "504", "Bad gateway", "invalid JSON", "Connection",
    "timed out", "timeout", "Max retries", "Service Unavailable",
)


def _is_retryable(err: Exception) -> bool:
    text = f"{type(err).__name__}: {err}"
    return any(marker in text for marker in RETRYABLE_MARKERS)


def with_retries(fn, tries: int = 6, delay: float = 1.5, backoff: float = 1.7):
    """Run fn(), retrying transient RPC/network failures with exponential backoff."""
    last: Optional[Exception] = None
    wait = delay
    for _ in range(tries):
        try:
            return fn()
        except Exception as err:  # noqa: BLE001 - classify then re-raise or retry
            if not _is_retryable(err):
                raise
            last = err
            time.sleep(wait)
            wait *= backoff
    assert last is not None
    raise last


def build_chain(network: str, rpc_url: Optional[str] = None) -> GenLayerChain:
    presets = {
        "studionet": studionet,
        "testnetBradbury": testnet_bradbury,
        "testnet_bradbury": testnet_bradbury,
        "localnet": localnet,
    }
    chain = presets.get(network)
    if chain is None:
        raise ValueError(
            f"Unknown GENLAYER_NETWORK {network!r}. Use one of: {sorted(presets)}"
        )
    if rpc_url:
        chain.rpc_urls["default"]["http"] = [rpc_url]
    return chain


def make_client(chain: GenLayerChain, private_key: Optional[str] = None):
    account = create_account(private_key) if private_key else create_account()
    return create_client(chain, account=account)


def default_client():
    """Client built from environment configuration (used by the API)."""
    network = os.environ.get("GENLAYER_NETWORK", "studionet")
    rpc_url = os.environ.get("GENLAYER_RPC_URL", "") or None
    pk = os.environ.get("GENLAYER_PRIVATE_KEY", "") or None
    return make_client(build_chain(network, rpc_url), pk)


def contract_address() -> str:
    address = os.environ.get("BOUNTYPROOF_CONTRACT_ADDRESS", "")
    if not address:
        raise RuntimeError(
            "BOUNTYPROOF_CONTRACT_ADDRESS is not configured. "
            "Run `python scripts/deploy_contract.py` first."
        )
    return address


def wait_receipt(client, tx_hash: str, timeout_s: int = 600, interval: float = 4.0):
    """Poll until a transaction leaves PENDING (accepted or failed)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        receipt = with_retries(lambda: client.get_transaction(tx_hash))
        status_name = str(receipt.get("status_name", "")).upper()
        if status_name in ("ACCEPTED", "FINALIZED", "FAILED", "UNDETERMINED"):
            return receipt
        time.sleep(interval)
    raise TimeoutError(f"Transaction {tx_hash} still pending after {timeout_s}s")


# Status codes observed on the network (from receipts) — surfaced verbatim.
def normalize_receipt(receipt: dict) -> dict[str, Any]:
    """Normalize a genlayer-py receipt for the frontend lifecycle UI."""
    consensus = receipt.get("consensus_data") or {}
    votes = consensus.get("votes") if isinstance(consensus, dict) else None
    data = receipt.get("data")
    contract = None
    if isinstance(data, dict):
        contract = data.get("contract_address")
    return {
        "hash": str(receipt.get("hash", "")),
        "status": str(receipt.get("status", "")),
        "status_name": str(receipt.get("status_name", "")),
        "result_name": str(receipt.get("result_name", "")),
        "from_address": str(receipt.get("from_address", "")),
        "to_address": str(receipt.get("to_address", "")),
        "contract_address": contract,
        "created_at": str(receipt.get("created_at", "")),
        "num_of_rounds": receipt.get("num_of_rounds"),
        "votes": votes or {},
    }


def read_bounty(client, address: str, bounty_id: int) -> dict:
    return with_retries(
        lambda: client.read_contract(address, "get_bounty", args=[bounty_id])
    )


def read_all_bounties(client, address: str) -> list:
    return with_retries(
        lambda: client.read_contract(address, "get_all_bounties")
    )


def read_bounty_count(client, address: str) -> int:
    return with_retries(
        lambda: client.read_contract(address, "get_bounty_count")
    )


def transaction_lifecycle(client, tx_hash: str) -> dict[str, Any]:
    """Full lifecycle snapshot: receipt + normalized view for the UI."""
    receipt = with_retries(lambda: client.get_transaction(tx_hash))
    return normalize_receipt(receipt)
