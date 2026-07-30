export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cut planner: given a chosen topic's time range and a target clip length,
// pick the exact in/out points on sentence boundaries — the strongest
// contiguous stretch of that topic, not just "the first N seconds of it".
const SYSTEM = `You pick the exact cut for a social clip from a timestamped transcript.

Rules:
- The cut must be CONTIGUOUS, start and end on sentence boundaries (use segment
  timestamps), and land close to the target length (±20% is fine; never exceed 2x).
- Choose the strongest stretch: a clear beginning (no mid-thought entry), the
  topic's core point, and a natural ending.
- hook = a short overlay title for the clip (max 8 words, punchy, no clickbait).

Respond ONLY with valid JSON: {"start": 34.2, "end": 66.8, "hook": "..."}`

export async function POST(req: NextRequest) {
  const { transcript_segments, topic_title, range_start, range_end, target_seconds } = await req.json()
  if (!Array.isArray(transcript_segments) || typeof target_seconds !== 'number') {
    return NextResponse.json({ error: 'transcript_segments and target_seconds required' }, { status: 400 })
  }

  // Only the transcript inside (a padded version of) the topic's range.
  const pad = 15
  const within = transcript_segments.filter(
    (s: { start: number; end: number }) =>
      s.end >= (range_start ?? 0) - pad && s.start <= (range_end ?? Infinity) + pad,
  )
  const transcript = within
    .map((s: { start: number; end: number; text: string }) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n')
    .slice(0, 30_000)

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `TOPIC: ${topic_title ?? '(unspecified)'}\nTARGET LENGTH: ${target_seconds} seconds\n\nTRANSCRIPT (this topic's portion):\n${transcript}\n\nReturn the cut JSON.`,
      }],
    })
    const text = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
    const cut = JSON.parse(jsonStr)
    if (typeof cut.start !== 'number' || typeof cut.end !== 'number' || cut.end <= cut.start) {
      throw new Error('planner returned an invalid range')
    }
    return NextResponse.json({ start: cut.start, end: cut.end, hook: cut.hook ?? '' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Cut planning failed' }, { status: 502 })
  }
}
