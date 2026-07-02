#!/usr/bin/env python3
"""
generate_music.py

Generates the three background music tracks using MusicGen via Replicate.
Run once — tracks are saved to music/ and reused for every clip.

Usage:
  python generate_music.py
"""

import os
import sys
import urllib.request
from dotenv import load_dotenv

load_dotenv()

MUSIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music")

STYLES = {
    "upbeat": (
        "upbeat energetic electronic background music, driving beat, "
        "no vocals, motivational, positive, 120bpm"
    ),
    "calm": (
        "calm ambient background music, soft piano and strings, "
        "no vocals, peaceful, gentle, relaxing"
    ),
    "cinematic": (
        "cinematic orchestral background music, dramatic, epic, "
        "no vocals, inspiring, film score style"
    ),
}

DURATION = 60  # seconds — long enough for any clip, loops for shorter ones


def generate(style: str, prompt: str, api_token: str) -> str:
    import replicate

    out_path = os.path.join(MUSIC_DIR, f"{style}.mp3")

    if os.path.exists(out_path):
        print(f"  [{style}] already exists — skipping (delete to regenerate)")
        return out_path

    print(f"  [{style}] generating {DURATION}s track...")
    print(f"           prompt: {prompt[:70]}...")

    client = replicate.Client(api_token=api_token)
    output = client.run(
        "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
        input={
            "prompt":              prompt,
            "duration":            DURATION,
            "model_version":       "stereo-large",
            "output_format":       "mp3",
            "normalization_strategy": "peak",
        },
    )

    # output is a URL string
    url = str(output)
    print(f"           downloading from Replicate...")
    urllib.request.urlretrieve(url, out_path)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"           saved → music/{style}.mp3  ({size_kb}KB)")
    return out_path


def main():
    api_token = os.getenv("REPLICATE_API_TOKEN")
    if not api_token:
        print("Error: REPLICATE_API_TOKEN not set in .env")
        print("Get a free token at https://replicate.com/account/api-tokens")
        sys.exit(1)

    os.makedirs(MUSIC_DIR, exist_ok=True)
    print(f"Generating {len(STYLES)} music tracks into music/\n")

    for style, prompt in STYLES.items():
        try:
            generate(style, prompt, api_token)
        except Exception as e:
            print(f"  [{style}] FAILED: {e}")

    print("\nDone. Tracks ready to use in the video editor.")


if __name__ == "__main__":
    main()
