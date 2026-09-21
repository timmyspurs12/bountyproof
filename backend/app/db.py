"""SQLite index for BountyProof.

This index is a discovery aid only (bounty id <-> transaction hashes, creation order).
It is NEVER the source of truth for decisions: every displayed decision is read from
the Intelligent Contract, and index rows are validated against the chain before use.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

from .config import ROOT

_local = threading.local()


def db_path() -> Path:
    return Path(os.environ.get("BOUNTYPROOF_DB_PATH", str(ROOT / "data" / "bountyproof.db")))

SCHEMA = """
CREATE TABLE IF NOT EXISTS bounty_index (
    bounty_id   INTEGER PRIMARY KEY,
    create_tx   TEXT NOT NULL,
    contract    TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tx_index (
    tx_hash     TEXT PRIMARY KEY,
    bounty_id   INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_bounty ON tx_index (bounty_id);
"""


def get_conn() -> sqlite3.Connection:
    path = db_path()
    cached = getattr(_local, "conn", None)
    if cached is not None and getattr(_local, "conn_path", None) == path:
        return cached
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.commit()
    _local.conn = conn
    _local.conn_path = path
    return conn


def upsert_bounty(bounty_id: int, create_tx: str, contract: str, title: str, created_at: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO bounty_index (bounty_id, create_tx, contract, title, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bounty_id) DO UPDATE SET
            create_tx = excluded.create_tx,
            contract  = excluded.contract,
            title     = excluded.title
        """,
        (bounty_id, create_tx, contract, title, created_at),
    )
    conn.commit()


def record_tx(tx_hash: str, bounty_id: int, kind: str, created_at: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO tx_index (tx_hash, bounty_id, kind, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tx_hash) DO NOTHING
        """,
        (tx_hash, bounty_id, kind, created_at),
    )
    conn.commit()


def list_bounties() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM bounty_index ORDER BY bounty_id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_bounty_row(bounty_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM bounty_index WHERE bounty_id = ?", (bounty_id,)
    ).fetchone()
    return dict(row) if row else None


def txs_for_bounty(bounty_id: int) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM tx_index WHERE bounty_id = ? ORDER BY created_at ASC",
        (bounty_id,),
    ).fetchall()
    return [dict(r) for r in rows]
