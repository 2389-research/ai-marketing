#!/usr/bin/env python3
# list_buffer_profiles.py
# Run this once after adding BUFFER_ACCESS_TOKEN to .env.
# It prints all your connected Buffer profiles and their IDs.
# Copy the IDs you need into .env.
#
# Usage:
#   python list_buffer_profiles.py

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

token = os.environ.get("BUFFER_ACCESS_TOKEN")
if not token:
    print("BUFFER_ACCESS_TOKEN not set in .env — add it first.")
    raise SystemExit(1)

r = httpx.get(
    "https://api.bufferapp.com/1/profiles.json",
    params={"access_token": token},
    timeout=10,
)
r.raise_for_status()

profiles = r.json()

if not profiles:
    print("No profiles found. Connect your social accounts in Buffer first.")
    raise SystemExit(0)

print("\nYour Buffer profiles:\n")
print(f"  {'SERVICE':<14} {'USERNAME':<32} ID")
print(f"  {'-'*14} {'-'*32} {'-'*30}")
for p in profiles:
    service = p.get("service", "unknown").upper()
    username = p.get("service_username", "")
    pid = p.get("id", "")
    print(f"  {service:<14} {username:<32} {pid}")

print("\nAdd the relevant IDs to your .env:\n")
print("  BUFFER_LINKEDIN_PROFILE_ID=...")
print("  BUFFER_INSTAGRAM_PROFILE_ID=...")
print("  BUFFER_TIKTOK_PROFILE_ID=...")
