"""Opening a site by the name a person would use.

"открой ютуб" produced open_site(url="youtube"), which the endpoint rejected
as an unsafe scheme, so the user saw an error for a request that should just
work. Normalisation happens server-side so every caller benefits, and the
scheme check that blocks file:// and UNC paths stays in front of it.
"""

from __future__ import annotations

import pytest

from openeidon.server.routes import _safe_open_url, normalize_web_target


class TestNormalizeWebTarget:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("youtube.com", "https://youtube.com"),
            ("github.com/user/repo", "https://github.com/user/repo"),
            ("www.youtube.com", "https://www.youtube.com"),
            ("  youtube.com  ", "https://youtube.com"),
        ],
    )
    def test_domains_gain_a_scheme(self, raw, expected):
        assert normalize_web_target(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        ["https://youtube.com", "http://localhost:8000/health"],
    )
    def test_explicit_scheme_is_left_alone(self, raw):
        assert normalize_web_target(raw) == raw

    def test_bare_word_becomes_a_search_not_a_guessed_domain(self):
        result = normalize_web_target("youtube")
        assert result.startswith("https://duckduckgo.com/?q=")
        assert "youtube" in result

    def test_phrase_becomes_a_search(self):
        result = normalize_web_target("что нового в мире")
        assert result.startswith("https://duckduckgo.com/?q=")

    def test_empty_stays_empty(self):
        assert normalize_web_target("   ") == ""

    def test_trailing_dot_is_not_a_domain(self):
        assert normalize_web_target("youtube.").startswith("https://duckduckgo.com/")


class TestSchemeGuardStillApplies:
    @pytest.mark.parametrize("raw", ["file:///C:/secret.txt", "ftp://example.com"])
    def test_non_web_schemes_are_blocked(self, raw):
        normalized = normalize_web_target(raw)
        with pytest.raises(ValueError, match="unsafe URL scheme"):
            _safe_open_url(normalized)

    def test_unc_path_never_reaches_the_share(self):
        """A UNC path carries no scheme, so it normalises to a search; the
        share itself is never opened."""
        from urllib.parse import urlparse

        parsed = urlparse(normalize_web_target(r"\\server\share"))
        assert parsed.scheme == "https"
        assert parsed.netloc == "duckduckgo.com"

    def test_normalisation_never_produces_a_non_web_scheme(self):
        from urllib.parse import urlparse

        for raw in ("youtube", "youtube.com", "что-то", "a b c"):
            normalized = normalize_web_target(raw)
            assert urlparse(normalized).scheme in {"https", "http"}
