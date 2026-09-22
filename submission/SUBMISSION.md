# BountyProof — submission form answers

Copy each block into the matching field. Every hash and URL below is taken from the live
deployment (verified 2026-09-22); nothing is placeholder.

---

## 01 · Identity

**Logo:** upload `submission/logo-512.png` (512×512 PNG, 16 KB)

**Project name:** `BountyProof`

**Primary tag:** `Dispute Resolution`

**Tag 1:** `Developer Tools`
**Tag 2:** `Marketplaces`
*(pick the closest available sub-topics; the exact options appear after choosing the primary tag — fall back to "AI & Agents" if these aren't offered)*

---

## 02 · One-liner (≤ 180 chars)

```
Evidence-based acceptance for software bounties: an Intelligent Contract checks GitHub PR evidence against predefined criteria and records ACCEPTED / REJECTED on-chain.
```
*(176 characters)*

---

## 03 · Description (≤ 1000 chars)

```
Software bounties fail in the middle: the contributor says "the PR is up", the sponsor says "this isn't what we agreed", and there is no neutral record of what was promised or what the evidence shows.

BountyProof turns a bounty into a written acceptance agreement — explicit criteria and a fixed deadline — stored in a GenLayer Intelligent Contract. When a pull request is submitted, every validator fetches the same GitHub evidence on-chain (title, commits, additions, timestamps, head SHA) and an LLM adjudicates each criterion strictly against that evidence: SATISFIED, NOT_SATISFIED or INSUFFICIENT_EVIDENCE. Validator consensus produces one final decision, ACCEPTED, REJECTED or INCONCLUSIVE, recorded in the contract with a per-criterion rationale.

Nothing is faked: the browser never submits results, the backend only reads chain state, and unresolved consensus is shown as inconclusive rather than hidden. Four real bounties against genlayerlabs/genlayer-studio PRs are live on Studionet.
```
*(≈ 990 characters — check the counter; trim the last sentence if your form counts differently)*

---

## 04 · Demo video

Optional — leave empty unless you record one. If you do, a 60–90 s screen recording of the
How-to below is ideal; upload to YouTube (unlisted is fine) and paste the direct video URL.

---

## 05 · How-to (exact path)

**Step 1 — Open the live app**
```
Open https://bountyproof-tawny.vercel.app. The header shows the live network (Genlayer Studio Network, chain 61999) and the contract 0xe5dbb1c6… every figure on the page is read from that contract.
```

**Step 2 — Inspect a resolved decision**
```
Click "Bounties", then open #2 "Verify PR payload integrity". You'll see the acceptance agreement (5 criteria, deadline), the submitted PR (genlayerlabs/genlayer-studio #1766), the GenLayer decision ACCEPTED 5/5, and each criterion's verdict with the exact evidence quoted (e.g. additions=679, head_sha e8208389…).
```

**Step 3 — Verify it on the explorer**
```
On the same page, use the lifecycle panel's explorer links. The evaluate transaction is 0xde08b63abc0e22cca22f4abb5dcb4db21943af1c2a29022a073e002614ea617d — open it on explorer-studio.genlayer.com and confirm the status and validator votes match what the dashboard shows.
```

**Step 4 — Compare with a rejection**
```
Go back and open #1 "Restore retry logic in webhook dispatcher" (same PR #1766). Decision: REJECTED 3/5 — the two failing criteria show why the same evidence does not satisfy a different agreement. #3 shows INCONCLUSIVE (honest non-result, not hidden).
```

**Step 5 — Create your own bounty (optional, needs a wallet)**
```
Click "Create", fill in a repository, criteria and deadline. Click "Connect wallet" — choose any installed extension (MetaMask, Rabby, Zerion…) or WalletConnect (QR). The app switches your wallet to Studionet (chain 61999) and asks you to sign the publish transaction; the resulting tx hash is shown live with its consensus state.
```

**Step 6 — Submit and evaluate (optional)**
```
On your new bounty, click "Submit" and paste a PR URL from the same repository; sign. Then "Evaluate submission"; sign. Watch the transaction move through PENDING → ACCEPTED as validators run the on-chain evaluation; the decision and per-criterion verdicts appear once consensus is reached.
```

---

## 06 · Review verification

**Expected verification outcome (≤ 500 chars, private):**
```
Opening https://bountyproof-tawny.vercel.app/bounties shows 4 resolved bounties: #1 REJECTED 3/5, #2 ACCEPTED 5/5, #3 INCONCLUSIVE 2/3, #4 REJECTED 3/4. Bounty #2's page lists 5 SATISFIED criteria with quoted evidence (additions 679, 2 commits, head SHA e8208389…). Explorer tx 0xde08b63a… (evaluate, bounty #2) is ACCEPTED on Studionet. /api/health returns contract_configured true. Creating a bounty prompts a real wallet signature; nothing is submittable without one.
```
*(≈ 470 characters)*

**Contract link 1:**
```
https://explorer-studio.genlayer.com/address/0xe5dbb1c667A0f4d1f9Ff492D23e5Cb93D4cAE9d1
```

**Contract link 2 (add another deployment → the evaluate tx of the ACCEPTED bounty):**
```
https://explorer-studio.genlayer.com/tx/0xde08b63abc0e22cca22f4abb5dcb4db21943af1c2a29022a073e002614ea617d
```

Other explorer URLs, if the form takes more:
- Deploy tx: `https://explorer-studio.genlayer.com/tx/0xb15a9dd7e6c8a90126cf4eb6f8e00cd5597083b9a26608bcc435cf057787f728`
- Bounty #1 evaluate (REJECTED 3/5): `https://explorer-studio.genlayer.com/tx/0xd0cc5fc187024230cf8cdd5f360a6560f5545675ed6e14f2ad3e863a981f671e`
- Bounty #3 evaluate (INCONCLUSIVE): `https://explorer-studio.genlayer.com/tx/0x4d6adde208c9367ea1a02201d39eb54ae3d4753a2afeb76914d25722fbd9496e`
- Bounty #4 evaluate (REJECTED 3/4): `https://explorer-studio.genlayer.com/tx/0x826d2debb6f5f6b5156cf6450c4251556fae0a92df0c25c5f9ec1ff8becd920f`

---

## 07 · Project links

**Website (required):** `https://bountyproof-tawny.vercel.app`
**GitHub:** `https://github.com/timmyspurs12/bountyproof`

---

## Evidence & Supporting Information

**GitHub Repository (required):** `https://github.com/timmyspurs12/bountyproof`

Optional supporting notes you can paste if there is a free-text field:
```
- Intelligent Contract: contracts/ (GenVM Python) — on-chain GitHub evidence fetch via gl.nondet.web.get with strict equality, LLM adjudication via gl.nondet.exec_prompt with structural (not strict) validation, final decision stored in contract state.
- Backend is read-only against the chain: it never accepts evaluation results from clients; the discovery index only admits entries whose transactions are verified on-chain.
- INVESTIGATION.md documents GenVM silent-failure modes found during development (header formatting, u256 vs int, TreeMap limits) — useful for other builders.
- 48 backend tests; wallet chooser supports every EIP-6963 extension wallet plus WalletConnect.
```

---

## Before you press submit

1. Wait ~2 minutes for Vercel and Render to finish redeploying the latest commit (`6cdb1f6`), then open
   `https://bountyproof-tawny.vercel.app/bounties/2` directly in a fresh tab — it must load (deep links were
   404 before this commit) and show ACCEPTED 5/5.
2. If the bounties list is ever empty right after a Render restart, wait ~20 s and refresh — the backend now
   re-registers the 4 on-chain bounties automatically on boot (chain-verified).
3. WalletConnect Cloud → project → allowed domains: make sure `https://bountyproof-tawny.vercel.app` is listed.
