export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Topic map — "the AI watches it so you don't have to". Takes the timestamped
// transcript the analyze step already produced and returns the distinct topics
// discussed, each with its strongest contiguous range, so the user picks from
// a menu instead of scrubbing the timeline.
const SYSTEM = `You map the distinct TOPICS discussed in a video from its timestamped transcript.

Rules:
- A topic is a coherent subject the speaker spends real time on — not every sentence is a topic.
  Typical videos have 3-8; return fewer rather than inventing thin ones.
- For each topic give its SINGLE strongest contiguous time range (the best stretch to clip),
  plus every range where it comes up (speakers often return to a topic later).
- quote = the single most quotable/hook-worthy line, verbatim from the transcript.
- strength 1-10 = how compelling this topic would be as a standalone social clip.

Respond ONLY with valid JSON:
{"topics": [{
  "title": "short punchy name",
  "summary": "one sentence of what is actually said",
  "quote": "verbatim best line",
  "strength": 7,
  "start": 12.5, "end": 95.0,
  "all_ranges": [{"start": 12.5, "end": 95.0}, {"start": 400.2, "end": 431.0}]
}]}`

export async function POST(req: NextRequest) {
  const { transcript_segments } = await req.json()
  if (!Array.isArray(transcript_segments) || transcript_segments.length === 0) {
    return NextResponse.json({ error: 'transcript_segments required' }, { status: 400 })
  }

  const transcript = transcript_segments
    .map((s: { start: number; end: number; text: string }) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n')
    .slice(0, 60_000)

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 6000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcript}\n\nReturn the topic map JSON.` }],
    })
    const text = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
    const parsed = JSON.parse(jsonStr)
    const topics = (parsed.topics ?? [])
      .filter((t: any) => typeof t.start === 'number' && typeof t.end === 'number' && t.end > t.start)
      .sort((a: any, b: any) => (b.strength ?? 0) - (a.strength ?? 0))
    return NextResponse.json({ topics })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Topic mapping failed' }, { status: 502 })
  }
}
