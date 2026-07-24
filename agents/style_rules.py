# Shared anti-AI-slop style rules.
#
# Single source of truth used by BOTH sides of the pipeline:
#   - content_agent.py folds the banned-word list into the writer's system
#     prompt (prevention)
#   - qa_agent.py runs check_ai_slop() as a deterministic, no-LLM check
#     (enforcement) — prompts alone don't stop a model from reaching for
#     em-dashes and "it's not just X" constructions, so violations become
#     hard QA issues that the "Fix issues" regenerate loop can repair.
#
# Keep patterns HIGH-PRECISION: every hit blocks a draft, so anything with
# real false-positive risk belongs in SLOP_WARNING_PATTERNS instead.
#
# KEEP IN SYNC with frontend/lib/style-rules.ts — the TypeScript mirror that
# covers the Write page's own generate/compose routes. A word or pattern added
# here must be added there too (and vice versa).

import re

# Words/phrases that reliably mark AI-generated marketing copy. Substring or
# word-boundary matched (case-insensitive). Mirrored into the writer prompt.
AI_SLOP_WORDS = [
    "delve", "tapestry", "testament to", "pivotal", "boasts", "stands as",
    "serves as a", "game-changer", "game changer", "cutting-edge",
    "revolutionary", "revolutionize", "unlock the", "unleash", "elevate your",
    "supercharge", "synergy", "leverage the power", "harness the power",
    "in today's fast-paced", "in today's world", "in an era of",
    "in a world where", "let that sink in", "goes without saying",
    "look no further", "we are excited to announce", "we're excited to announce",
    "buckle up", "dive deep into", "a deep dive into",
]

# Regex patterns for structural slop. (name, compiled_regex, message)
SLOP_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    (
        "not-just-its",
        re.compile(r"\b(is|are|was|were|it)?n[o']t\s+just\s+(a\s+|an\s+|about\s+)?\w[^.!?\n]{0,60}?\b(it'?s|they'?re|this is)\b", re.IGNORECASE),
        "the 'it's not just X, it's Y' construction — state the point directly instead",
    ),
    (
        "not-only-but-also",
        re.compile(r"\bnot\s+only\b[^.!?\n]{0,80}\bbut\s+(also\b|it\b|the\b)", re.IGNORECASE),
        "the 'not only … but also' construction",
    ),
    (
        "fake-depth-ing",
        re.compile(r",\s+(highlighting|showcasing|underscoring|emphasizing|signaling|demonstrating|reflecting|illustrating)\s", re.IGNORECASE),
        "fake-depth '-ing' clause (', highlighting how…') — make it a real sentence or cut it",
    ),
    (
        "ai-opener",
        re.compile(r"^(imagine\s|picture this|what if i told you|ever wondered|we've all been there|let's face it|let's be honest)", re.IGNORECASE),
        "a cliché AI opener — start with the actual point or a concrete detail",
    ),
    (
        "rhetorical-answer",
        re.compile(r"\?\s*(here'?s the (thing|kicker|catch)|the answer( is|:)|spoiler( alert)?:)", re.IGNORECASE),
        "the rhetorical-question-then-'here's the thing' pattern",
    ),
]

# Lower-confidence tells — flagged for the human, never block on their own.
SLOP_WARNING_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    ("seamless",   re.compile(r"\bseamless(ly)?\b", re.IGNORECASE), "'seamless' is marketing filler — name what actually happens"),
    ("effortless", re.compile(r"\beffortless(ly)?\b", re.IGNORECASE), "'effortless' is marketing filler"),
    ("robust",     re.compile(r"\brobust\b", re.IGNORECASE), "'robust' is filler unless you say what survives what"),
    ("the-result", re.compile(r"\bthe (result|best part|bottom line)\?", re.IGNORECASE), "'The result?' one-word-question pattern reads AI"),
    ("semicolon",  re.compile(r";"), "semicolon in a social post — use a period or comma"),
]

MAX_EM_DASHES = 1


def check_ai_slop(text: str) -> tuple[list[str], list[str]]:
    """Deterministic AI-slop lint. Returns (issues, warnings) — issue strings
    are written to be directly actionable by the regenerate/fix loop."""
    issues: list[str] = []
    warnings: list[str] = []

    # Em dashes (— and –). The single most recognizable AI tell.
    dash_count = text.count("—") + text.count("–")
    if dash_count > MAX_EM_DASHES:
        issues.append(
            f"AI-style: {dash_count} em dashes (max {MAX_EM_DASHES}) — replace with periods, commas, or restructure the sentences"
        )

    lower = text.lower()
    hit_words = [w for w in AI_SLOP_WORDS if w in lower]
    if hit_words:
        quoted = ", ".join(f'"{w}"' for w in hit_words[:6])
        issues.append(f"AI-style wording: {quoted} — rewrite in plain, specific language")

    for _name, pattern, message in SLOP_PATTERNS:
        if pattern.search(text):
            issues.append(f"AI-style structure: {message}")

    for _name, pattern, message in SLOP_WARNING_PATTERNS:
        if pattern.search(text):
            warnings.append(f"Possible AI-style wording: {message}")

    return issues, warnings


def banned_words_prompt_line() -> str:
    """The shared banned list, formatted for the writer's system prompt."""
    return ", ".join(AI_SLOP_WORDS)
