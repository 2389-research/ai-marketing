// Turns a post (draft) into an editable VISUAL prompt for the video generator.
// Shared by the one-click path (/api/videos/generate-from-draft) and the
// post-aware Videos studio (/api/videos/draft-brief), so both produce the same
// kind of prompt and the studio can show it for editing.
//
// The hard lesson behind this prompt: the thing that RENDERS the video is a
// text model writing plain Remotion/React + CSS. It has NO logo library, NO
// icon set, NO stock footage, NO illustration — only typography, shapes,
// gradients, numeric/data motion, transitions, Ken Burns on the brand's own
// photos, and compositing over the brand's own uploaded videos. A brief that
// asks for "a Slack logo", "a USB-plug icon", or "someone typing in a terminal"
// can only be faked with crude shapes or text, which is exactly why past videos
// underwhelmed. So the brief is constrained to what code-gen actually does well.

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const CHANNEL_LABELS: Record<string, string> = {
  tiktok: 'TikTok', youtube_shorts: 'YouTube Shorts', instagram_stories: 'Instagram Stories',
  instagram: 'Instagram (Reels)', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube',
  pinterest: 'Pinterest', reddit: 'Reddit', threads: 'Threads', email: 'Email',
}

const BRIEF_SYSTEM_PROMPT = `You are a short-form video director writing a brief for a MOTION-GRAPHICS ENGINE, not a film crew. Given a social post (topic, caption, optionally a visual idea and platform), write a single concise creative brief for a short vertical video (Reels / TikTok / Shorts / Stories, ~8-15s) that pairs with the post.

CRITICAL — what the engine can actually make (brief ONLY these):
- Expressive TYPOGRAPHY: kinetic type, word-by-word reveals, big numbers/stats counting up, quotes.
- SHAPES & COLOR: gradients, geometric shapes, grids, lines, bars, progress meters, tasteful abstract motion.
- MOTION: scale/position drift (camera-like), springs, staggered reveals, real scene transitions (fade/wipe/slide/zoom/dissolve).
- The brand's OWN photos (Ken Burns) and OWN uploaded videos (as real footage to composite captions/effects over) — ONLY if provided; otherwise assume none.

Do NOT brief things the engine cannot make: no brand logos (Slack/Notion/etc.), no custom icons or pictograms, no illustrations, no realistic UI/app mockups or terminals, no live-action, no photos it doesn't have. If realism is essential to the idea, say "use the uploaded footage/photo if available" rather than describing footage that must be shot.

Rules:
- The caption sits NEXT TO the video — NEVER "put the caption on screen." Decide what it should VISUALLY convey.
- Pick a CONCRETE treatment and vary it to the post — don't default to "words on a background" every time. Choose the strongest of: a typographic burst, a number/stat reveal, an abstract motion-design look, a photo montage, footage with a callout, etc. If helpful, sketch 2-4 beats in order.
- Be specific about mood, palette feel, energy and pacing so it isn't generic — but leave exact design to the engine.
- Output ONLY the brief as 2-4 sentences of plain prose. No preamble, bullets, headers, or quotes.`

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
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  })
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? ''
  if (!text) throw new Error('Could not derive a video brief from this post')
  return text
}
