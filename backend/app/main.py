"""BountyProof backend API.

Responsibilities (deliberately minimal):
  * GitHub evidence retrieval + normalization (token stays server-side)
  * Input validation
  * Contract reads (the Intelligent Contract is the single source of truth)
  * Transaction lifecycle proxying (receipts + validator votes)
  * A SQLite index for bounty discovery (validated against the chain)

The backend NEVER accepts or returns a client-declared decision. Decisions are read
from contract state only.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import db
from .config import deployment_record, explorer_base, network_name
from .evidence import EvidenceError, fetch_pr_evidence, fetch_repository
from .genlayer import (
    build_chain,
    contract_address,
    default_client,
    normalize_receipt,
    read_all_bounties,
    read_bounty,
    transaction_lifecycle,
    with_retries,
)
from .validation import (
    ValidationError,
    validate_address,
    validate_bounty_id,
    validate_criteria,
    validate_deadline,
    validate_description,
    validate_issue_url,
    validate_pr_url,
    validate_repository_url,
    validate_title,
)

_state: dict[str, Any] = {"client": None, "chain": None}
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_S = 5.0


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        _state["client"] = default_client()
        _state["chain"] = _state["client"].chain
    except Exception as err:  # surface at /api/health, do not crash boot
        _state["client_error"] = str(err)
    yield


app = FastAPI(title="BountyProof API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def client():
    c = _state.get("client")
    if c is None:
        c = default_client()
        _state["client"] = c
        _state["chain"] = c.chain
    return c


def cached(key: str, fn, ttl: float = CACHE_TTL_S):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = fn()
    _cache[key] = (now, value)
    return value


def validation_error_response(err: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"field": err.field, "message": err.message}},
    )


# --------------------------------------------------------------------- models


class EvidencePreviewRequest(BaseModel):
    repository_url: str
    pr_url: str


class IndexBountyRequest(BaseModel):
    bounty_id: int = Field(ge=1)
    tx_hash: str = Field(min_length=66, max_length=66)
    title: str = ""


class IndexTxRequest(BaseModel):
    bounty_id: int = Field(ge=1)
    tx_hash: str = Field(min_length=66, max_length=66)
    kind: str = Field(pattern="^(create|submit|evaluate)$")


class BountyCreateCheckRequest(BaseModel):
    title: str
    repository_url: str
    description: str = ""
    criteria: list[str]
    deadline_ts: int
    issue_url: str = ""


# --------------------------------------------------------------------- routes


@app.get("/api/health")
def health() -> dict:
    record = deployment_record()
    address = record.get("contract_address", "")
    out: dict[str, Any] = {
        "status": "ok",
        "network": network_name(),
        "contract_address": address,
        "contract_configured": bool(address),
        "rpc_ok": False,
    }
    try:
        c = client()
        with_retries(lambda: c.get_block_number(), tries=2, delay=1.0)
        out["rpc_ok"] = True
    except Exception as err:
        out["rpc_error"] = str(err)[:300]
    return out


@app.get("/api/config")
def config() -> dict:
    record = deployment_record()
    chain = _state.get("chain") or client().chain
    return {
        "network": {
            "name": chain.name,
            "chain_id": chain.id,
            "rpc_url": chain.rpc_urls["default"]["http"][0],
            "currency": chain.native_currency.symbol,
        },
        "contract_address": record.get("contract_address", ""),
        "deploy_tx": record.get("deploy_tx", ""),
        "deployed_at": record.get("deployed_at", ""),
        "explorer_base": explorer_base(),
    }


@app.post("/api/bounties/validate")
def validate_bounty_payload(req: BountyCreateCheckRequest):
    """Pre-flight validation mirroring the contract's rules (fast UX feedback).

    The contract re-validates everything on-chain; this endpoint exists so the UI
    can surface field errors before the user signs a transaction.
    """
    now = int(time.time())
    try:
        title = validate_title(req.title)
        repo = validate_repository_url(req.repository_url)
        description = validate_description(req.description)
        criteria = validate_criteria(req.criteria)
        deadline = validate_deadline(req.deadline_ts, now)
        issue_url = validate_issue_url(req.issue_url)
    except ValidationError as err:
        return validation_error_response(err)
    return {
        "valid": True,
        "title": title,
        "repository": repo.slug,
        "description": description,
        "criteria": criteria,
        "deadline_ts": deadline,
        "issue_url": issue_url,
    }


@app.post("/api/evidence/preview")
def evidence_preview(req: EvidencePreviewRequest):
    """Retrieve the GitHub evidence snapshot for a repo + PR (server-side token)."""
    try:
        repo = validate_repository_url(req.repository_url)
        pr_ref, number = validate_pr_url(req.pr_url, req.repository_url)
    except ValidationError as err:
        return validation_error_response(err)
    try:
        evidence = cached(
            f"evidence:{repo.slug}:{number}",
            lambda: fetch_pr_evidence(pr_ref.owner, pr_ref.repo, number),
            ttl=30.0,
        )
        repository = cached(
            f"repo:{repo.slug}",
            lambda: fetch_repository(repo.owner, repo.repo),
            ttl=300.0,
        )
    except EvidenceError as err:
        raise HTTPException(status_code=502, detail=str(err))
    return {
        "source": "github-api",
        "retrieved_at": int(time.time()),
        "note": "Server-side snapshot for display and pre-flight checks. The adjudicated evidence is collected independently on-chain by the Intelligent Contract.",
        "repository": repository,
        "evidence": evidence,
    }


@app.get("/api/bounties")
def list_bounties():
    """Dashboard list. Contract state is authoritative; the index provides discovery."""
    try:
        address = contract_address()
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    rows = db.list_bounties()
    items = []
    contract_ok = True
    for row in rows:
        if str(row.get("contract", "")).lower() != address.lower():
            # Indexed on a previous contract deployment. Do not read it from the
            # live contract (its ids belong to a different deployment); surface it
            # as stale so the UI can de-emphasise it instead of erroring.
            items.append({
                **row,
                "stale_deployment": True,
                "note": "Indexed on a different contract deployment; not part of the current network.",
            })
            continue
        try:
            bounty = cached(
                f"bounty:{row['bounty_id']}",
                lambda bid=row["bounty_id"]: read_bounty(c, address, bid),
            )
        except Exception as err:
            contract_ok = False
            items.append({**row, "contract_read_error": str(err)[:200]})
            continue
        txs = db.txs_for_bounty(row["bounty_id"])
        items.append({
            "bounty": bounty,
            "create_tx": row["create_tx"],
            "txs": txs,
        })

    metrics = {"active": 0, "evaluating": 0, "resolved": 0, "accepted": 0, "rejected": 0, "inconclusive": 0}
    for item in items:
        b = item.get("bounty")
        if not b:
            continue
        status = b.get("status")
        if status == "OPEN":
            metrics["active"] += 1
        elif status == "SUBMITTED":
            metrics["evaluating"] += 1
        elif status == "RESOLVED":
            metrics["resolved"] += 1
            decision = str(b.get("decision", "")).lower()
            if decision in metrics:
                metrics[decision] += 1
    return {"items": items, "metrics": metrics, "contract_ok": contract_ok}


@app.get("/api/bounties/find")
def find_bounty(
    creator: str,
    title: str,
    deadline_ts: int,
):
    """Resolve a bounty id deterministically after a create tx is accepted.

    The contract stores creator/title/deadline, so this lookup is exact: it returns
    the id of the most recently created matching bounty (0 if none exists).
    """
    try:
        validate_address(creator, "creator")
        contract_address()
    except ValidationError as err:
        return validation_error_response(err)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    try:
        bid = with_retries(
            lambda: c.read_contract(
                contract_address(), "find_bounty", args=[creator, title, deadline_ts]
            )
        )
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Contract read failed: {str(err)[:300]}")
    return {"bounty_id": int(bid)}


@app.get("/api/bounties/{bounty_id}")
def get_bounty(bounty_id: int):
    try:
        bid = validate_bounty_id(bounty_id)
        address = contract_address()
    except ValidationError as err:
        return validation_error_response(err)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    try:
        bounty = cached(f"bounty:{bid}", lambda: read_bounty(c, address, bid))
    except Exception as err:
        text = str(err)
        if "not found" in text.lower() or "UserError" in text or "Bounty not found" in text:
            raise HTTPException(status_code=404, detail="Bounty not found on contract")
        raise HTTPException(status_code=502, detail=f"Contract read failed: {text[:300]}")
    row = db.get_bounty_row(bid)
    txs = db.txs_for_bounty(bid)
    return {
        "source": "contract",
        "bounty": bounty,
        "create_tx": row["create_tx"] if row else None,
        "txs": txs,
        "explorer_base": explorer_base(),
        "contract_address": address,
    }


@app.get("/api/bounties/{bounty_id}/evidence")
def bounty_evidence(bounty_id: int, fresh: bool = Query(default=True)):
    """Fresh GitHub snapshot for a bounty's submitted PR (display only)."""
    try:
        bid = validate_bounty_id(bounty_id)
        address = contract_address()
    except ValidationError as err:
        return validation_error_response(err)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    try:
        bounty = read_bounty(c, address, bid)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Contract read failed: {str(err)[:300]}")
    pr_url = bounty.get("pr_url", "")
    repository_url = bounty.get("repository_url", "")
    if not pr_url:
        return {"source": "github-api", "evidence": None, "note": "No submission yet"}
    try:
        pr_ref, number = validate_pr_url(pr_url, repository_url)
        evidence = fetch_pr_evidence(pr_ref.owner, pr_ref.repo, number) if fresh else None
    except (ValidationError, EvidenceError) as err:
        raise HTTPException(status_code=502, detail=str(err))
    return {
        "source": "github-api",
        "retrieved_at": int(time.time()),
        "note": "Server-side snapshot for display. The adjudicated evidence snapshot is stored on-chain inside the bounty record.",
        "evidence": evidence,
        "onchain_evidence": bounty.get("evidence", {}),
    }


