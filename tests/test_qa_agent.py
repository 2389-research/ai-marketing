"""
Tests for the QA agent's pure (no-DB, no-API) functions.

Run from the project root:
    python -m pytest tests/ -v
"""

import sys
import os
import pytest

# Make sure project root is on the path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.qa_agent import (
    _check_banned_phrases,
    _check_char_limits,
    similarity_ratio,
    find_similar,
)


# ── banned phrases ─────────────────────────────────────────────────────────────

class TestBannedPhrases:
    def test_single_banned_phrase_detected(self):
        result = _check_banned_phrases("This is a game-changer for the industry.")
        assert any("game-changer" in issue for issue in result)

    def test_multiple_banned_phrases_detected(self):
        result = _check_banned_phrases("A revolutionary cutting-edge solution.")
        assert len(result) == 2

    def test_banned_phrase_case_insensitive(self):
        result = _check_banned_phrases("This will LEVERAGE your workflow.")
        assert any("leverage" in issue.lower() for issue in result)

    def test_clean_text_no_issues(self):
        result = _check_banned_phrases(
            "Jeff runs entirely on your machine. No cloud calls. Your data stays local."
        )
        assert result == []

    def test_partial_word_not_flagged(self):
        # "lever" is not a banned phrase, "leverage" is
        result = _check_banned_phrases("She pulled the lever down.")
        assert result == []


# ── character limits ───────────────────────────────────────────────────────────

class TestCharLimits:
    def test_x_over_limit_is_issue(self):
        long_post = "a" * 300   # X limit is 280
        issues, warnings = _check_char_limits(long_post, "x")
        assert issues
        assert not warnings

    def test_x_within_limit_is_clean(self):
        short_post = "a" * 100
        issues, warnings = _check_char_limits(short_post, "x")
        assert not issues
        assert not warnings

    def test_x_approaching_limit_is_warning(self):
        # 85% of 280 = 238; 260 chars is 93%
        approaching = "a" * 260
        issues, warnings = _check_char_limits(approaching, "x")
        assert not issues
        assert warnings

    def test_linkedin_over_limit(self):
        long_post = "a" * 3001
        issues, _ = _check_char_limits(long_post, "linkedin")
        assert issues

    def test_linkedin_within_limit(self):
        post = "a" * 200
        issues, warnings = _check_char_limits(post, "linkedin")
        assert not issues
        assert not warnings

    def test_instagram_over_limit(self):
        post = "a" * 2201   # Instagram limit is 2200
        issues, _ = _check_char_limits(post, "instagram")
        assert issues

    def test_tiktok_over_limit(self):
        post = "a" * 2300   # TikTok limit is 2200
        issues, _ = _check_char_limits(post, "tiktok")
        assert issues

    def test_email_no_limit(self):
        # Email has no hard platform limit — should never block
        very_long = "a" * 10_000
        issues, warnings = _check_char_limits(very_long, "email")
        assert not issues
        assert not warnings

    def test_youtube_no_limit(self):
        very_long = "a" * 10_000
        issues, warnings = _check_char_limits(very_long, "youtube")
        assert not issues
        assert not warnings

    def test_error_message_contains_actual_length(self):
        post = "a" * 300
        issues, _ = _check_char_limits(post, "x")
        assert "300" in issues[0]


# ── similarity detection ───────────────────────────────────────────────────────

class TestSimilarityRatio:
    def test_identical_text_is_1(self):
        text = "Jeff runs locally. Your data stays private."
        assert similarity_ratio(text, text) == pytest.approx(1.0)

    def test_completely_different_text_is_low(self):
        a = "Jeff is a local AI agent for developers who care about privacy."
        b = "The quarterly earnings report showed a 12% increase in revenue."
        assert similarity_ratio(a, b) < 0.3

    def test_minor_wording_change_is_high(self):
        a = "Jeff is a local AI agent that runs on your machine."
        b = "Jeff is a local AI tool that runs on your machine."
        assert similarity_ratio(a, b) > 0.85

    def test_same_content_different_order_is_moderate(self):
        a = "Privacy first. No API calls. Runs on your device."
        b = "Runs on your device. No API calls. Privacy first."
        # difflib is order-sensitive — reordered sentences score lower than expected intuitively
        # but still clearly above unrelated text (which scores < 0.3)
        ratio = similarity_ratio(a, b)
        assert 0.3 < ratio < 1.0

    def test_comparison_is_case_insensitive(self):
        a = "JEFF RUNS LOCALLY"
        b = "jeff runs locally"
        assert similarity_ratio(a, b) == pytest.approx(1.0)

    def test_comparison_ignores_leading_trailing_whitespace(self):
        a = "  Jeff runs locally.  "
        b = "Jeff runs locally."
        assert similarity_ratio(a, b) == pytest.approx(1.0)


class TestFindSimilar:
    def test_near_duplicate_is_blocked(self):
        draft    = "Jeff is a local AI agent that runs entirely on your machine."
        existing = ["Jeff is a local AI agent that runs entirely on your computer."]
        issues, warnings = find_similar(draft, existing)
        assert issues    # should be a hard block
        assert not warnings

    def test_moderately_similar_is_warning(self):
        draft    = "Why developers choose local AI: privacy, cost, and speed."
        existing = ["Why engineers choose on-device AI: privacy, cost savings, and performance."]
        issues, warnings = find_similar(draft, existing)
        # Exact result depends on ratio; at minimum there should be SOME signal
        assert issues or warnings

    def test_unique_post_passes_clean(self):
        draft = (
            "MCP (Model Context Protocol) is quietly becoming the standard for "
            "connecting AI agents to tools. Here's what that means for local workflows."
        )
        existing = [
            "Jeff runs entirely on your machine — no cloud, no API bills.",
            "The hidden cost of cloud AI: your codebase is their training data.",
        ]
        issues, warnings = find_similar(draft, existing)
        assert not issues
        assert not warnings

    def test_empty_pool_is_clean(self):
        draft = "Any post text at all."
        issues, warnings = find_similar(draft, [])
        assert not issues
        assert not warnings

    def test_multiple_existing_posts_all_checked(self):
        draft = "Jeff is a local AI agent that runs on your machine."
        existing = [
            "Something completely unrelated about weather.",
            "Jeff is a local AI agent that runs on your machine.",  # exact duplicate
        ]
        issues, warnings = find_similar(draft, existing)
        assert issues   # the exact duplicate should trigger a block
