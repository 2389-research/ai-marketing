#!/usr/bin/env python3
"""
Run this once to get a valid Buffer access token.

Steps:
  1. python get_buffer_token.py
  2. Browser opens — click Authorize
  3. Browser will redirect to a page that fails to load — that's fine
  4. Copy the full URL from the browser address bar and paste it here
  5. Token is saved to .env automatically
"""

import os
import re
import webbrowser
import urllib.parse
from dotenv import load_dotenv
import requests

load_dotenv()

CLIENT_ID     = os.getenv("BUFFER_CLIENT_ID", "").strip()
CLIENT_SECRET = os.getenv("BUFFER_CLIENT_SECRET", "").strip()
REDIRECT_URI  = "https://localhost:8080/callback"

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: Set BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET in your .env first.")
    exit(1)


def save_env(key: str, value: str):
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    content  = open(env_path).read()
    pattern  = rf'{key}="[^"]*"'
    new_line = f'{key}="{value}"'
    if re.search(pattern, content):
        content = re.sub(pattern, new_line, content)
    else:
        content += f"\n{new_line}\n"
    open(env_path, "w").write(content)


def main():
    auth_url = (
        "https://bufferapp.com/oauth2/authorize"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={urllib.parse.quote(REDIRECT_URI, safe='')}"
        "&response_type=code"
    )

    print("Opening Buffer authorization page in your browser...")
    print(f"\nIf it doesn't open, go to:\n{auth_url}\n")
    webbrowser.open(auth_url)

    print("After you click Authorize, your browser will redirect to a page that")
    print("fails to load (because https://localhost doesn't exist). That's normal.")
    print("\nCopy the FULL URL from the address bar and paste it below.")
    print("It will look like: https://localhost:8080/callback?code=XXXX\n")

    raw = input("Paste the full redirect URL here: ").strip()

    parsed = urllib.parse.urlparse(raw)
    params = urllib.parse.parse_qs(parsed.query)
    auth_code = params.get("code", [None])[0]

    if not auth_code:
        print(f"Could not find 'code' in the URL you pasted: {raw}")
        return

    print(f"\nGot code. Exchanging for access token...")
    resp = requests.post(
        "https://api.bufferapp.com/1/oauth2/token.json",
        data={
            "client_id":     CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri":  REDIRECT_URI,
            "code":          auth_code,
            "grant_type":    "authorization_code",
        },
        timeout=30,
    )

    if resp.status_code != 200:
        print(f"\nToken exchange failed: {resp.status_code}")
        print(f"Response: {resp.text}")
        return

    token = resp.json().get("access_token")
    if not token:
        print(f"No access_token in response: {resp.json()}")
        return

    print(f"\nAccess token: {token}")
    save_env("BUFFER_ACCESS_TOKEN", token)
    print("Saved to .env.")

    # Fetch profiles and save LinkedIn ID
    profiles_resp = requests.get(
        f"https://api.bufferapp.com/1/profiles.json?access_token={token}",
        timeout=30,
    )
    if not profiles_resp.ok:
        print(f"Could not fetch profiles: {profiles_resp.text}")
        return

    profiles = profiles_resp.json()
    print("\nYour Buffer profiles:")
    for p in profiles:
        print(f"  service={p.get('service'):<12} id={p.get('id')}  name={p.get('formatted_username', '')}")

    linkedin = next((p for p in profiles if p.get("service") == "linkedin"), None)
    if linkedin:
        lid = linkedin["id"]
        save_env("BUFFER_LINKEDIN_PROFILE_ID", lid)
        print(f"\nLinkedIn profile ID saved to .env: {lid}")
        print("\nAll done! Run: python cron_post.py")
    else:
        print("\nNo LinkedIn profile found in Buffer. Make sure LinkedIn is connected in Buffer.")


if __name__ == "__main__":
    main()