@app.post("/api/index/bounty")
def index_bounty(req: IndexBountyRequest):
    """Register a bounty in the discovery index after its create tx is accepted.

    The backend verifies against the chain: the tx must exist and the contract must
    actually hold a bounty with this id. Garbage cannot enter the index.
    """
    try:
        address = contract_address()
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    try:
        receipt = with_retries(lambda: c.get_transaction(req.tx_hash))
    except Exception as err:
        raise HTTPException(status_code=404, detail=f"Transaction not found: {str(err)[:200]}")
    status_name = str(receipt.get("status_name", "")).upper()
    if status_name not in ("ACCEPTED", "FINALIZED"):
        raise HTTPException(
            status_code=409,
            detail=f"Transaction is {status_name or 'PENDING'}, not accepted yet",
        )
    try:
        bounty = read_bounty(c, address, req.bounty_id)
    except Exception as err:
        raise HTTPException(
            status_code=409,
            detail=f"Contract does not hold bounty #{req.bounty_id}: {str(err)[:200]}",
        )
    db.upsert_bounty(
        req.bounty_id,
        req.tx_hash,
        address,
        req.title or str(bounty.get("title", ""))[:200],
        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
    db.record_tx(req.tx_hash, req.bounty_id, "create", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    return {"indexed": True, "bounty_id": req.bounty_id}


@app.post("/api/index/tx")
def index_tx(req: IndexTxRequest):
    """Attach a submit/evaluate tx hash to a bounty (validated against the chain)."""
    try:
        contract_address()
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    c = client()
    try:
        receipt = with_retries(lambda: c.get_transaction(req.tx_hash))
    except Exception as err:
        raise HTTPException(status_code=404, detail=f"Transaction not found: {str(err)[:200]}")
    if not str(receipt.get("hash", "")):
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.record_tx(req.tx_hash, req.bounty_id, req.kind, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    return {"indexed": True, "tx_hash": req.tx_hash}


@app.get("/api/transactions/{tx_hash}")
def get_transaction(tx_hash: str):
    """Lifecycle snapshot for a transaction: status, result, validator votes."""
    if not (tx_hash.startswith("0x") and len(tx_hash) == 66):
        raise HTTPException(status_code=422, detail="Invalid transaction hash")
    try:
        lifecycle = transaction_lifecycle(client(), tx_hash)
    except Exception as err:
        text = str(err)
        if "not found" in text.lower() or "could not be found" in text.lower():
            raise HTTPException(status_code=404, detail="Transaction not found")
        raise HTTPException(status_code=502, detail=f"RPC error: {text[:300]}")
    return lifecycle


@app.get("/api/transactions/{tx_hash}/wait")
def wait_transaction(tx_hash: str, timeout_s: int = Query(default=90, ge=5, le=240)):
    """Long-poll until the transaction leaves PENDING or the timeout elapses."""
    if not (tx_hash.startswith("0x") and len(tx_hash) == 66):
        raise HTTPException(status_code=422, detail="Invalid transaction hash")
    c = client()
    deadline = time.time() + timeout_s
    last: Optional[dict] = None
    while time.time() < deadline:
        try:
            last = transaction_lifecycle(c, tx_hash)
        except Exception as err:
            text = str(err)
            if "not found" in text.lower() or "could not be found" in text.lower():
                raise HTTPException(status_code=404, detail="Transaction not found")
            time.sleep(3)
            continue
        if last["status_name"].upper() in ("ACCEPTED", "FINALIZED", "FAILED", "UNDETERMINED"):
            return last
        time.sleep(3)
    if last is None:
        raise HTTPException(status_code=504, detail="RPC unavailable while waiting")
    return last


@app.get("/api/bounties/scan/contract")
def scan_contract():
    """Read every bounty directly from the contract (no index involved)."""
    try:
        address = contract_address()
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))
    try:
        bounties = cached("all_bounties", lambda: read_all_bounties(client(), address))
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Contract read failed: {str(err)[:300]}")
    return {"source": "contract", "bounties": bounties}
