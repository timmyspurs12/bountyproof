# BountyProof — Phase 1/2 Investigation Report

Date: 2026-09-21 (UTC). All findings below were produced by live probes in this session, not assumed.

## 1. Workspace state

The workspace sandbox was **completely empty** at the start of this session
(verified: `/home/user`, `/workspace`, `/app`, `/project`, `/repo` — no files, no git repo).
The previous session crashed before writing any file, so nothing was persisted.
There was no existing frontend, backend, contract, wallet code, env file, or README to preserve.
BountyProof is therefore built fresh in this repository, with every integration verified against
the live GenLayer network rather than mocked.

## 2. Verified environment capabilities

| Capability | Status | Evidence |
|---|---|---|
| npm registry | OK | `registry.npmjs.org` HTTP 200 |
| PyPI | OK | `genlayer-py` 0.18.0 available |
| GitHub REST API | OK | `api.github.com` HTTP 200; real PRs read |
| GenLayer Studionet RPC | OK | `https://studio.genlayer.com/api`, chain id **61999** via `net_version` |
| GenLayer Bradbury RPC | reachable | `https://rpc-bradbury.genlayer.com` (chain 4221) responds; faucet requires 0.01 ETH on mainnet → not fundable from here |
| Docker (local simulator) | unavailable | `docker: command not found` |
| CORS for browser dApp | OK | Studionet echoes `access-control-allow-origin`; Bradbury returns `*` |

## 3. Live GenLayer verification (Studionet)

Probes deployed and executed on `https://studio.genlayer.com/api` with `genlayer-py==0.18.0`
and `genlayer-js@1.1.8`:

1. **Deploy → consensus → read** loop works end-to-end (contract `0x56Be92…1430`,
   tx `0x2641f1…f4d5`, result `MAJORITY_AGREE`, `read_contract` returned stored value).
2. **On-chain GitHub fetch** — `gl.nondet.web.get` + `gl.eq_principle.strict_eq` stored real
   GitHub API JSON under validator consensus (3 agree / 2 idle — genuine vote distribution).
3. **On-chain LLM adjudication** — `gl.nondet.exec_prompt(prompt, response_format="json")` +
   `gl.vm.run_nondet_unsafe(leader, validator)` reached `MAJORITY_AGREE` with a structural
   validator function.
4. **Transaction context** — `gl.message.sender_address` records the true signer (verified:
   stored address equals the submitting account). `datetime.now(timezone.utc)` is pinned to
   the transaction timestamp (deterministic across validators).
5. **Receipts expose real consensus data** — `consensus_data.votes` (per-validator
   agree/disagree/idle), `result_name` (`MAJORITY_AGREE` / `NO_MAJORITY`), `status_name`
   (`ACCEPTED` / `FINALIZED`).
6. **Transient 502s occur** on the Studionet RPC → all RPC access in the backend is wrapped
   with retry/backoff.

## 4. GenVM storage-type consensus matrix (empirically bisected)

Writes that reached consensus on Studionet (**use these only**):

| Type / pattern | Result |
|---|---|
| `str` scalar | ✅ MAJORITY_AGREE |
| `u256` scalar with explicit `u256(...)` casts | ✅ MAJORITY_AGREE |
| `Address` field (`gl.message.sender_address`) | ✅ MAJORITY_AGREE |
| `DynArray[str]` | ✅ MAJORITY_AGREE |
| `DynArray[@allow_storage dataclass]` | ✅ MAJORITY_AGREE |
| nested `DynArray[dataclass]` inside a dataclass | ✅ MAJORITY_AGREE |
| write methods taking `list` args and returning `u256` | ✅ MAJORITY_AGREE |

Patterns that consistently fail consensus (**avoided**):

| Type / pattern | Result |
|---|---|
| `int`-annotated storage (implicit i256) | ❌ NO_MAJORITY (3/3 attempts) |
| `TreeMap[str, str]` | ❌ NO_MAJORITY (3/3 attempts) |
| plain `dict` / `list` annotations | ❌ NO_MAJORITY |

Consequence: the BountyProof contract uses only the verified-safe subset.
`NO_MAJORITY` on Studionet is also an honest product state (validator disagreement /
idle validators) — surfaced in the UI as a failed consensus with retry, never faked.

## 5. SDK facts that shaped the architecture

- Python SDK module name is `genlayer_py` (not `genlayer`). Client API:
  `create_client(chain, account=…)`, `deploy_contract(code, args=…)`,
  `write_contract(addr, fn, args=…)`, `read_contract(addr, fn, args=…)`,
  `wait_for_transaction_receipt(tx, status=…)`, `get_transaction(tx)`.
- JS SDK 1.1.8: `createClient({ chain, account })` — **object config, not positional**.
  `account` may be a **string address** (signing routed to `window.ethereum` via
  `eth_sendTransaction`, with chain-match assertion) or a local private-key account
  (used for headless tests). Reads use `gen_call` over the public RPC (CORS open).
