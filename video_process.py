#!/usr/bin/env python3
"""
video_process.py

Usage:
  python video_process.py analyze    <video_url> <target_duration>
  python video_process.py clip       <video_url> <start> <end> <aspect_ratio> <captions_json> <options_json>
  python video_process.py batch_clip <video_url> <segments_json> <aspect_ratio> <captions_json> <options_json>
  python video_process.py thumbnails <video_url> <count>

options_json keys:
  fade         bool  — fade in/out (video + audio)
  enhance      bool  — color/contrast boost
  text_overlay str   — title text burned in for first 3s
  music        str   — 'none' | 'upbeat' | 'calm' | 'cinematic'
                       (requires music/<style>.mp3 to exist next to this file)
  captions     bool  — burn subtitles (default true when transcript provided)
  clean_speech bool  — jump cuts: remove filler words + long pauses using
                       word-level timestamps (default true; needs transcript)
  dynamic_editing bool — AI edit director: per-cut punch-in zooms, dissolve
                       transitions at topic changes, emphasized caption words,
                       rhythm reframes every few seconds (default true)
  pacing       str   — 'chill' | 'normal' | 'fast': how aggressively pauses
                       are trimmed, how often framing changes, and playback
                       speed (fast = 1.08x). Default 'normal'.
  font         str   — caption font key, see FONT_REGISTRY (default 'poppins')
  subtitle_position str|float — 'bottom' (default, legacy placement) | 'top'
                       is reserved for the title overlay | a float 0.0-1.0
                       for a continuous position between the top and bottom
                       safe zones (0.0 = top, 1.0 = bottom)

Outputs JSON to stdout. Logs to stderr.
"""

import os
import re
import sys
import json
import glob
import subprocess
import tempfile
import time
import requests
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MUSIC_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music")
FONT_DIR     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

# Caption font choices — key is what the frontend sends as options.font.
# Keep in sync with frontend/public/fonts/ (same files, served for the
# browser's live overlay preview to match what actually gets rendered).
FONT_REGISTRY = {
    "poppins":          "Poppins-ExtraBold.ttf",
    "poppins-semibold": "Poppins-SemiBold.ttf",
    "bebas-neue":       "BebasNeue-Regular.ttf",
    "anton":            "Anton-Regular.ttf",
}
DEFAULT_FONT_KEY = "poppins"

_SYSTEM_FONT_FALLBACKS = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


def _resolve_font_path(font_key: str | None) -> str | None:
    """Resolve a font registry key to a real file path. Falls back to the
    default font, then to system fonts, if the requested/default file is
    somehow missing — never raises, so a bad/unknown key never breaks a render."""
    filename = FONT_REGISTRY.get((font_key or "").lower(), FONT_REGISTRY[DEFAULT_FONT_KEY])
    path = os.path.join(FONT_DIR, filename)
    if os.path.exists(path):
        return path
    default_path = os.path.join(FONT_DIR, FONT_REGISTRY[DEFAULT_FONT_KEY])
    if os.path.exists(default_path):
        return default_path
    for fp in _SYSTEM_FONT_FALLBACKS:
        if os.path.exists(fp):
            return fp
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg):
    print(f"[video] {msg}", file=sys.stderr, flush=True)


# Video-platform pages (YouTube, TikTok, …) aren't direct media files — a
# plain GET returns an HTML/JS app. These need yt-dlp to resolve and download
# the actual stream.
PLATFORM_VIDEO_URL = re.compile(
    r"(?:youtube\.com/(?:watch|shorts|live)|youtu\.be/|tiktok\.com/|"
    r"instagram\.com/(?:reel|p|tv)/|(?:^|//|\.)x\.com/[^/]+/status|"
    r"twitter\.com/[^/]+/status|vimeo\.com/\d|facebook\.com/.*(?:video|watch|reel))",
    re.IGNORECASE,
)


def _download_platform(url: str, dest: str):
    """Download from a video platform with yt-dlp (≤480p is plenty for frame
    analysis + transcription; 30-min cap keeps runtime and Groq audio sane)."""
    import yt_dlp

    log(f"yt-dlp downloading {url[:70]}...")
    opts = {
        "format": "bv*[height<=480]+ba/b[height<=480]/best",
        "outtmpl": dest,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "match_filter": yt_dlp.utils.match_filter_func("duration <= 1800"),
        "max_filesize": 400 * 1024 * 1024,
        # player clients that tend to dodge datacenter-IP bot checks
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)
    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError("yt-dlp produced no file (video too long, gone, or blocked)")
    log(f"Downloaded {os.path.getsize(dest) // 1024}KB via yt-dlp")


def download(url: str, dest: str):
    if PLATFORM_VIDEO_URL.search(url):
        _download_platform(url, dest)
        return
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


