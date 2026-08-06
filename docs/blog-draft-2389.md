# Teaching an AI Marketer to Stop Sounding Like AI

*Draft for 2389.ai/research/writing — byline: Aruzhan Zhengis*

*Products mentioned in this post: **Postique** — an AI marketing employee that researches, plans, writes, illustrates, and schedules a brand's social content, then learns from every rejection. A human approves everything before it ships.*

---

The first batch of posts Postique wrote for us looked great for about four seconds. Then you actually read one:

> Your flow state is gone. Not annoyed gone. Rebuild-context-for-twenty-minutes gone.

Nobody on our team writes like that. No human writes like that. But every LLM writes like that, constantly: the chopped fragments, the echo endings, the "Not X. Not Y." escalation ladder. We had built an AI marketing employee that researched real trends, planned a real calendar, and wrote posts that screamed *a robot made this* — which, for a company whose whole thesis is that agents can do real work, is a special kind of embarrassing.

This post is about what it took to fix that, and what we learned building a marketing agent that runs our actual social presence: prompts are suggestions, code is law, and the most useful thing an AI employee can do with your feedback is remember it.

## What Postique is

Postique is a marketing team in four cron jobs. Every morning it distills yesterday's human feedback into lessons. Weekly, it reads what our competitors shipped. On generation days it researches what's moving in our space, picks topics against our strategy, writes natively for each channel — LinkedIn doesn't get the TikTok script — matches photos from our library, runs every draft through QA, and schedules the survivors on a calendar. We approve or reject in the dashboard or straight from Slack.

One deliberate choice up front: it doesn't auto-post. It can't. We looked at the platform APIs twice and walked away twice — partly because API access for posting is a mess of app reviews and revocable tokens, but mostly because "an agent that publishes to your brand accounts unsupervised" is a product nobody should want yet. Every piece of content ends its pipeline as a *proposal*.

## Prompts don't stop slop. Linters do.

Our first anti-slop attempt was the obvious one: write better prompts. "Avoid clichés. Don't use em dashes. Vary your sentences." The writer had a beautiful style guide in its system prompt, and the drafts still opened with "In today's fast-paced world" energy and closed with rhetorical questions answering themselves.

The fix that actually worked was admitting that style rules are not instructions, they're *constraints* — and constraints belong in code. We wrote a deterministic linter that runs on every draft, no LLM involved:

```python
SLOP_PATTERNS = [
    ("not-just-its",
     r"n[o']t\s+just\s+...\b(it'?s|they'?re|this is)\b",
     "the 'it's not just X, it's Y' construction"),
    ("echo-ending",
     r"\b(\w{3,})[.!?]['\"]?\s+[^.!?\n]{0,60}?\b\1[.!?]",
     "consecutive sentences ending on the same word"),
    ("not-not-escalation",
     r"(?:^|[.!?]\s+)not\s+[^.!?\n]{1,40}[.!?]\s+not\s",
     "the 'Not X. Not Y.' escalation pattern"),
]
```

Plus a rhythm analyzer that counts words per sentence: three ultra-short sentences in a row fails the draft, and so does a post where more than half the sentences are under six words. That's the staccato tell — currently the most recognizable LLM cadence on the internet — expressed as arithmetic.

A violation isn't a note in a report. It blocks the draft, and the writer gets the exact findings fed back for one self-correcting rewrite before a human ever sees it. The prompt still teaches good style, but the linter is the reason the style survives contact with the model.

The best bug we found along the way: our own prompt was *causing* the staccato. It said "mix short, medium, and long sentences" and gave a punchy example. The model heard "fragments are rewarded." We deleted the example, wrote "at most ONE fragment per post," and the tic mostly died before the linter even fires.

## The agent that learns from being told no

Rejecting a bad draft felt wasteful. The information in that click — *this is off-brand, this is boring, this sounds like AI* — evaporated the moment we pressed the button, and the next batch made the same mistakes.

So we built a learning loop, and the honest description is that it's not machine learning at all. It's event sourcing plus a nightly reflection:

- **Capture.** Every rejection (with a one-tap reason), every manual edit (as a diff), and — the purest signal — a "paste what you actually posted" box that captures the delta between what the AI wrote and what a human shipped.
- **Distill.** A 5:45am cron reads the new events and rewrites a compact lessons memo: at most fifteen bullets, every lesson backed by at least two pieces of evidence, contradicted lessons dropped.
- **Inject.** The memo rides into every strategy and writing prompt from then on.

Reject three drafts for hashtag spam and the memo grows a line like `[instagram] cut hashtags to 2-3 — final edits removed them in 4/4 posts`, and the problem stops appearing. No fine-tuning, no training pipeline, a few cents of tokens a night. The agent gets cheaper to supervise every week, which is the actual metric that matters for an AI employee.

## Videos are code

The strangest part of Postique: it makes videos with no video model anywhere in the stack. A brief goes to Claude, Claude writes a React composition — real code, springs and easing curves and staggered reveals — and a render farm turns it into an MP4. A scale-to-zero machine spins up, renders, uploads, and goes back to sleep.

The output quality problem wasn't the renderer. It was the brief. Our first briefs read like a mood board: "energetic, modern, punchy." The model returned the video equivalent of that sentence — a headline sliding onto a gradient. Nobody's fault; vague in, vague out.

The fix was making the brief a *shot specification*. Exact duration and beat count. A palette where every hex has a meaning (`#22C55E = the three ranked results only; used nowhere else`). A timecoded shot list where no shot runs past four seconds and every cut names its transition. A hard exclusion list: no lorem ipsum, no neon grids, no floating 3D spheres, no confetti. And because the renders are HTML under the hood, the spec's best rule costs nothing: every word on screen lives inside interface chrome that would really contain it — a terminal line, an inbox row, a notification card — instead of floating over a background.

Same model, same renderer. The difference between a template and a product film turned out to be whether the director speaks in numbers or adjectives.

## What broke

Plenty, and some of it is still scar tissue:

- Scenes ended mid-animation because transitions *borrow* frames from both neighboring shots, and the model kept getting the arithmetic wrong. Compositions now must open with a frame map — every scene's range, every overlap, a checked sum — before any code.
- The website scraper met the modern web and lost; half the internet returns bot-check pages. We fall back to asking the human to paste, and we say so instead of pretending.
- A silent screen recording crashed the whole video analyzer because ffmpeg refuses to extract audio that doesn't exist. Probe first.
- The agent kept picking the same safe topics until we made it pitch double the topics it needs and semantically dedupe against everything it has ever posted.

And the biggest thing we learned isn't a technique. Halfway through, the system produced content nobody would post: the logic all "worked," and the whole was still wrong. What fixed it wasn't more features — it was fresh-eyes review of the actual output, the same discipline as code review, applied to an agent's work product. Agents don't tell you their output is mediocre. You have to look.

## Where it runs

Postique runs our channels today. A human still approves every post, and we think that's the right shape for this generation of agents: not autopilot — an employee with a very fast draft hand, a memory for feedback, and a manager who reads everything.

---

## SUGGESTED ASSETS (not part of the post)

**Screenshots** (I can capture all of these clean):
1. Dashboard calendar with a scheduled month + the day-panel open — the "employee's desk" shot
2. A draft's QA panel showing named rule violations — proof the linter is real
3. The reject flow with reason chips ("Sounds like AI") — the capture layer
4. Brand page "What the AI has learned" card with real lessons — the payoff shot
5. Idea Board with sticky notes + a pinned inspiration clipping — personality shot
6. Video studio showing the shot-spec prompt in the editable box

**Code/artifacts:**
7. The `SLOP_PATTERNS` excerpt (already inline in the draft)
8. A real frame-map comment from a generated composition (pull from `source/<video>.tsx` in storage)
9. Crontab block (learn 5:45 / intel Mon / research gated / generate 8:00) — the "four cron jobs" receipt

**Video:**
10. Embed one rendered video (the tmux/Turtle one with the man-page → lesson-card → skill-tree sequence) or a 6-frame contact sheet of it as an image
11. Optional before/after: an old "headline on gradient" render next to the shot-spec render — the strongest single visual argument in the post
