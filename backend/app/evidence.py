"""GitHub evidence retrieval and normalization.

The GitHub token (if configured) is used ONLY here, server-side; it never reaches the
frontend or the on-chain prompt. The normalized shape mirrors the contract's on-chain
evidence snapshot so the UI and the adjudicated record line up field-for-field.

Note: this snapshot is for display and pre-flight checks. The authoritative evidence
used for the decision is collected independently by the Intelligent Contract on-chain.
"""
from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from .config import github_token

GITHUB_API = "https://api.github.com"
USER_AGENT = "BountyProof/1.0 (evidence layer)"


class EvidenceError(Exception):
    pass


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
    }
    token = github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get(client: httpx.Client, url: str) -> Any:
    try:
        resp = client.get(url, timeout=20.0)
    except httpx.HTTPError as err:
        raise EvidenceError(f"GitHub request failed: {err}") from err
    if resp.status_code == 404:
        raise EvidenceError("GitHub resource not found (404)")
    if resp.status_code == 403 and "rate limit" in resp.text.lower():
        raise EvidenceError(
            "GitHub API rate limit exceeded. Configure GITHUB_TOKEN server-side for a higher limit."
        )
    if resp.status_code >= 400:
        raise EvidenceError(f"GitHub API error {resp.status_code}")
    try:
        return resp.json()
    except json.JSONDecodeError as err:
        raise EvidenceError("GitHub returned invalid JSON") from err


def fetch_repository(owner: str, repo: str) -> dict:
    with httpx.Client(headers=_headers()) as client:
        data = _get(client, f"{GITHUB_API}/repos/{owner}/{repo}")
    return {
        "full_name": data.get("full_name", f"{owner}/{repo}"),
        "description": (data.get("description") or "")[:300],
        "default_branch": data.get("default_branch", ""),
        "stargazers_count": data.get("stargazers_count", 0),
        "html_url": data.get("html_url", f"https://github.com/{owner}/{repo}"),
    }


def fetch_pr_evidence(owner: str, repo: str, number: int) -> dict:
    """Fetch and normalize the evidence bundle for a pull request."""
    with httpx.Client(headers=_headers()) as client:
        pr = _get(client, f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}")
        try:
            commits = _get(
                client, f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}/commits"
            )
        except EvidenceError:
            commits = []

    if not isinstance(pr, dict) or "number" not in pr:
        raise EvidenceError("Pull request payload was not recognized")
    if not isinstance(commits, list):
        commits = []

    body = pr.get("body") or ""
    if not isinstance(body, str):
        body = ""
    messages = []
    for c in commits[:10]:
        try:
            messages.append(c["commit"]["message"].split("\n")[0][:160])
        except (KeyError, TypeError, AttributeError):
            continue

    # Same field set the contract stores on-chain (volatile `updated_at` excluded).
    return {
        "repository": f"https://github.com/{owner}/{repo}",
        "pr_number": str(pr.get("number", "")),
        "pr_title": str(pr.get("title", ""))[:200],
        "pr_state": str(pr.get("state", "")),
        "pr_merged": bool(pr.get("merged_at")),
        "pr_author": str((pr.get("user") or {}).get("login", "")),
        "pr_created_at": str(pr.get("created_at", "")),
        "pr_merged_at": str(pr.get("merged_at") or ""),
        "head_sha": str((pr.get("head") or {}).get("sha", ""))[:40],
        "base_ref": str((pr.get("base") or {}).get("ref", "")),
        "commit_count": str(pr.get("commits", "")),
        "changed_files": str(pr.get("changed_files", "")),
        "additions": str(pr.get("additions", "")),
        "deletions": str(pr.get("deletions", "")),
        "body_excerpt": body[:1500],
        "commit_messages": " | ".join(messages)[:1200],
        "pr_url": f"https://github.com/{owner}/{repo}/pull/{number}",
        "html_url": pr.get("html_url", f"https://github.com/{owner}/{repo}/pull/{number}"),
    }


def evidence_is_empty(evidence: Optional[dict]) -> bool:
    if not evidence:
        return True
    return not evidence.get("pr_title")