def has_audio_stream(video_path: str) -> bool:
    """Silent screen recordings are common — probing first prevents ffmpeg
    from crashing the whole analysis on a video with no audio track."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return bool(out)
    except Exception:
        return True  # fail open: let extract_audio produce the real error


def extract_audio(video_path: str, audio_path: str):
    log("Extracting audio...")
    subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", audio_path, "-y"],
        check=True, capture_output=True
    )


def transcribe(audio_path: str):
    log("Transcribing with Groq Whisper API...")
    size_mb = os.path.getsize(audio_path) / 1024 / 1024
    log(f"Audio size: {size_mb:.1f}MB")
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment", "word"],
        )

    # Build karaoke-style subtitle lines with per-word timing.
    # Each line holds ~6 words; each word carries its own start/end so the renderer
    # can highlight exactly the word being spoken (yellow) while the rest stay gray.
    segs         = []
    raw_segments = result.segments or []
    raw_words    = getattr(result, "words", None) or []
    GROUP        = 6  # words per subtitle line

    # Try Groq word-level timestamps first; validate they are absolute (not segment-relative).
    groq_words = []
    if raw_words:
        for w in raw_words:
            groq_words.append({
                "word":  (w["word"]  if isinstance(w, dict) else w.word).strip(),
                "start":  w["start"] if isinstance(w, dict) else w.start,
                "end":    w["end"]   if isinstance(w, dict) else w.end,
            })
        # Detect and fix segment-relative word timestamps.
        # Groq sometimes returns word times relative to their segment rather than absolute.
        # Two signals: (1) timestamps reset backwards between segments, or (2) first segment
        # starts late but first word timestamp is tiny.
        if raw_segments and groq_words:
            first_seg_start = raw_segments[0].start if hasattr(raw_segments[0], "start") else raw_segments[0]["start"]
            has_reset = len(groq_words) > 1 and any(
                groq_words[i + 1]["start"] < groq_words[i]["start"] - 0.5
                for i in range(len(groq_words) - 1)
            )
            late_start = first_seg_start > 5.0 and groq_words[0]["start"] < 1.0
            if has_reset or late_start:
                log(f"Segment-relative word timestamps detected (reset={has_reset}, late_start={late_start}) — correcting to absolute")
                corrected = []
                word_pos = 0
                for seg in raw_segments:
                    seg_start = seg.start if hasattr(seg, "start") else seg["start"]
                    seg_end   = seg.end   if hasattr(seg, "end")   else seg["end"]
                    seg_dur   = seg_end - seg_start
                    while word_pos < len(groq_words):
                        w = groq_words[word_pos]
                        if w["start"] <= seg_dur + 0.5:
                            corrected.append({
                                "word":  w["word"],
                                "start": round(w["start"] + seg_start, 3),
                                "end":   round(min(w["end"] + seg_start, seg_end), 3),
                            })
                            word_pos += 1
                        else:
                            break
                corrected.extend(groq_words[word_pos:])
                groq_words = corrected

    if groq_words:
        for i in range(0, len(groq_words), GROUP):
            chunk = groq_words[i : i + GROUP]
            segs.append({
                "start": chunk[0]["start"],
                "end":   chunk[-1]["end"],
                "text":  " ".join(w["word"] for w in chunk),
                "words": chunk,
            })
        log(f"Word-level karaoke: {len(segs)} lines from {len(groq_words)} words")
    else:
        # Interpolate per-word timing from segment boundaries (always absolute).
        for seg in raw_segments:
            seg_start = seg.start if hasattr(seg, "start") else seg["start"]
            seg_end   = seg.end   if hasattr(seg, "end")   else seg["end"]
            seg_text  = (seg.text if hasattr(seg, "text") else seg["text"]).strip()
            if not seg_text:
                continue
            words_in_seg  = seg_text.split()
            seg_dur       = max(seg_end - seg_start, 0.01)
            time_per_word = seg_dur / len(words_in_seg)
            seg_word_list = [
                {"word": w, "start": seg_start + j * time_per_word,
                 "end": seg_start + (j + 1) * time_per_word}
                for j, w in enumerate(words_in_seg)
            ]
            for i in range(0, len(seg_word_list), GROUP):
                chunk = seg_word_list[i : i + GROUP]
                segs.append({
                    "start": chunk[0]["start"],
                    "end":   chunk[-1]["end"],
                    "text":  " ".join(w["word"] for w in chunk),
                    "words": chunk,
                })
        log(f"Interpolated karaoke: {len(segs)} lines from {len(raw_segments)} segments")

    # Post-process: extend each line's end to the next line's start (no flicker gaps),
    # and enforce a minimum display time so fast speech doesn't flash.
    MIN_DUR = 1.2  # seconds — minimum time a subtitle line stays on screen
    for i, seg in enumerate(segs):
        if i < len(segs) - 1:
            gap = segs[i + 1]["start"] - seg["end"]
            if gap < 1.0:                         # close lines → extend seamlessly
                seg["end"] = segs[i + 1]["start"]
        seg["end"] = max(seg["end"], seg["start"] + MIN_DUR)

    if segs:
        log(f"  Timestamp range: {segs[0]['start']:.2f}s – {segs[-1]['end']:.2f}s")
        log(f"  First 3 lines:   {[(round(x['start'],2), round(x['end'],2)) for x in segs[:3]]}")

    class _Result:
        def __init__(self, r, s):
            self.segments = [
                type('S', (), {'start': x['start'], 'end': x['end'],
                               'text': x['text'], 'words': x.get('words', [])})()
                for x in s
            ]
            self.text = r.text or ""

    return _Result(result, segs)


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

    msg = _claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = next((b.text for b in msg.content if getattr(b, "type", "") == "text"), "")
    raw = raw.strip()
    # strip markdown fences if the model wrapped the JSON
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    if not raw:
        log(f"Claude returned empty response. stop_reason={msg.stop_reason}")
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log(f"JSON parse failed: {e} — raw: {raw[:200]}")
        return []
    segments = data.get("segments", [])
    # Hard-cap each segment to the requested duration — the LLM often runs long.
    for seg in segments:
        if seg.get("end", 0) - seg.get("start", 0) > target_duration * 1.25:
            seg["end"] = round(seg["start"] + target_duration, 2)
            log(f"Capped segment to {target_duration}s: {seg['start']:.1f}–{seg['end']:.1f}s")
    return segments


def _probe_dimensions(video_path: str):
    """Return (width, height) of the first video stream."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_streams", "-select_streams", "v:0", video_path],
        capture_output=True, text=True, check=True,
    )
    s = json.loads(result.stdout)["streams"][0]
    return s["width"], s["height"]


