export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { generateAndRenderVideo } from '@/lib/video-generate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// The critical translation step. A post's copy is the CAPTION that sits next
// to the video, not a script to stamp on screen — same lesson as the photo
// matcher ("caption complements the image, doesn't repeat it"). This turns a
// draft into a brief for what the video should visually SHOW.
const BRIEF_SYSTEM_PROMPT = `You are a short-form video director. You are given a social post (its topic, caption copy, and optionally a visual idea and target platform). Produce a single concise creative brief for a short vertical video (Reels / TikTok / Shorts / Stories format, roughly 8-15 seconds) that would pair with this post.

Rules:
- The caption is what sits NEXT TO the video, not a teleprompter. Do NOT just say "put the caption text on screen." Decide what the video should visually SHOW to land this post's message — the mood, the key idea, a punchy on-screen hook (a few words, not the whole caption), and how it should move and pace.
- If a "visual idea" is provided, treat it as the strongest signal and build on it.
- Be specific about mood and look (palette feel, energy, pacing) so the video isn't generic — but leave the exact design to the video generator; you're writing direction, not code.
- Output ONLY the brief as 2-4 sentences of plain prose. No preamble, no bullet points, no headers, no quotes.`

const CHANNEL_LABELS: Record<string, string> = {
  tiktok: 'TikTok', youtube_shorts: 'YouTube Shorts', instagram_stories: 'Instagram Stories',
  instagram: 'Instagram (Reels)', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube',
  pinterest: 'Pinterest', reddit: 'Reddit', threads: 'Threads', email: 'Email',
}

async function draftToBrief(draft: {
  topic: string; draft_text: string; visual_brief: string | null; channel: string
}): Promise<string> {
  const parts = [`Topic: ${draft.topic}`, `Platform: ${CHANNEL_LABELS[draft.channel] ?? draft.channel}`]
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

export async function POST(req: NextRequest) {
  const { draft_id } = (await req.json().catch(() => ({}))) as { draft_id?: string }
  if (!draft_id) {
    return NextResponse.json({ error: 'draft_id is required' }, { status: 400 })
  }

  const projectId = await getActiveProject()

  const { data: draft, error } = await scoped(
    supabase.from('generated_drafts').select('id, topic, draft_text, visual_brief, channel'), projectId,
  ).eq('id', draft_id).limit(1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  let brief: string
  try {
    brief = await draftToBrief(draft)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Brief generation failed' }, { status: 502 })
  }

  const result = await generateAndRenderVideo(brief, projectId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, brief }, { status: 502 })
  }

  // The client attaches the video to the draft's media array via its existing
  // media logic (keeps local state + DB in sync the same way photo-match does),
  // so we just return the video and the brief we used.
  return NextResponse.json({ video: result.video, brief, attempts: result.attempts })
}
