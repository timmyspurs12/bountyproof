"""Environment-driven configuration for the BountyProof backend."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_env_file() -> None:
    """Minimal .env loader (no external dependency). Does not override real env vars."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file()


def github_token() -> str:
    return os.environ.get("GITHUB_TOKEN", "")


def network_name() -> str:
    return os.environ.get("GENLAYER_NETWORK", "studionet")


def explorer_base() -> str:
    overrides = {
        "studionet": "https://explorer-studio.genlayer.com",
        "testnetBradbury": "https://explorer-bradbury.genlayer.com",
        "testnet_bradbury": "https://explorer-bradbury.genlayer.com",
    }
    return os.environ.get(
        "GENLAYER_EXPLORER_URL",
        overrides.get(network_name(), "https://explorer-studio.genlayer.com"),
    )


def deployment_record() -> dict:
    path = ROOT / "deployment.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}