- Write-transaction **return values are not exposed** in Studionet receipts and
  `gen_dbg_traceTransaction` is unavailable → the contract exposes
  `find_bounty(creator, title, deadline_ts)` so the frontend can resolve the new
  bounty id deterministically after a create transaction is accepted.
- Studionet has no `rounds_storage_contract` configured → round data comes from the
  receipt's `consensus_data.votes` instead.

## 6. Chosen architecture

- **Frontend**: Vite + React + TypeScript + react-router (SPA). `genlayer-js` signs
  write transactions with the user's browser wallet (`window.ethereum`).
- **Backend**: FastAPI + `genlayer-py` + `httpx`. Responsibilities: GitHub evidence
  retrieval/normalization (token stays server-side), input validation, transaction
  lifecycle proxying (receipts + votes), read fan-out, and a small SQLite **index**
  (bounty id ↔ tx hashes). The index is never authoritative — every decision is read
  back from the contract.
- **Contract**: single Intelligent Contract `contracts/bounty_proof.py` implementing
  `create_bounty / submit_claim / evaluate_claim / get_bounty / get_decision /
  get_all_bounties / get_bounty_count / find_bounty`. `evaluate_claim` collects GitHub
  evidence on-chain (`strict_eq`) and adjudicates with LLM consensus
  (`run_nondet_unsafe` + structural validator). The contract is the single source of
  truth for the final decision (ACCEPTED / REJECTED / INCONCLUSIVE).
- **Network**: Studionet (61999) for the live deployment (free, no faucet needed).
  Bradbury (4221) is supported via `GENLAYER_NETWORK` env for anyone holding a funded
  wallet; documented honestly in the README.

## 7. Real test fixtures

- Repository: `genlayerlabs/genlayer-studio`
- Merged PRs available for evidence tests: #1766, #1762, #1760 (verified via API).

## 8. GenVM deployment field guide (discovered this session — verify before relying)

The Studionet GenVM pipeline (py-genlayer `1jb45aa…`) has several **silent** failure
modes where the deployment transaction reaches `MAJORITY_AGREE` yet the contract is
permanently unreadable (`gen_call: -32001 Contract not found`). Root cause: identical
crashing module initialization on every validator → consensus on the crash → no state.

Rules that were empirically established (positive and negative):

**File format**
- The `# { "Depends": … }` header must be line 1, and must appear **exactly once**.
- A second `Depends` line anywhere else in the file is fatal.
- **No comment line may immediately follow the header.** The line after the header must
  be a blank line or code. (A single `# hello world` line broke an otherwise-working
  contract; a blank line works.) Comments are fine anywhere later in the file.
- Keep the source pure ASCII (one non-ASCII em-dash in a comment was a suspect; the
  layout rule above was the actual cause, but avoid non-ASCII anyway).

**Storage**
- `str`, `u256` (with explicit `u256(...)` casts), `DynArray[T]`, and
  `@allow_storage @dataclass` (including nested `DynArray[Dataclass]`) reach consensus.
- `int`-annotated scalar storage → consistently `NO_MAJORITY`. Use `u256`.
- `TreeMap[K, V]` → consistently `NO_MAJORITY` on Studionet (3/3 attempts). Use
  `DynArray` + linear lookup or serialized fields.
- `Address` as a dataclass field crashes the simulation (`gen_call: execution failed`).
  Store addresses inside dataclasses as `str`.
- Plain `dict`/`list` annotations: avoid (no storage guarantee).

**Deployment verification**
- Always do a sanity `read_contract` after deploy (the deploy script does, with retries).
  `MAJORITY_AGREE` alone does NOT prove the contract is usable.
- The public testnet RPC returns intermittent 502s; wrap all RPC calls in retry/backoff.
- `NO_MAJORITY` (e.g. idle validators) is a real, honest state: surface it as a failed
  transaction with retry, never as a success.

## 9. Final verified workflow (live, this session)

Contract `0xe5dbb1c667A0f4d1f9Ff492D23e5Cb93D4cAE9d1` on Studionet (61999):

| Bounty | Criteria target | Decision | Notes |
|---|---|---|---|
| #1 | webhook retry vs PR #1766 | REJECTED 3/5 | description/commits never mention retry/backoff |
| #2 | payload integrity vs PR #1766 | ACCEPTED 5/5 | every fact affirmatively present in payload |
| #3 | feature flag vs PR #1762 | INCONCLUSIVE 2/3 | implementation detail not in payload → INSUFFICIENT_EVIDENCE |
| #4 | runbook docs vs PR #1760 | REJECTED 3/4 | created via genlayer-js (browser SDK path), bugfix ≠ docs |

Evaluation latency observed: ~18–90 s (consensus + LLM on 5 validators).
