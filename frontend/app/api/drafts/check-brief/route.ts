export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Runs once per brief regardless of how many channels are selected — a
// separate call from /api/drafts/generate (which runs once per channel)
// so the brief isn't re-judged N times and questions can't differ per channel.
export async function POST(req: NextRequest) {
  const { topic, context } = await req.json()

  if (!topic) {
    return NextResponse.json({ sufficient: true })
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You judge whether a content brief has enough concrete substance to write a specific, non-generic social/marketing post, or whether it's too vague and needs follow-up questions first.

Vague means it could apply to almost any company: "we have a new person," "we did something cool," "post about our event," "big news today." Sufficient means it has at least one real, specific detail: a name, a number, a date, a concrete outcome, an actual hook.

Respond ONLY with valid JSON, no markdown fences:
{"sufficient": true}
or
{"sufficient": false, "questions": ["short question 1", "short question 2"]}

At most 3 questions, each short and concrete (asking for one specific missing fact, not general elaboration).`,
      messages: [
        {
          role: 'user',
          content: `Topic/brief: ${topic}${context ? `\nExtra context: ${context}` : ''}`,
        },
      ],
    })

    const raw = ((msg.content.find(b => b.type === 'text') as any)?.text ?? '').trim()
    const cleaned = raw.startsWith('```') ? raw.split('```')[1].replace(/^json/, '') : raw
    const parsed = JSON.parse(cleaned)

    if (parsed.sufficient === false && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return NextResponse.json({ sufficient: false, questions: parsed.questions.slice(0, 3) })
    }
    return NextResponse.json({ sufficient: true })
  } catch {
    // Fail open — a broken triage call should never block the user from generating.
    return NextResponse.json({ sufficient: true })
  }
}