def _make_text_png(
    text: str, width: int, height: int, font,
    tmp: str, idx: int,
    position="bottom",   # "top" (title box only) | "bottom" (legacy default,
                          # exact same pixel math as before) | float 0.0-1.0
                          # (continuous, subtitles only — 0.0 = top safe zone,
                          # 1.0 = bottom safe zone, linear in between)
    emphasis: set = None,       # lowercase tokens to render in accent color
) -> str:
    """Render a text line as a transparent RGBA PNG. Returns the file path.

    Note: the final composite keys out solid lime-green (see _burn_overlays_pillow),
    so fills here must stay near-opaque — a translucent fill gets pre-blended with
    green before the colorkey pass and comes out looking tinted. That's why the
    outline/backdrop below use high alpha instead of a soft translucent wash.
    """
    from PIL import Image, ImageDraw

    img  = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Pixel-based word wrap: keep lines within 86% of frame width
    max_line_px = int(width * 0.86)
    words = text.split()
    lines, current = [], []
    for word in words:
        test = " ".join(current + [word])
        test_w = draw.textbbox((0, 0), test, font=font)[2]
        if test_w <= max_line_px or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    full_text = "\n".join(lines)

    spacing = int(font.size * 0.35)
    bbox = draw.multiline_textbbox((0, 0), full_text, font=font, spacing=spacing, align="center")
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x  = (width - tw) // 2 - bbox[0]

    margin  = max(34, int(height * 0.065))
    top_y    = int(height * 0.08)
    bottom_y = height - th - margin
    is_title = (position == "top")

    if is_title:
        y = top_y - bbox[1]
    elif position == "bottom":
        y = bottom_y - bbox[1]   # legacy default — identical to the old fixed formula
    else:
        frac = max(0.0, min(1.0, float(position)))
        y = int(top_y + (bottom_y - top_y) * frac) - bbox[1]

    if is_title:
        # Rounded box behind title text — fully opaque; the compositor keys out
        # pure lime-green before this is placed on the video, so any translucency
        # here would let green bleed through as a tint (see note above).
        pad = 20
        draw.rounded_rectangle(
            [x + bbox[0] - pad, y + bbox[1] - pad, x + bbox[2] + pad, y + bbox[3] + pad],
            radius=16, fill=(10, 10, 14, 255),
        )

    # Crisp circular outline (subtitles only — top text uses the box instead) —
    # scales with font size and stays fully opaque to avoid chroma-key fringing.
    r = max(2, font.size // 22)
    outline_offsets = [
        (ox, oy) for ox in range(-r, r + 1) for oy in range(-r, r + 1)
        if (ox or oy) and ox * ox + oy * oy <= r * r
    ]

    EMPH = (255, 209, 0, 255)   # accent for AI-emphasized words

    if not is_title and emphasis:
        # Word-by-word so emphasized words can take the accent color.
        line_h = draw.textbbox((0, 0), "Ay", font=font)[3] + spacing
        space_w = draw.textbbox((0, 0), " ", font=font)[2]
        cur_y = y
        for line in lines:
            line_words  = line.split()
            word_widths = [draw.textbbox((0, 0), w, font=font)[2] for w in line_words]
            line_w = sum(word_widths) + space_w * max(0, len(line_words) - 1)
            cur_x  = (width - line_w) // 2
            for w, w_w in zip(line_words, word_widths):
                token = w.lower().strip('.,!?;:"\'')
                color = EMPH if token in emphasis else (255, 255, 255, 255)
                for ox, oy in outline_offsets:
                    draw.text((cur_x + ox, cur_y + oy), w, font=font, fill=(8, 8, 12, 255))
                draw.text((cur_x, cur_y), w, font=font, fill=color)
                cur_x += w_w + space_w
            cur_y += line_h
    else:
        if not is_title:
            for ox, oy in outline_offsets:
                draw.multiline_text((x + ox, y + oy), full_text, font=font,
                                     fill=(8, 8, 12, 255), spacing=spacing, align="center")
        draw.multiline_text((x, y), full_text, font=font, fill=(255, 255, 255, 255),
                             spacing=spacing, align="center")

    path = os.path.join(tmp, f"txt_{idx}.png")
    img.save(path, "PNG")
    return path


def _make_karaoke_png(
    words_in_line: list,   # [{"word": str, "start": float, "end": float}, ...]
    active_idx: int,       # index of the word currently being spoken
    width: int,
    height: int,
    font,
    tmp: str,
    idx: int,
) -> str:
    """
    Render a subtitle line where the active word is highlighted yellow and the
    rest are gray. Returns the path to an RGBA PNG (transparent background).
    """
    from PIL import Image, ImageDraw

    YELLOW  = (255, 230, 0,  255)   # active word
    GRAY    = (210, 210, 210, 255)  # inactive words in line
    SHADOW  = (0,   0,   0,  180)   # drop shadow

    img  = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    space_w = draw.textbbox((0, 0), " ", font=font)[2]

    word_widths = [draw.textbbox((0, 0), w["word"], font=font)[2] for w in words_in_line]
    total_w     = sum(word_widths) + space_w * max(0, len(words_in_line) - 1)

    line_h  = draw.textbbox((0, 0), "Ay", font=font)[3]
    margin  = max(30, int(height * 0.07))
    y       = height - line_h - margin
    x_start = max(8, (width - min(total_w, int(width * 0.92))) // 2)

    cur_x = x_start
    for i, (w, w_w) in enumerate(zip(words_in_line, word_widths)):
        color = YELLOW if i == active_idx else GRAY
        draw.text((cur_x + 2, y + 2), w["word"], font=font, fill=SHADOW)
        draw.text((cur_x,     y    ), w["word"], font=font, fill=color)
        cur_x += w_w + space_w

    path = os.path.join(tmp, f"kara_{idx:04d}.png")
    img.save(path, "PNG")
    return path


def _burn_overlays_pillow(
    input_path: str,
    output_path: str,
    transcript_segs: list,
    clip_start: float,
    text_overlay: str,
    text_end: float,
    tmp: str,
    emphasis: set = None,
    options: dict = None,
):
    """
    Burn text overlays via chroma-key compositing (no libass / alpha-channel needed).

    Strategy:
      1. Render each text entry as an RGBA PNG (transparent bg).
      2. For each constant-active-text interval, alpha-composite all active layers
         onto a lime-green RGB background → one PNG per interval.
      3. Build a subtitle-track video at 5 fps with the concat demuxer
         (libx264 / yuv420p — no alpha codec needed).
      4. Key out the lime green with FFmpeg colorkey, then do ONE overlay.
    """
    import shutil
    from PIL import ImageFont, Image

    CHROMA = (0, 255, 0)          # lime green — keyed out by FFmpeg colorkey
    CHROMA_HEX = "0x00FF00"

    width, height = _probe_dimensions(input_path)
    clip_dur      = get_duration(input_path)
    log(f"Overlay: clip_start={clip_start:.2f}s  clip_dur={clip_dur:.2f}s  segments_in={len(transcript_segs or [])}")

    options = options or {}
    font_path = _resolve_font_path(options.get("font"))
    subtitle_position = options.get("subtitle_position", "bottom")   # "bottom" default = exact legacy placement

    def load_font(size):
        if font_path:
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    sub_font   = load_font(max(24, height // 28))   # ~68px on 1920px-tall, ~39px on 1080px
    title_font = load_font(max(28, height // 20))   # ~96px on 1920px-tall

    # ── generate one transparent RGBA PNG per text entry ─────────────────────
    entries = []   # (start, end, rgba_png_path)
    idx = 0

    if text_overlay:
        png = _make_text_png(text_overlay, width, height, title_font, tmp, idx, "top")
        entries.append((0.3, min(text_end, clip_dur - 0.1), png))
        idx += 1

    if transcript_segs:
        raw_range = f"{transcript_segs[0]['start']:.2f}s–{transcript_segs[-1]['end']:.2f}s"
        log(f"  Seg timestamp range in DB: {raw_range}  (clip window: {clip_start:.2f}–{clip_start+clip_dur:.2f}s)")

    # Build subtitle windows first, then clamp so only ONE line is ever active:
    # transcribe()'s MIN_DUR extension can push a line past the next line's
    # start (worse after jump cuts compress the timeline), which stacked
    # multiple captions on top of each other.
    sub_windows = []
    for seg in (transcript_segs or []):
        # Use seg["start"]/seg["end"] — these have MIN_DUR and gap-filling applied in transcribe().
        # Raw seg_words boundaries are shorter and cause captions to flash/disappear too fast.
        s = max(0.0, seg["start"] - clip_start)
        e = min(seg["end"]   - clip_start, clip_dur)
        if e <= 0 or s >= clip_dur or s >= e or not seg["text"].strip():
            continue
        sub_windows.append([s, e, seg["text"].strip()])

    sub_windows.sort(key=lambda w: w[0])
    for i in range(len(sub_windows) - 1):
        sub_windows[i][1] = min(sub_windows[i][1], sub_windows[i + 1][0])

    for s, e, txt in sub_windows:
        if e - s < 0.05:
            continue
        png = _make_text_png(txt, width, height, sub_font, tmp, idx, subtitle_position, emphasis=emphasis)
        entries.append((s, e, png))
        idx += 1

    sub_entries = len(entries) - (1 if text_overlay else 0)
    log(f"Subtitle entries: {sub_entries} lines from {len(transcript_segs or [])} total")

    if not entries:
        log("No subtitle entries found in clip range — skipping overlay pass")
        shutil.copy2(input_path, output_path)
        return

    # ── pre-compose each time interval into a chroma-keyed RGB PNG ───────────
    # Lime-green "empty" frame (no text visible).
    empty_png = os.path.join(tmp, "empty_frame.png")
    Image.new("RGB", (width, height), CHROMA).save(empty_png, "PNG")

    def rgba_on_chroma(rgba_layers):
        """Alpha-composite a list of RGBA PNGs onto a lime-green RGB canvas."""
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        for p in rgba_layers:
            canvas = Image.alpha_composite(canvas, Image.open(p).convert("RGBA"))
        bg = Image.new("RGB", (width, height), CHROMA)
        bg.paste(canvas, mask=canvas.split()[3])   # use alpha as mask
        return bg

    time_pts = sorted(set([0.0, clip_dur] + [v for s, e, _ in entries for v in (s, e)]))
    timeline  = []   # (duration, rgb_png_path)

    for i in range(len(time_pts) - 1):
        t0, t1 = time_pts[i], time_pts[i + 1]
        dur = t1 - t0
        if dur < 0.001:
            continue

        active = [png for (s, e, png) in entries if s <= t0 < e]

        if not active:
            timeline.append((dur, empty_png))
        else:
            composed = rgba_on_chroma(active)
            cpath = os.path.join(tmp, f"frame_{i}.png")
            composed.save(cpath, "PNG")
            timeline.append((dur, cpath))

    if not timeline:
        shutil.copy2(input_path, output_path)
        return

    # ── subtitle track: concat demuxer → libx264 yuv420p at 5 fps ───────────
    concat_file = os.path.join(tmp, "overlay_concat.txt")
    with open(concat_file, "w") as f:
        for dur, png in timeline:
            f.write(f"file '{png}'\nduration {dur:.4f}\n")
        f.write(f"file '{timeline[-1][1]}'\n")   # required trailing entry

    overlay_track = os.path.join(tmp, "overlay_track.mp4")
    track_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-r", "5",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "15",
        "-pix_fmt", "yuv420p",
        overlay_track,
    ]
    r = subprocess.run(track_cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"Overlay track creation failed:\n{r.stderr.decode()[-1500:]}")

    # ── single colorkey + overlay onto main video ─────────────────────────────
    # colorkey removes lime green; overlay composites remaining pixels on top.
    # similarity=0.2 (tight, only keys near-pure green), blend=0.05 (smooth edges).
    overlay_cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-i", overlay_track,
        "-filter_complex",
        f"[1:v]colorkey={CHROMA_HEX}:0.2:0.05[ovl];[0:v][ovl]overlay=0:0:eof_action=pass[v]",
        "-map", "[v]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    r2 = subprocess.run(overlay_cmd, capture_output=True)
    if r2.returncode != 0:
        raise RuntimeError(f"Overlay composite failed:\n{r2.stderr.decode()[-1500:]}")


def upload_to_supabase(file_path: str, bucket: str, dest_path: str, content_type: str = "video/mp4") -> str:
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    with open(file_path, "rb") as f:
        sb.storage.from_(bucket).upload(dest_path, f, {"content-type": content_type})
    return sb.storage.from_(bucket).get_public_url(dest_path)


# ---------------------------------------------------------------------------
# Jump-cut helpers — filler / pause removal
# ---------------------------------------------------------------------------

FILLER_WORDS = frozenset({
    'um', 'uh', 'hmm', 'hm', 'er', 'ah', 'eh', 'mhm', 'uhh', 'umm', 'uhm', 'erm'
})
_PAUSE_MAX  = 0.5   # gaps longer than this are trimmed out
_PAUSE_KEEP = 0.12  # silence to keep at each cut edge (natural breath)

# Pacing presets: how aggressively pauses are trimmed, how often the framing
# changes (rhythm reframes), and overall playback speed.
PACING = {
    "chill":  {"pause_max": 0.70, "reframe": 10.0, "speed": 1.00},
    "normal": {"pause_max": 0.50, "reframe": 7.0,  "speed": 1.00},
    "fast":   {"pause_max": 0.35, "reframe": 4.5,  "speed": 1.08},
}


def _split_for_rhythm(keep_intervals: list, transcript_segs: list, target: float) -> list:
    """Split long keep-intervals at word boundaries roughly every `target`
    seconds. The split removes no time — it only creates cut points where the
    edit director can change framing, so clean speakers with few fillers still
    get a dynamic edit instead of one static minute-long shot."""
    word_bounds = sorted(
        w["end"] for seg in transcript_segs for w in seg.get("words", [])
    )
    out = []
    for s, e in keep_intervals:
        cur = s
        while e - cur > target * 1.5:
            lo, hi = cur + target * 0.6, cur + target * 1.4
            candidates = [b for b in word_bounds if lo <= b <= hi]
            if not candidates:
                break
            split = min(candidates, key=lambda b: abs(b - (cur + target)))
            out.append((cur, split))
            cur = split
        out.append((cur, e))
    return out


def compute_keep_intervals(transcript_segs: list, clip_start: float, clip_end: float,
                           pause_max: float = _PAUSE_MAX) -> list:
    """Return (abs_start, abs_end) intervals to keep, dropping filler words and long pauses."""
    kept_words   = []
    filler_spans = []
    for seg in transcript_segs:
        for w in seg.get("words", []):
            ws, we = w.get("start", seg["start"]), w.get("end", seg["end"])
            if ws >= clip_end or we <= clip_start:
                continue
            ws, we = max(ws, clip_start), min(we, clip_end)
            token = w.get("word", "").strip().lower().strip('.,!?;:')
            if token in FILLER_WORDS:
                filler_spans.append((ws, we))
            else:
                kept_words.append({"start": ws, "end": we})

    if not kept_words:
        return [(clip_start, clip_end)]

    kept_words.sort(key=lambda x: x["start"])

    # Cut ranges = filler-word spans + long pauses between kept words.
    # Filler words are cut out regardless of how short the surrounding gap is —
    # otherwise a quick "um" between two close words never gets removed.
    cut_ranges = list(filler_spans)
    seg_e = kept_words[0]["end"]
    for w in kept_words[1:]:
        gap = w["start"] - seg_e
        if gap > pause_max:
            cut_ranges.append((seg_e, w["start"]))
        seg_e = max(seg_e, w["end"])

    # Merge overlapping/adjacent cut ranges, shrinking each by _PAUSE_KEEP on
    # both edges so a sliver of natural silence survives around the cut.
    cut_ranges.sort()
    merged = []
    for s, e in cut_ranges:
        s, e = s + _PAUSE_KEEP, e - _PAUSE_KEEP
        if e <= s:
            continue
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    # Invert cut ranges within [clip_start, clip_end] to get keep intervals.
    intervals = []
    cursor = clip_start
    for s, e in merged:
        if s > cursor:
            intervals.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < clip_end:
        intervals.append((cursor, clip_end))

    intervals = [(max(clip_start, s), min(clip_end, e)) for s, e in intervals if e > s + 0.05]
    return intervals or [(clip_start, clip_end)]


def _map_time(t: float, keep_intervals: list) -> float:
    """Map absolute source time → cut-video time (starting at 0)."""
    out = 0.0
    for s, e in keep_intervals:
        if t <= s:
            return out
        if t <= e:
            return out + (t - s)
        out += (e - s)
    return out


def _adjust_segs_for_cuts(transcript_segs: list, keep_intervals: list) -> list:
    """Remap segment timestamps to the cut-video timeline; drop segments in removed sections."""
    adjusted = []
    for seg in transcript_segs:
        ns = _map_time(seg["start"], keep_intervals)
        ne = _map_time(seg["end"],   keep_intervals)
        if ne - ns < 0.05:
            continue
        new_words = []
        for w in seg.get("words", []):
            ws = _map_time(w["start"], keep_intervals)
            we = _map_time(w["end"],   keep_intervals)
            if we - ws >= 0.01:
                new_words.append({**w, "start": ws, "end": we})
        adjusted.append({**seg, "start": ns, "end": ne, "words": new_words})
    return adjusted


_XFADE_DUR = 0.18   # seconds of overlap for dissolve transitions


def _fallback_edit_plan(n: int) -> dict:
    """Deterministic plan when the AI director is unavailable: alternate
    punch-ins so every cut reads as an intentional reframe, hard cuts only."""
    return {
        "segments": [{"zoom": 1.0 if i % 2 == 0 else 1.12, "transition_in": "cut"} for i in range(n)],
        "emphasis_words": [],
    }


def plan_edits(transcript_segs: list, keep_intervals: list, clip_start: float, clip_end: float) -> dict:
    """AI edit director: given the kept segments and their spoken text, decide
    per-segment framing (punch-in zoom), per-cut transition (cut vs dissolve),
    and which words deserve caption emphasis. Never raises — falls back to a
    deterministic alternating-zoom plan on any failure."""
    n = len(keep_intervals)
    fallback = _fallback_edit_plan(n)

    # Text spoken inside each kept interval
    seg_texts = []
    for (s, e) in keep_intervals:
        words = [
            w["word"] for seg in transcript_segs for w in seg.get("words", [])
            if w.get("start", 0) >= s - 0.05 and w.get("end", 0) <= e + 0.05
        ]
        seg_texts.append(" ".join(words))

    listing = "\n".join(
        f"[{i}] ({e - s:.1f}s) {txt[:200]}" for i, ((s, e), txt) in enumerate(zip(keep_intervals, seg_texts))
    )
    prompt = f"""You are a short-form video editor. This talking-head clip was cut into {n} segments (fillers/pauses removed). Design the edit.

Segments:
{listing}

Rules:
- zoom: 1.0 (wide) or a punch-in between 1.08 and 1.18. ADJACENT segments must differ in zoom — that is what makes a jump cut look intentional.
- transition_in: "cut" for segment flow, "dissolve" ONLY at a real topic/thought change (max {max(1, n // 3)} dissolves; first segment is always "cut").
- emphasis_words: 2-4 single words from the transcript that carry the most punch (numbers, superlatives, the key noun). Exact words as spoken, no duplicates.

Return ONLY this JSON:
{{"segments":[{{"zoom":1.0,"transition_in":"cut"}}, ...] ({n} entries), "emphasis_words":["word", ...]}}"""

    try:
        msg = _claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = next((b.text for b in msg.content if getattr(b, "type", "") == "text"), "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        plan = json.loads(raw)
        segs = plan.get("segments", [])
        if len(segs) != n:
            log(f"Edit director returned {len(segs)} segments for {n} cuts — using fallback plan")
            return fallback
        # Sanitize: clamp zooms, validate transitions, force cut on tiny segments
        # (acrossfade needs both sides longer than the overlap)
        for i, (sg, (s, e)) in enumerate(zip(segs, keep_intervals)):
            z = float(sg.get("zoom", 1.0))
            sg["zoom"] = min(1.25, max(1.0, z))
            t = sg.get("transition_in", "cut")
            if i == 0 or t not in ("cut", "dissolve"):
                t = "cut"
            if t == "dissolve":
                prev_dur = keep_intervals[i - 1][1] - keep_intervals[i - 1][0]
                if (e - s) < 0.5 or prev_dur < 0.5:
                    t = "cut"
            sg["transition_in"] = t
        emphasis = [
            tok.strip().lower().strip('.,!?;:')
            for w in plan.get("emphasis_words", [])
            for tok in str(w).split()          # model sometimes returns phrases
        ][:6]
        plan["emphasis_words"] = [w for w in emphasis if w]
        zooms = [sg["zoom"] for sg in segs]
        trans = [sg["transition_in"] for sg in segs]
        log(f"Edit plan: zooms={zooms}, dissolves={trans.count('dissolve')}, emphasis={plan['emphasis_words']}")
        return plan
    except Exception as e:
        log(f"Edit director failed ({e}) — using fallback alternating-zoom plan")
        return fallback


def _xfade_shift_segs(segs: list, boundaries: list, xf: float) -> list:
    """Dissolves overlap the timeline by xf seconds each; shift caption times
    (cut-video timeline) left to stay in sync with the rendered video."""
    if not boundaries:
        return segs
    def sh(t: float) -> float:
        return t - xf * sum(1 for b in boundaries if b <= t + 1e-6)
    out = []
    for seg in segs:
        out.append({
            **seg,
            "start": sh(seg["start"]),
            "end":   sh(seg["end"]),
            "words": [{**w, "start": sh(w["start"]), "end": sh(w["end"])} for w in seg.get("words", [])],
        })
    return out


def _render_jump_cuts(
    video_path: str,
    out_path: str,
    keep_intervals: list,
    base_vf: list,
    tmp: str,
    fade: bool = False,
    music_file: str = None,
    edit_plan: dict = None,
    speed: float = 1.0,
) -> list:
    """Trim and concat source segments using FFmpeg filter_complex, removing filler/pauses.

    With an edit_plan, applies per-segment punch-in zooms and dissolve
    transitions (xfade/acrossfade) between segment groups. Fade and music are
    applied to the final result so they behave like the single-cut path.

    Returns the list of cut-timeline boundary times where dissolves consumed
    _XFADE_DUR seconds each — the caller shifts caption timestamps with it.
    """
    n = len(keep_intervals)
    total = sum(e - s for s, e in keep_intervals)
    vf_chain = ",".join(base_vf) if base_vf else "null"
    parts, v_tags, a_tags = [], [], []

    plan_segs = (edit_plan or {}).get("segments") or [{"zoom": 1.0, "transition_in": "cut"}] * n

    speed = max(0.5, min(2.0, float(speed or 1.0)))
    setpts = "setpts=PTS-STARTPTS" if abs(speed - 1.0) < 1e-3 else f"setpts=(PTS-STARTPTS)/{speed:.4f}"
    atempo = "" if abs(speed - 1.0) < 1e-3 else f",atempo={speed:.4f}"

    for i, (s, e) in enumerate(keep_intervals):
        z = float(plan_segs[i].get("zoom", 1.0))
        # Punch-in: center-crop BEFORE the aspect crop/scale so the output
        # resolution stays identical across segments (required by concat/xfade).
        zoom_pre = f"crop=trunc(iw/{z:.4f}/2)*2:trunc(ih/{z:.4f}/2)*2," if z > 1.001 else ""
        # setsar=1 — the zoom crop perturbs the sample aspect ratio, and
        # concat/xfade refuse to join streams whose SARs differ
        parts.append(f"[0:v]trim=start={s:.3f}:end={e:.3f},{setpts},{zoom_pre}{vf_chain},setsar=1[v{i}]")
        parts.append(f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS{atempo}[a{i}]")
        v_tags.append(f"[v{i}]")
        a_tags.append(f"[a{i}]")

    # Group consecutive hard-cut segments; dissolve boundaries split groups.
    groups: list[list[int]] = [[0]]
    for i in range(1, n):
        if plan_segs[i].get("transition_in") == "dissolve":
            groups.append([i])
        else:
            groups[-1].append(i)

    group_durs, boundaries, acc = [], [], 0.0
    for g, idxs in enumerate(groups):
        d = sum(keep_intervals[i][1] - keep_intervals[i][0] for i in idxs) / speed
        if g > 0:
            boundaries.append(acc)   # sped cut-timeline time where this group starts
        group_durs.append(d)
        acc += d

    # Concat within each group
    for g, idxs in enumerate(groups):
        if len(idxs) == 1:
            parts.append(f"[v{idxs[0]}]settb=AVTB[vg{g}]")
            parts.append(f"[a{idxs[0]}]anull[ag{g}]")
        else:
            parts.append(f"{''.join(f'[v{i}]' for i in idxs)}concat=n={len(idxs)}:v=1:a=0,settb=AVTB[vg{g}]")
            parts.append(f"{''.join(f'[a{i}]' for i in idxs)}concat=n={len(idxs)}:v=0:a=1[ag{g}]")

    # Chain groups with xfade/acrossfade
    v_tag, a_tag = "[vg0]", "[ag0]"
    cur_dur = group_durs[0]
    for g in range(1, len(groups)):
        offset = max(0.0, cur_dur - _XFADE_DUR)
        parts.append(f"{v_tag}[vg{g}]xfade=transition=fade:duration={_XFADE_DUR}:offset={offset:.3f}[vx{g}]")
        parts.append(f"{a_tag}[ag{g}]acrossfade=d={_XFADE_DUR}[ax{g}]")
        v_tag, a_tag = f"[vx{g}]", f"[ax{g}]"
        cur_dur = cur_dur + group_durs[g] - _XFADE_DUR

    total = cur_dur

    fade_dur = min(0.4, total / 6)
    if fade and total > 1.0:
        vf_fade = f"fade=t=in:st=0:d={fade_dur:.3f}"
        af_fade = f"afade=t=in:st=0:d={fade_dur:.3f}"
        if total > fade_dur * 2:
            vf_fade += f",fade=t=out:st={total - fade_dur:.3f}:d={fade_dur:.3f}"
            af_fade += f",afade=t=out:st={total - fade_dur:.3f}:d={fade_dur:.3f}"
        parts.append(f"{v_tag}{vf_fade}[vfade]")
        parts.append(f"{a_tag}{af_fade}[afade]")
        v_tag, a_tag = "[vfade]", "[afade]"

    if music_file:
        parts.append("[1:a]volume=0.15[music]")
        parts.append(f"{a_tag}[music]amix=inputs=2:duration=first[amix]")
        a_tag = "[amix]"

    cmd = ["ffmpeg", "-y", "-i", video_path]
    if music_file:
        cmd += ["-stream_loop", "-1", "-i", music_file]
    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", v_tag, "-map", a_tag,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out_path,
    ]
    log(f"Jump-cut render: {n} segments, {len(groups) - 1} dissolve(s), "
        f"fade={fade}, music={'yes' if music_file else 'no'}...")
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"Jump-cut render failed:\n{r.stderr.decode()[-2000:]}")
    return boundaries


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
    fade_dur  = min(0.4, duration / 6)

    # ── base video filters (crop + enhance — no fade, applied per-segment for jump cuts) ──
    base_vf = []
    if aspect_ratio == "9:16":
        base_vf.append("crop=ih*9/16:ih,scale=1080:1920")
    elif aspect_ratio == "1:1":
        base_vf.append("crop=ih:ih,scale=1080:1080")
    else:
        # Must be a FIXED absolute target, not a relative trunc(iw/2)*2 — every
        # jump-cut segment has to land on the identical pixel size regardless
        # of its own punch-in zoom crop (applied before this filter runs), or
        # ffmpeg's concat/xfade refuse to join them ("Input link parameters
        # do not match the corresponding output link").
        src_w, src_h = _probe_dimensions(video_path)
        base_vf.append(f"scale={src_w - src_w % 2}:{src_h - src_h % 2}")
    if options.get("enhance"):
        base_vf.append("eq=contrast=1.06:brightness=0.02:saturation=1.2:gamma=1.04")

    text_overlay = (options.get("text_overlay") or "").strip()
    text_end     = min(3.5, duration - 0.3)

    # captions (burn subtitles) and clean_speech (jump cuts) are independent —
    # the transcript may be passed for either reason. Both default on when a
    # transcript is present, matching the old behavior.
    burn_subs    = bool(transcript_segs) and options.get("captions", True)
    clean_speech = options.get("clean_speech", True)
    dynamic      = options.get("dynamic_editing", True)
    needs_pass2  = burn_subs or bool(text_overlay)

    pacing = PACING.get((options.get("pacing") or "normal").strip().lower(), PACING["normal"])
    speed  = pacing["speed"]

    # ── compute jump-cut intervals from word timestamps ───────────────────────
    has_words      = any(seg.get("words") for seg in (transcript_segs or []))
    keep_intervals = None
    if clean_speech and has_words and transcript_segs:
        intervals = compute_keep_intervals(transcript_segs, start, end, pause_max=pacing["pause_max"])
        removed   = duration - sum(e - s for s, e in intervals)
        if dynamic:
            # Rhythm reframes: split long stretches so the edit director has
            # cut points to vary framing on, even for filler-free speakers.
            intervals = _split_for_rhythm(intervals, transcript_segs, pacing["reframe"])
        if len(intervals) > 1 and (removed > 0.1 or dynamic):
            keep_intervals = intervals
            log(f"Jump cuts: {len(intervals)} segments, {removed:.1f}s removed "
                f"(fillers/pauses), pacing={options.get('pacing') or 'normal'}")

    pass1_out = os.path.join(tmp, f"pass1_{int(start*10)}.mp4") if needs_pass2 else clip_path

    # overlay vars — reassigned in jump-cut path
    overlay_segs       = transcript_segs
    clip_start_for_ov  = start
    emphasis: set      = set()

    music_style = (options.get("music") or "none").strip().lower()
    music_file  = None
    if music_style != "none":
        candidate = os.path.join(MUSIC_DIR, f"{music_style}.mp3")
        if os.path.exists(candidate):
            music_file = candidate
            log(f"Using background music: {music_style}")
        else:
            log(f"Music file not found at {candidate} — skipping (drop {music_style}.mp3 in music/ folder)")

    log(f"Rendering {start:.1f}s–{end:.1f}s, ratio={aspect_ratio}, "
        f"fade={options.get('fade')}, enhance={options.get('enhance')}, "
        f"subs={'yes' if burn_subs else 'no'}, music={music_style}, "
        f"jump_cuts={len(keep_intervals) if keep_intervals else 0}...")

    if keep_intervals:
        # ── JUMP-CUT PATH (filler + pause removal + dynamic editing) ─────────
        edit_plan = None
        if dynamic:
            edit_plan = plan_edits(transcript_segs, keep_intervals, start, end)
            emphasis  = set(edit_plan.get("emphasis_words") or [])

        dissolve_boundaries = _render_jump_cuts(
            video_path, pass1_out, keep_intervals, base_vf, tmp,
            fade=bool(options.get("fade")) and duration > 1.0,
            music_file=music_file,
            edit_plan=edit_plan,
            speed=speed,
        )
        if transcript_segs:
            overlay_segs = _adjust_segs_for_cuts(transcript_segs, keep_intervals)
            if abs(speed - 1.0) > 1e-3:
                overlay_segs = [
                    {**sg, "start": sg["start"] / speed, "end": sg["end"] / speed,
                     "words": [{**w, "start": w["start"] / speed, "end": w["end"] / speed}
                               for w in sg.get("words", [])]}
                    for sg in overlay_segs
                ]
            overlay_segs = _xfade_shift_segs(overlay_segs, dissolve_boundaries, _XFADE_DUR)
        clip_start_for_ov = 0.0

    else:
        # ── SINGLE-CUT PATH ───────────────────────────────────────────────────
        vf_parts = list(base_vf)
        if options.get("fade") and duration > 1.0:
            vf_parts.append(f"fade=t=in:st=0:d={fade_dur:.3f}")
            if duration > fade_dur * 2:
                vf_parts.append(f"fade=t=out:st={duration - fade_dur:.3f}:d={fade_dur:.3f}")
        vf = ",".join(vf_parts)

        af_parts = []
        if options.get("fade") and duration > 1.0:
            af_parts.append(f"afade=t=in:st=0:d={fade_dur:.3f}")
            if duration > fade_dur * 2:
                af_parts.append(f"afade=t=out:st={duration - fade_dur:.3f}:d={fade_dur:.3f}")

        if music_file:
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
                pass1_out,
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
                pass1_out,
            ]

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg pass 1 failed:\n{result.stderr.decode()[-2000:]}")

    # ── pass 2: burn text / subtitles via Pillow + FFmpeg overlay ────────────

    if needs_pass2:
        log("Burning text overlays (pass 2 — Pillow)...")
        _burn_overlays_pillow(pass1_out, clip_path,
                              overlay_segs if burn_subs else None,
                              clip_start_for_ov, text_overlay, text_end, tmp,
                              emphasis=emphasis, options=options)


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

        if has_audio_stream(video_path):
            extract_audio(video_path, audio_path)
            transcript = transcribe(audio_path)
            segments  = getattr(transcript, "segments", None) or []
            full_text = getattr(transcript, "text", "") or ""
        else:
            log("No audio track — skipping transcription")
            segments, full_text = [], ""

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
            seg_dicts = [{"start": s.start, "end": s.end, "text": s.text,
                           "words": getattr(s, "words", [])} for s in segments]
            best      = find_best_segments(seg_dicts, target_duration, duration)
            result    = {
                "duration": duration,
                "transcript_segments": seg_dicts,
                "segments": best,
            }

        print(json.dumps(result))


def _youtube_captions_fallback(url: str) -> dict | None:
    """When the actual download is blocked (YouTube bot-checks datacenter IPs),
    the caption track alone still tells us what's said in the video."""
    m = re.search(r"(?:youtube\.com/(?:watch\?v=|shorts/|live/)|youtu\.be/)([\w-]{11})", url)
    if not m:
        return None
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        entries = YouTubeTranscriptApi().fetch(m.group(1))
        segs = [{"start": e.start, "end": e.start + e.duration, "text": e.text} for e in entries]
        if not segs:
            return None
        return {
            "duration": round(segs[-1]["end"], 1),
            "thumbnails": [],
            "transcript_segments": segs,
            "note": "Downloaded captions only — the video itself could not be fetched, so there are no frames to look at.",
        }
    except Exception as e:
        log(f"Caption fallback failed: {e}")
        return None


def cmd_watch(video_url: str, frame_count: int = 6):
    """One-pass 'watch this video' for the assistant: single download →
    evenly spaced frames + speech transcript. Handles platform URLs
    (YouTube/TikTok/…) via yt-dlp, with a captions-only fallback for YouTube
    when the download is bot-blocked."""
    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "source.mp4")
        audio_path = os.path.join(tmp, "audio.mp3")

        try:
            download(video_url, video_path)
        except Exception as e:
            log(f"Download failed: {e}")
            fallback = _youtube_captions_fallback(video_url)
            if fallback:
                print(json.dumps(fallback))
                return
            raise

        duration = get_duration(video_path)

        # frames — one ffmpeg pass, uploaded so they can be image blocks
        frame_count = max(1, min(frame_count, 12))
        interval = max(duration / frame_count, 0.1)
        pattern = os.path.join(tmp, "frame_%03d.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps=1/{interval:.4f},scale=480:-2", "-qscale:v", "4", pattern],
            capture_output=True, check=True,
        )
        thumbnails = []
        for i, fp in enumerate(sorted(glob.glob(os.path.join(tmp, "frame_*.jpg")))[:frame_count]):
            dest = f"watch_{int(time.time())}_{i}.jpg"
            thumbnails.append({
                "time": round(i * interval, 2),
                "url": upload_to_supabase(fp, "video-clips", dest, content_type="image/jpeg"),
            })

        segs = []
        if has_audio_stream(video_path):
            extract_audio(video_path, audio_path)
            transcript = transcribe(audio_path)
            segs = [{"start": s.start, "end": s.end, "text": s.text}
                    for s in (getattr(transcript, "segments", None) or [])]

        print(json.dumps({"duration": duration, "thumbnails": thumbnails, "transcript_segments": segs}))


def cmd_thumbnails(video_url: str, count: int = 12):
    """Extract `count` evenly-spaced frames in a single ffmpeg pass (not one
    invocation per frame) and upload them for the timeline scrubber UI."""
    count = max(1, min(count, 60))

    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "source.mp4")
        download(video_url, video_path)
        duration = get_duration(video_path)

        interval = max(duration / count, 0.1)
        pattern  = os.path.join(tmp, "thumb_%03d.jpg")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"fps=1/{interval:.4f},scale=320:-2",
            "-qscale:v", "4",
            pattern,
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"Thumbnail extraction failed:\n{result.stderr.decode()[-1500:]}")

        files = sorted(glob.glob(os.path.join(tmp, "thumb_*.jpg")))[:count]
        log(f"Extracted {len(files)} thumbnails ({interval:.2f}s apart)")

        thumbnails = []
        for i, fp in enumerate(files):
            dest = f"thumb_{int(time.time())}_{i}.jpg"
            url  = upload_to_supabase(fp, "video-clips", dest, content_type="image/jpeg")
            thumbnails.append({"time": round(i * interval, 2), "url": url})

        print(json.dumps({"thumbnails": thumbnails, "duration": duration}))


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
    elif command == "thumbnails":
        count = int(sys.argv[3]) if len(sys.argv) > 3 else 12
        cmd_thumbnails(sys.argv[2], count)
    elif command == "watch":
        frames = int(sys.argv[3]) if len(sys.argv) > 3 else 6
        cmd_watch(sys.argv[2], frames)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)
