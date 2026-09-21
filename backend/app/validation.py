"""Server-side validation for BountyProof inputs.

Nothing here trusts client-provided decisions or evidence: these checks only gate
what may be submitted to the contract or fetched from GitHub. The authoritative
adjudication always happens inside the Intelligent Contract.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

GITHUB_REPO_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?$")
GITHUB_PR_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/pull/(\d+)/?$"
)
ETH_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")

MAX_TITLE = 120
MIN_TITLE = 5
MAX_DESCRIPTION = 4000
MAX_CRITERIA = 12
MIN_CRITERION = 5
MAX_CRITERION = 300
MAX_URL = 300
TWO_YEARS_S = 63072000


class ValidationError(Exception):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


@dataclass
class RepoRef:
    owner: str
    repo: str

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}"


def validate_repository_url(url: str) -> RepoRef:
    if not isinstance(url, str) or len(url) > MAX_URL:
        raise ValidationError("repository_url", "Repository URL is too long")
    m = GITHUB_REPO_RE.match(url.strip())
    if not m:
        raise ValidationError(
            "repository_url",
            "Repository URL must look like https://github.com/owner/repo",
        )
    return RepoRef(owner=m.group(1), repo=m.group(2))


def validate_pr_url(pr_url: str, repository_url: str | None = None) -> tuple[RepoRef, int]:
    if not isinstance(pr_url, str) or len(pr_url) > MAX_URL:
        raise ValidationError("pr_url", "Pull request URL is too long")
    m = GITHUB_PR_RE.match(pr_url.strip())
    if not m:
        raise ValidationError(
            "pr_url",
            "PR URL must look like https://github.com/owner/repo/pull/123",
        )
    ref = RepoRef(owner=m.group(1), repo=m.group(2))
    number = int(m.group(3))
    if repository_url is not None:
        repo_ref = validate_repository_url(repository_url)
        if repo_ref.slug.lower() != ref.slug.lower():
            raise ValidationError(
                "pr_url", "PR must belong to the bounty repository"
            )
    return ref, number


def validate_title(title: str) -> str:
    if not isinstance(title, str):
        raise ValidationError("title", "Title must be a string")
    title = title.strip()
    if len(title) < MIN_TITLE or len(title) > MAX_TITLE:
        raise ValidationError(
            "title", f"Title must be between {MIN_TITLE} and {MAX_TITLE} characters"
        )
    return title


def validate_description(description: str) -> str:
    if not isinstance(description, str):
        raise ValidationError("description", "Description must be a string")
    if len(description) > MAX_DESCRIPTION:
        raise ValidationError("description", "Description is too long")
    return description.strip()


def validate_criteria(criteria: list) -> list[str]:
    if not isinstance(criteria, list):
        raise ValidationError("criteria", "Criteria must be a list")
    cleaned = [c.strip() for c in criteria if isinstance(c, str) and c.strip()]
    if len(cleaned) < 1 or len(cleaned) > MAX_CRITERIA:
        raise ValidationError(
            "criteria", f"Provide between 1 and {MAX_CRITERIA} acceptance criteria"
        )
    for c in cleaned:
        if len(c) < MIN_CRITERION or len(c) > MAX_CRITERION:
            raise ValidationError(
                "criteria",
                f"Each criterion must be between {MIN_CRITERION} and {MAX_CRITERION} characters",
            )
    return cleaned


def validate_deadline(deadline_ts: int, now_ts: int) -> int:
    try:
        deadline = int(deadline_ts)
    except (TypeError, ValueError):
        raise ValidationError("deadline", "Deadline must be a unix timestamp")
    if deadline <= now_ts:
        raise ValidationError("deadline", "Deadline must be in the future")
    if deadline > now_ts + TWO_YEARS_S:
        raise ValidationError("deadline", "Deadline must be within two years")
    return deadline


def validate_issue_url(issue_url: str) -> str:
    if issue_url is None:
        return ""
    if not isinstance(issue_url, str):
        raise ValidationError("issue_url", "Reference URL must be a string")
    issue_url = issue_url.strip()
    if not issue_url:
        return ""
    if len(issue_url) > MAX_URL or not issue_url.startswith("https://github.com/"):
        raise ValidationError("issue_url", "Reference URL must be a GitHub URL")
    return issue_url


def validate_address(address: str, field: str = "address") -> str:
    if not isinstance(address, str) or not ETH_ADDRESS_RE.match(address):
        raise ValidationError(field, "Invalid wallet address")
    return address


def validate_bounty_id(bounty_id) -> int:
    try:
        bid = int(bounty_id)
    except (TypeError, ValueError):
        raise ValidationError("bounty_id", "Bounty id must be an integer")
    if bid < 1:
        raise ValidationError("bounty_id", "Bounty id must be positive")
    return bid
