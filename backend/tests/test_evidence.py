"""Evidence normalization tests: the GitHub payload -> normalized bundle mapping."""
import pytest

from backend.app import evidence as ev


SAMPLE_PR = {
    "number": 1766,
    "title": "fix(rpc): prevent Studio database-pool starvation (v0.121 hotfix)",
    "state": "closed",
    "body": "## Problem\nHotfix for pool starvation.",
    "user": {"login": "MuncleUscles"},
    "created_at": "2026-09-14T17:10:12Z",
    "merged_at": "2026-09-14T18:11:57Z",
    "head": {"sha": "e8208389451cfe9ba392b4726bb0b56d928f24a7"},
    "base": {"ref": "v0.121"},
    "commits": 2,
    "changed_files": 8,
    "additions": 679,
    "deletions": 32,
    "html_url": "https://github.com/genlayerlabs/genlayer-studio/pull/1766",
}

SAMPLE_COMMITS = [
    {"commit": {"message": "fix(rpc): prevent database pool waits from stalling Studio\n\nbody..."}},
    {"commit": {"message": "test(explorer): remove optional HTTP client requirement"}},
]


def test_normalize_pr_evidence(monkeypatch):
    """Normalization keeps the exact field set the contract stores on-chain."""
    calls = []

    def fake_get(client, url):
        calls.append(url)
        if url.endswith("/pulls/1766"):
            return SAMPLE_PR
        if url.endswith("/pulls/1766/commits"):
            return SAMPLE_COMMITS
        raise AssertionError(f"unexpected url {url}")

    monkeypatch.setattr(ev.httpx.Client, "get", lambda self, url, timeout=None: _Resp(200, url))
    monkeypatch.setattr(ev, "_get", fake_get)

    result = ev.fetch_pr_evidence("genlayerlabs", "genlayer-studio", 1766)

    assert result["pr_number"] == "1766"
    assert result["pr_title"].startswith("fix(rpc)")
    assert result["pr_state"] == "closed"
    assert result["pr_merged"] is True
    assert result["pr_author"] == "MuncleUscles"
    assert result["head_sha"] == SAMPLE_PR["head"]["sha"][:40]
    assert result["base_ref"] == "v0.121"
    assert result["commit_count"] == "2"
    assert result["changed_files"] == "8"
    assert result["additions"] == "679"
    assert result["deletions"] == "32"
    assert "pool starvation" in result["body_excerpt"]
    assert "fix(rpc): prevent database pool waits" in result["commit_messages"]
    assert "test(explorer)" in result["commit_messages"]
    assert result["repository"] == "https://github.com/genlayerlabs/genlayer-studio"
    # volatile field excluded (would break cross-validator strict_eq)
    assert "updated_at" not in result


def test_normalize_handles_missing_body(monkeypatch):
    pr = dict(SAMPLE_PR)
    pr["body"] = None

    def fake_get(client, url):
        return pr if url.endswith("/pulls/1766") else []

    monkeypatch.setattr(ev, "_get", fake_get)
    result = ev.fetch_pr_evidence("genlayerlabs", "genlayer-studio", 1766)
    assert result["body_excerpt"] == ""


def test_404_raises_evidence_error(monkeypatch):
    def fake_get(client, url):
        raise ev.EvidenceError("GitHub resource not found (404)")

    monkeypatch.setattr(ev, "_get", fake_get)
    with pytest.raises(ev.EvidenceError):
        ev.fetch_pr_evidence("genlayerlabs", "genlayer-studio", 999999)


def test_commits_fetch_failure_is_nonfatal(monkeypatch):
    def fake_get(client, url):
        if url.endswith("/commits"):
            raise ev.EvidenceError("boom")
        return SAMPLE_PR

    monkeypatch.setattr(ev, "_get", fake_get)
    result = ev.fetch_pr_evidence("genlayerlabs", "genlayer-studio", 1766)
    assert result["commit_messages"] == ""
    assert result["commit_count"] == "2"


class _Resp:
    """Minimal stand-in for httpx.Response in the monkeypatched client."""

    def __init__(self, status_code, url):
        self.status_code = status_code
        self.url = url
        self.text = ""
