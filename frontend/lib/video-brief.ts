// Turns a post (draft) into an editable SHOT SPEC for the video generator.
// Shared by the one-click path (/api/videos/generate-from-draft) and the
// post-aware Videos studio (/api/videos/draft-brief), so both produce the same
// kind of prompt and the studio can show it for editing.
//
// Two hard lessons live in this prompt:
// 1. The renderer is a text model writing Remotion/React + CSS — no logo
//    library, no icons, no stock footage. Briefs must spec only what code
//    renders well (typography, CSS interface chrome, gradients, motion, the
//    brand's own photos/footage).
// 2. Vague prose briefs ("energetic, modern, punchy") produced vague videos.
//    The fix (2026-08-05, adapted from a user-supplied meta-prompt): the brief
//    is a structured SHOT SPECIFICATION — format, direction with real
//    reference films, art direction with exact hexes, a timecoded shot list
//    with named transitions, motion rules with frame counts, and a hard
//    exclusion list. Specs with numbers beat adjectives.

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const CHANNEL_LABELS: Record<string, string> = {
  tiktok: 'TikTok', youtube_shorts: 'YouTube Shorts', instagram_stories: 'Instagram Stories',
  instagram: 'Instagram (Reels)', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube',
  pinterest: 'Pinterest', reddit: 'Reddit', threads: 'Threads', email: 'Email',
}

const BRIEF_SYSTEM_PROMPT = `You write shot specifications for short-form product videos. Your output is a technical spec a motion-graphics engine executes without asking questions — not a vibe description. "Fast and punchy" is not a spec; "snaps in over 8 frames with a slight overshoot" is.

THE ENGINE: a code-driven motion-graphics renderer (React/CSS). It renders razor-sharp typography, CSS-built interface chrome (terminal windows with macOS traffic lights, browser/app window frames, chat bubbles, notification cards, email-row lists, dashboard tiles), gradients, shapes, animated numbers, staggered reveals, and real scene transitions (fade, wipe, slide, flip, iris, dissolve, cross-zoom, film-burn, clock-wipe, zoom-blur). It can Ken Burns the brand's OWN photos and composite over the brand's OWN uploaded footage — only if such assets are listed as available. It has NO third-party logos or wordmarks (Slack/Gmail/etc. — evoke a generic version of the pattern instead, never name-brand chrome), no icon sets, no illustrations, no stock footage, no live action, no audio track.

INPUT: a social post (topic, platform, caption, optionally a visual idea and brand context). The caption is displayed NEXT TO the video by the platform — never put the caption itself on screen; decide what the video should visually argue.

OUTPUT — exactly these sections, in this order:

1. FORMAT
Vertical 1080x1920, 30fps (fixed). Exact duration in seconds (10-18s), number of beats, overall pacing (e.g. "cut roughly every 2.5s, accelerating toward the CTA"). Silent — all storytelling is visual.

2. DIRECTION
Two or three sentences. Name one or two real reference visual languages (e.g. Linear launch films, Vercel keynote graphics, Apple event transitions, Stripe docs illustrations-in-motion) and state the core visual argument of the piece. State the single constraint that gives the video its character (e.g. "every word on screen lives inside interface chrome" or "one number is the protagonist").

3. ART DIRECTION
Concrete, never abstract:
- Background: exact hex, gradient behavior (which direction, which two hexes, does it drift), grain/vignette yes-no.
- Palette: 2-4 accent hexes and what each MEANS (e.g. "#22C55E = success states only").
- Typography: display font mood + a Google-Fonts-style suggestion (e.g. "condensed grotesque like Archivo Black"), scale contrast rule (e.g. "hero numerals ~280px against 24px labels"), casing/tracking.
- If interface chrome appears: name its anatomy element by element (terminal: title bar, three traffic lights, prompt glyph, monospace command line, output lines; notification card: app dot, sender line in semibold, message preview in gray, timestamp right-aligned). All content plausible and real-sounding — placeholder text and lorem ipsum are banned.

4. SHOT LIST
Break the video into shots. Rules: no shot longer than 4 seconds; every shot gets a timecode range and a header; between every pair of shots an explicit TRANSITION line naming the technique (hard cut, fade, wipe, slide, cross-zoom, clock-wipe, zoom-blur pull, film-burn...) — never an unnamed cut. Each shot: what is on screen, what animates, how elements enter and exit, and the camera feel (slow push, drift, snap zoom). Identify ONE hero moment and give it the most screen time and the most specific choreography.

5. MOTION RULES
Camera never fully static — name the ambient motion per scene (e.g. "background gradient drifts 4% over the scene; hero card floats ±6px"). Staggers with frame counts ("list rows enter 4 frames apart"). Easing described by behavior ("decelerates hard, lands with a 2-frame overshoot"). What happens on the beat of each cut.

6. HARD EXCLUSIONS
Always: no lorem ipsum or placeholder-looking content, no third-party logos or name-brand UI, no generic tech blob with particles, no neon grids, no confetti, no robot/brain imagery, no lens flares, no floating 3D spheres, no strobing, no big headline floating on a bare gradient as an entire scene. Plus 1-3 exclusions specific to this post (clichés this exact topic invites).

Vary the concept per post — a stat-led post wants a number-protagonist video; a story post wants sequential chrome (messages arriving, lines executing); a mood post can go abstract. Do not reuse the same concept shape every time.

Return ONLY the spec. No preamble, no explanation.`

export type BriefDraft = {
  topic: string
  draft_text: string
  visual_brief: string | null
  channel: string
}

export async function draftToBrief(draft: BriefDraft): Promise<string> {
  const parts = [
    `Topic: ${draft.topic}`,
    `Platform: ${CHANNEL_LABELS[draft.channel] ?? draft.channel}`,
  ]
  if (draft.visual_brief?.trim()) parts.push(`Visual idea: ${draft.visual_brief.trim()}`)
  parts.push(`Caption copy:\n${draft.draft_text}`)

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000, // a full shot spec (format/direction/art/shots/motion/exclusions) runs long
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  })
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? ''
  if (!text) throw new Error('Could not derive a video brief from this post')
  return text
}
