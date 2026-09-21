"""Validation tests: these mirror the rules enforced by the contract."""
import time

import pytest

from backend.app.validation import (
    ValidationError,
    validate_criteria,
    validate_deadline,
    validate_description,
    validate_issue_url,
    validate_pr_url,
    validate_repository_url,
    validate_title,
)

NOW = int(time.time())


class TestRepositoryUrl:
    def test_valid(self):
        ref = validate_repository_url("https://github.com/acme/dashboard")
        assert ref.slug == "acme/dashboard"

    def test_valid_with_trailing_slash(self):
        ref = validate_repository_url("https://github.com/acme/dashboard/")
        assert ref.slug == "acme/dashboard"

    def test_rejects_non_github(self):
        with pytest.raises(ValidationError):
            validate_repository_url("https://gitlab.com/acme/dashboard")

    def test_rejects_http(self):
        with pytest.raises(ValidationError):
            validate_repository_url("http://github.com/acme/dashboard")

    def test_rejects_extra_path(self):
        with pytest.raises(ValidationError):
            validate_repository_url("https://github.com/acme/dashboard/tree/main")

    def test_rejects_empty_repo(self):
        with pytest.raises(ValidationError):
            validate_repository_url("https://github.com/acme/")


class TestPrUrl:
    def test_valid(self):
        ref, number = validate_pr_url("https://github.com/acme/dashboard/pull/184")
        assert ref.slug == "acme/dashboard"
        assert number == 184

    def test_must_match_repo(self):
        with pytest.raises(ValidationError) as exc:
            validate_pr_url(
                "https://github.com/other/repo/pull/184",
                "https://github.com/acme/dashboard",
            )
        assert exc.value.field == "pr_url"

    def test_rejects_issue_url(self):
        with pytest.raises(ValidationError):
            validate_pr_url("https://github.com/acme/dashboard/issues/184")

    def test_rejects_non_numeric(self):
        with pytest.raises(ValidationError):
            validate_pr_url("https://github.com/acme/dashboard/pull/abc")


class TestTitle:
    def test_valid(self):
        assert validate_title("Persistent dark mode") == "Persistent dark mode"

    def test_strips(self):
        assert validate_title("  Trim me  ") == "Trim me"

    def test_too_short(self):
        with pytest.raises(ValidationError):
            validate_title("abc")

    def test_too_long(self):
        with pytest.raises(ValidationError):
            validate_title("x" * 121)


class TestCriteria:
    def test_valid(self):
        out = validate_criteria(["Dark mode accessible from Settings.", "Preference persists."])
        assert len(out) == 2

    def test_drops_blanks(self):
        assert validate_criteria(["A valid criterion text.", "   "]) == ["A valid criterion text."]

    def test_requires_list(self):
        with pytest.raises(ValidationError):
            validate_criteria("not a list")

    def test_max_criteria(self):
        with pytest.raises(ValidationError):
            validate_criteria([f"A valid criterion text {i}" for i in range(13)])

    def test_criterion_length(self):
        with pytest.raises(ValidationError):
            validate_criteria(["shrt"])
        with pytest.raises(ValidationError):
            validate_criteria(["x" * 301])


class TestDeadline:
    def test_valid(self):
        assert validate_deadline(NOW + 86400, NOW) == NOW + 86400

    def test_past(self):
        with pytest.raises(ValidationError):
            validate_deadline(NOW - 10, NOW)

    def test_too_far(self):
        with pytest.raises(ValidationError):
            validate_deadline(NOW + 63072001, NOW)

    def test_non_numeric(self):
        with pytest.raises(ValidationError):
            validate_deadline("tomorrow", NOW)


class TestDescription:
    def test_valid(self):
        assert validate_description("  Build the thing. ") == "Build the thing."

    def test_too_long(self):
        with pytest.raises(ValidationError):
            validate_description("x" * 4001)


class TestIssueUrl:
    def test_empty_ok(self):
        assert validate_issue_url("") == ""
        assert validate_issue_url(None) == ""

    def test_valid(self):
        url = "https://github.com/acme/dashboard/issues/42"
        assert validate_issue_url(url) == url

    def test_non_github_rejected(self):
        with pytest.raises(ValidationError):
            validate_issue_url("https://example.com/42")
