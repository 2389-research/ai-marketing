import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CHANNEL_GUIDE: Record<string, string> = {
  linkedin:
    'LinkedIn post: 150–250 words. Strong opening sentence (no "I\'m excited to share"). End with a question or insight. No hashtags. Professional but human.',
  instagram:
    'Instagram caption: 60–120 words. The first line must work as a standalone hook. Conversational, specific, visual. End with 3–5 relevant hashtags.',
  email:
    'Marketing email. Format:\nSubject: <under 50 chars>\nPreview: <under 90 chars>\n\n<body: 120–200 words, one clear CTA>',
  tiktok:
    'TikTok script: 100–150 words, written to be spoken aloud. Label sections:\n[HOOK] – first 3 seconds\n[BODY] – main content\n[CTA] – closing call to action',
  youtube:
    'YouTube script: 250–400 words, written to be spoken aloud. Label sections:\n[HOOK] – first 15 seconds\n[CONTEXT] – setup\n[INSIGHT] – main point\n[EXAMPLES] – supporting evidence\n[TAKEAWAY] – key message\n[CTA] – closing',
}

async function getBrandContext(): Promise<{ name: string; notes: string; strategy: string }> {
  try {
    const { data } = await supabase
      .from('brand_profile')
      .select('company_name, manual_notes, strategy')
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        name:     data.company_name     || 'the company',
        notes:    data.manual_notes     || '',
        strategy: data.strategy         || '',
      }
    }
  } catch {}
  return { name: 'the company', notes: '', strategy: '' }
}

export async function POST(req: NextRequest) {
  const { topic, channel, context } = await req.json()

  if (!topic || !channel) {
    return NextResponse.json({ error: 'topic and channel are required' }, { status: 400 })
  }

  const brand       = await getBrandContext()
  const channelGuide = CHANNEL_GUIDE[channel] ?? CHANNEL_GUIDE.linkedin

  const brandSystem = [
    `You are a content strategist and copywriter for ${brand.name}.`,
    brand.notes    ? `About the company: ${brand.notes.slice(0, 400)}` : null,
    brand.strategy ? `Brand strategy excerpt:\n${brand.strategy.slice(0, 800)}` : null,
    '',
    'Tone: technically credible, curious, direct, occasionally witty. Never dry or corporate.',
    'Never write: "game-changer", "cutting-edge", "revolutionary", "leverage", "synergy", "excited to announce", "move the needle".',
    'Write as a knowledgeable human on the team, not a marketing bot.',
    'Output ONLY the post — no intro, no commentary, no quotes around it.',
  ].filter(Boolean).join('\n')

  const userPrompt = [
    `Topic / Event: ${topic}`,
    context ? `Extra context: ${context}` : null,
    '',
    `Format: ${channelGuide}`,
  ].filter(Boolean).join('\n')

  const completion = await openai.chat.completions.create({
    model:       'gpt-4o',
    max_tokens:  600,
    temperature: 0.8,
    messages: [
      { role: 'system', content: brandSystem },
      { role: 'user',   content: userPrompt  },
    ],
  })

  const text = completion.choices[0].message.content?.trim() ?? ''
  return NextResponse.json({ text })
}
