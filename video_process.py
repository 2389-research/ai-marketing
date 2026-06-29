#!/usr/bin/env python3
"""
video_process.py

Usage:
  python video_process.py analyze <video_url> <target_duration_seconds>
  python video_process.py clip <video_url> <start> <end> <aspect_ratio> <captions_json_or_false>

Outputs JSON to stdout. Logs to stderr.
"""

import os
import sys
import json
import subprocess
import tempfile
import time
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg):
    print(f"[video] {msg}", file=sys.stderr, flush=True)


def download(url: str, dest: str):
    log(f"Downloading {url[:60]}...")
    r = requests.get(url, stream=True, timeout=300)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(65536):
            f.write(chunk)
    log(f"Downloaded {os.path.getsize(dest) // 1024}KB")


def get_duration(video_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True, check=True
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def extract_audio(video_path: str, audio_path: str):
    log("Extracting audio...")
    subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", audio_path, "-y"],
        check=True, capture_output=True
    )


def transcribe(audio_path: str) -> dict:
    log("Transcribing with Whisper...")
    size_mb = os.path.getsize(audio_path) / 1024 / 1024
    log(f"Audio size: {size_mb:.1f}MB")
    with open(audio_path, "rb") as f:
        result = openai.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    return result


def find_best_segments(transcript_segments: list, target_duration: int, video_duration: float) -> list:
    log("Finding best moments with GPT...")
    seg_text = "\n".join(
        f"[{s['start']:.1f}s–{s['end']:.1f}s] {s['text'].strip()}"
        for s in transcript_segments
    )
    prompt = f"""You are a social media video editor. Find the 4 most compelling, shareable moments in this transcript.

Video duration: {video_duration:.0f}s | Target clip length: {target_duration}s

Transcript:
{seg_text}

Rules:
- Each clip must be ~{target_duration}s (start to end)
- Always end on a complete sentence or thought
- Pick moments that are insightful, funny, emotional, or surprising
- Do NOT overlap clips

Return ONLY this JSON (no extra text):
{{"segments":[{{"start":12.5,"end":42.5,"reason":"One sentence on why this is great","preview":"Quote from transcript..."}}]}}"""

    resp = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=800,
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("segments", [])


def build_srt(transcript_segments: list, clip_start: float) -> str:
    lines = []
    idx = 1
    for seg in transcript_segments:
        s = seg["start"] - clip_start
        e = seg["end"] - clip_start
        if e <= 0:
            continue
        s = max(0.0, s)

        def fmt(t):
            h = int(t // 3600)
            m = int((t % 3600) // 60)
            sec = t % 60
            return f"{h:02d}:{m:02d}:{int(sec):02d},{int((sec % 1) * 1000):03d}"

        lines.append(f"{idx}\n{fmt(s)} --> {fmt(e)}\n{seg['text'].strip()}\n")
        idx += 1
    return "\n".join(lines)


def upload_to_supabase(file_path: str, bucket: str, dest_path: str) -> str:
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    with open(file_path, "rb") as f:
        sb.storage.from_(bucket).upload(dest_path, f, {"content-type": "video/mp4"})
    return sb.storage.from_(bucket).get_public_url(dest_path)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_analyze(video_url: str, target_duration: int):
    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "video.mp4")
        audio_path = os.path.join(tmp, "audio.mp3")

        download(video_url, video_path)
        duration = get_duration(video_path)
        log(f"Duration: {duration:.1f}s")

        extract_audio(video_path, audio_path)
        transcript = transcribe(audio_path)

        segments = getattr(transcript, "segments", None) or []
        full_text = getattr(transcript, "text", "") or ""

        if not full_text.strip():
            # No speech — offer manual trimming
            result = {
                "duration": duration,
                "transcript_segments": [],
                "segments": [{
                    "start": 0,
                    "end": min(target_duration, duration),
                    "reason": "No speech detected. Adjust start/end times manually below.",
                    "preview": "(No transcript available)",
                }],
            }
        else:
            seg_dicts = [{"start": s.start, "end": s.end, "text": s.text} for s in segments]
            best = find_best_segments(seg_dicts, target_duration, duration)
            result = {
                "duration": duration,
                "transcript_segments": seg_dicts,
                "segments": best,
            }

        print(json.dumps(result))


def cmd_clip(video_url: str, start: float, end: float, aspect_ratio: str, captions_json: str):
    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "source.mp4")
        clip_path  = os.path.join(tmp, "clip.mp4")
        duration   = end - start

        download(video_url, video_path)

        # Build video filter
        if aspect_ratio == "9:16":
            vf = "crop=ih*9/16:ih,scale=1080:1920"
        elif aspect_ratio == "1:1":
            vf = "crop=ih:ih,scale=1080:1080"
        else:
            vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2"

        transcript_segs = None
        if captions_json and captions_json != "false":
            try:
                transcript_segs = json.loads(captions_json)
            except Exception:
                pass

        if transcript_segs:
            srt = build_srt(transcript_segs, start)
            srt_path = os.path.join(tmp, "captions.srt")
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt)
            escaped = srt_path.replace("\\", "/").replace(":", "\\:")
            vf += (
                f",subtitles='{escaped}'"
                ":force_style='FontSize=22,FontName=Arial,"
                "PrimaryColour=&Hffffff,OutlineColour=&H000000,"
                "Outline=2,Bold=1,Alignment=2,MarginV=40'"
            )

        log(f"Generating clip {start:.1f}s–{end:.1f}s, aspect={aspect_ratio}...")
        cmd = [
            "ffmpeg", "-i", video_path,
            "-ss", str(start), "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            clip_path, "-y",
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        log("Clip generated, uploading...")

        dest = f"clip_{int(time.time())}.mp4"
        clip_url = upload_to_supabase(clip_path, "video-clips", dest)

        print(json.dumps({"clip_url": clip_url, "storage_path": dest}))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    command = sys.argv[1]
    if command == "analyze":
        cmd_analyze(sys.argv[2], int(sys.argv[3]))
    elif command == "clip":
        cmd_clip(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], sys.argv[6])
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)
