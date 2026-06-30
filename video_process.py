#!/usr/bin/env python3
"""
video_process.py

Usage:
  python video_process.py analyze    <video_url> <target_duration>
  python video_process.py clip       <video_url> <start> <end> <aspect_ratio> <captions_json> <options_json>
  python video_process.py batch_clip <video_url> <segments_json> <aspect_ratio> <captions_json> <options_json>

options_json keys:
  fade        bool   — fade in/out (video + audio)
  enhance     bool   — color/contrast boost
  text_overlay str   — title text burned in for first 3s
  music       str    — 'none' | 'upbeat' | 'calm' | 'cinematic'
                       (requires music/<style>.mp3 to exist next to this file)

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
MUSIC_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music")


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
        e = seg["end"]   - clip_start
        if e <= 0:
            continue
        s = max(0.0, s)

        def fmt(t):
            h   = int(t // 3600)
            m   = int((t % 3600) // 60)
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
# Core clip renderer (shared by cmd_clip and cmd_batch_clip)
# ---------------------------------------------------------------------------

def _render_clip(
    video_path: str,
    clip_path: str,
    start: float,
    end: float,
    aspect_ratio: str,
    transcript_segs,     # list | None
    options: dict,
    tmp: str,
):
    duration  = end - start
    fade_dur  = min(0.4, duration / 6)   # never more than 1/6 of clip length

    # ── video filter chain ─────────────────────────────────────────────────────

    vf_parts = []

    # 1. Crop + scale
    if aspect_ratio == "9:16":
        vf_parts.append("crop=ih*9/16:ih,scale=1080:1920")
    elif aspect_ratio == "1:1":
        vf_parts.append("crop=ih:ih,scale=1080:1080")
    else:
        vf_parts.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

    # 2. Color / contrast enhancement
    if options.get("enhance"):
        vf_parts.append("eq=contrast=1.06:brightness=0.02:saturation=1.2:gamma=1.04")

    # 3. Title text overlay (first 3 seconds, centered, box behind text)
    text = (options.get("text_overlay") or "").strip()
    if text:
        safe = (
            text
            .replace("\\", "\\\\")
            .replace("'",  "\\'")
            .replace(":",  "\\:")
            .replace("%",  "\\%")
        )
        show_until = min(3.5, duration - 0.3)
        vf_parts.append(
            f"drawtext=text='{safe}':"
            "fontsize=h/14:"
            "fontcolor=white:"
            "x=(w-text_w)/2:"
            "y=h*0.10:"
            "box=1:boxcolor=black@0.55:boxborderw=18:"
            f"enable='between(t,0.3,{show_until:.1f})'"
        )

    # 4. Captions (subtitles filter — must come after scaling)
    if transcript_segs:
        srt       = build_srt(transcript_segs, start)
        srt_path  = os.path.join(tmp, f"captions_{int(start*10)}.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt)
        escaped = srt_path.replace("\\", "/").replace(":", "\\:")
        vf_parts.append(
            f"subtitles='{escaped}'"
            ":force_style='FontSize=22,FontName=Arial,"
            "PrimaryColour=&Hffffff,OutlineColour=&H000000,"
            "Outline=2,Bold=1,Alignment=2,MarginV=40'"
        )

    # 5. Fade in / out (last video filter)
    if options.get("fade") and duration > 1.0:
        vf_parts.append(f"fade=t=in:st=0:d={fade_dur:.3f}")
        if duration > fade_dur * 2:
            vf_parts.append(f"fade=t=out:st={duration - fade_dur:.3f}:d={fade_dur:.3f}")

    vf = ",".join(vf_parts)

    # ── audio filter chain ─────────────────────────────────────────────────────

    af_parts = []
    if options.get("fade") and duration > 1.0:
        af_parts.append(f"afade=t=in:st=0:d={fade_dur:.3f}")
        if duration > fade_dur * 2:
            af_parts.append(f"afade=t=out:st={duration - fade_dur:.3f}:d={fade_dur:.3f}")

    # ── find music file (if requested) ────────────────────────────────────────

    music_style = (options.get("music") or "none").strip().lower()
    music_file  = None
    if music_style != "none":
        candidate = os.path.join(MUSIC_DIR, f"{music_style}.mp3")
        if os.path.exists(candidate):
            music_file = candidate
            log(f"Using background music: {music_style}")
        else:
            log(f"Music file not found at {candidate} — skipping (drop {music_style}.mp3 in music/ folder)")

    # ── build FFmpeg command ───────────────────────────────────────────────────

    log(f"Rendering {start:.1f}s–{end:.1f}s, ratio={aspect_ratio}, "
        f"fade={options.get('fade')}, enhance={options.get('enhance')}, "
        f"music={music_style}...")

    if music_file:
        # Mix original speech with background music using filter_complex
        speech_af = ",".join(af_parts) if af_parts else "anull"
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start), "-t", str(duration), "-i", video_path,
            "-stream_loop", "-1", "-i", music_file,
            "-filter_complex",
            f"[0:v]{vf}[v];"
            f"[0:a]{speech_af}[speech];"
            f"[1:a]volume=0.15[music];"
            f"[speech][music]amix=inputs=2:duration=first[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            clip_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start), "-t", str(duration), "-i", video_path,
            "-vf", vf,
        ]
        if af_parts:
            cmd += ["-af", ",".join(af_parts)]
        cmd += [
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            clip_path,
        ]

    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr.decode()[-2000:]}")


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

        segments  = getattr(transcript, "segments", None) or []
        full_text = getattr(transcript, "text", "") or ""

        if not full_text.strip():
            result = {
                "duration": duration,
                "transcript_segments": [],
                "segments": [{
                    "start": 0,
                    "end": min(target_duration, duration),
                    "reason": "No speech detected. Adjust start/end times manually.",
                    "preview": "(No transcript available)",
                }],
            }
        else:
            seg_dicts = [{"start": s.start, "end": s.end, "text": s.text} for s in segments]
            best      = find_best_segments(seg_dicts, target_duration, duration)
            result    = {
                "duration": duration,
                "transcript_segments": seg_dicts,
                "segments": best,
            }

        print(json.dumps(result))


def cmd_clip(video_url: str, start: float, end: float, aspect_ratio: str, captions_json: str, options_json: str = "{}"):
    options = {}
    if options_json and options_json != "false":
        try:
            options = json.loads(options_json)
        except Exception:
            pass

    transcript_segs = None
    if captions_json and captions_json != "false":
        try:
            transcript_segs = json.loads(captions_json)
        except Exception:
            pass

    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "source.mp4")
        clip_path  = os.path.join(tmp, "clip.mp4")

        download(video_url, video_path)
        _render_clip(video_path, clip_path, start, end, aspect_ratio, transcript_segs, options, tmp)

        log("Uploading...")
        dest     = f"clip_{int(time.time())}.mp4"
        clip_url = upload_to_supabase(clip_path, "video-clips", dest)
        print(json.dumps({"clip_url": clip_url, "storage_path": dest}))


def cmd_batch_clip(video_url: str, segments_json: str, aspect_ratio: str, captions_json: str, options_json: str = "{}"):
    segments = json.loads(segments_json)
    options  = {}
    if options_json and options_json != "false":
        try:
            options = json.loads(options_json)
        except Exception:
            pass

    transcript_segs = None
    if captions_json and captions_json != "false":
        try:
            transcript_segs = json.loads(captions_json)
        except Exception:
            pass

    results = []

    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "source.mp4")
        download(video_url, video_path)

        for i, seg in enumerate(segments):
            start = float(seg["start"])
            end   = float(seg["end"])
            log(f"Clip {i+1}/{len(segments)}: {start:.1f}s–{end:.1f}s")

            clip_path = os.path.join(tmp, f"clip_{i}.mp4")
            try:
                _render_clip(video_path, clip_path, start, end, aspect_ratio, transcript_segs, options, tmp)
                dest     = f"clip_{int(time.time())}_{i}.mp4"
                clip_url = upload_to_supabase(clip_path, "video-clips", dest)
                results.append({
                    "index":        i,
                    "clip_url":     clip_url,
                    "storage_path": dest,
                    "segment":      seg,
                })
                log(f"Clip {i+1} uploaded → {dest}")
            except Exception as e:
                log(f"Clip {i+1} failed: {e}")
                results.append({"index": i, "error": str(e), "segment": seg})

    print(json.dumps({"clips": results}))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    command = sys.argv[1]
    if command == "analyze":
        cmd_analyze(sys.argv[2], int(sys.argv[3]))
    elif command == "clip":
        captions = sys.argv[6] if len(sys.argv) > 6 else "false"
        opts     = sys.argv[7] if len(sys.argv) > 7 else "{}"
        cmd_clip(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], captions, opts)
    elif command == "batch_clip":
        captions = sys.argv[5] if len(sys.argv) > 5 else "false"
        opts     = sys.argv[6] if len(sys.argv) > 6 else "{}"
        cmd_batch_clip(sys.argv[2], sys.argv[3], sys.argv[4], captions, opts)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)
