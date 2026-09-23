"""
Tests for the X/Twitter cookie boundary in the last30days agent.

The app's login secret and the X session cookie were both named AUTH_TOKEN and
lived in the same process environment (issue #20). These tests pin the rename so
the collision cannot come back.

Run from the project root:
    python -m pytest tests/ -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.last30days_agent import x_cookie_overrides


class TestXCookieOverrides:
    def test_x_auth_token_is_renamed_to_auth_token(self):
        out = x_cookie_overrides({"X_AUTH_TOKEN": "x-cookie", "CT0": "ct0-value"})
        assert out["AUTH_TOKEN"] == "x-cookie"
        assert out["CT0"] == "ct0-value"

    def test_app_login_secret_never_reaches_the_subprocess(self):
        """The regression that issue #20 is about.

        AUTH_TOKEN is set in the real environment as the app's login password.
        The subprocess must not receive it.
        """
        out = x_cookie_overrides({"AUTH_TOKEN": "the-app-login-password"})
        assert out["AUTH_TOKEN"] == ""

    def test_app_login_secret_does_not_win_when_x_cookie_is_present(self):
        out = x_cookie_overrides({
            "AUTH_TOKEN": "the-app-login-password",
            "X_AUTH_TOKEN": "x-cookie",
        })
        assert out["AUTH_TOKEN"] == "x-cookie"

    def test_auth_token_is_always_present_so_it_overwrites_the_inherited_value(self):
        """Returning no key at all would let os.environ's AUTH_TOKEN through."""
        assert "AUTH_TOKEN" in x_cookie_overrides({})
        assert "CT0" in x_cookie_overrides({})

    def test_empty_environment_yields_empty_cookies(self):
        assert x_cookie_overrides({}) == {"AUTH_TOKEN": "", "CT0": ""}
