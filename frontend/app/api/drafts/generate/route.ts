import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { checkAiSlop, styleRulesPromptBlock } from '@/lib/style-rules'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
  x:
    'X (Twitter) post: 240 characters max. First line is everything — punchy, specific. No hashtags (they hurt reach on X). End with a specific question or an incomplete thought that invites a reply.',
  instagram_stories:
    'Instagram Stories plan: 3–7 frames, one idea per frame, at least one interactive element (poll/question/quiz). Format:\n[FRAME 1] ...\n[FRAME 2] ...',
  youtube_shorts:
    'YouTube Shorts script: 80–130 words, vertical, under 60s. Hook (text + spoken) in the first 3 seconds. Label sections:\n[HOOK] – first 3 seconds\n[BODY] – main content\n[CTA] – closing',
  pinterest:
    'Pinterest pin. Format:\nTitle: <60–100 chars, keyword-forward>\nDescription: <100–300 chars, keyword-rich>. No hashtags, no casual tone.',
  reddit:
    'Reddit post — value-first, NOT promotional. Practitioner voice, not marketing copy. Never pitch directly. Format:\nTitle: ...\nBody: <100–300 words, plain, first-person>',
  threads:
    'Threads post: 2–4 lines, casual and conversational, more relaxed than X. No hashtags.',
}

async function getBrandContext(): Promise<{ name: string; notes: string; strategy: string; voiceExamples: string }> {
  try {
    const pid = await getActiveProject()
    // select('*') so a not-yet-applied voice_examples migration can't error
    // the whole query (user applies setup_*.sql by hand).
    const { data } = await scoped(
      supabase.from('brand_profile').select('*'),
      pid
    )
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        name:          data.company_name   || 'the company',
        notes:         data.manual_notes   || '',
        strategy:      data.strategy       || '',
        voiceExamples: data.voice_examples || '',
      }
    }
  } catch {}
  return { name: 'the company', notes: '', strategy: '', voiceExamples: '' }
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
    'Write as a knowledgeable human on the team, not a marketing bot.',
    brand.voiceExamples
      ? 'REAL POSTS this brand has actually published — study their voice, rhythm, length, and level of casualness, and match it EXACTLY. Imitate the voice, never the content. If these read casual and understated, do not produce polished marketing structure:\n' +
        brand.voiceExamples.slice(0, 1500)
      : null,
    styleRulesPromptBlock(),
    'Output ONLY the post — no intro, no commentary, no quotes around it.',
  ].filter(Boolean).join('\n')

  const userPrompt = [
    `Topic / Event: ${topic}`,
    context ? `Extra context: ${context}` : null,
    '',
    `Format: ${channelGuide}`,
  ].filter(Boolean).join('\n')

  // Adaptive thinking shares max_tokens — 600 was small enough for the model
  // to burn it all thinking on a complex topic (same crash the pipeline hit).
  const generate = async (prompt: string, maxTokens = 2000): Promise<string> => {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-5',
      max_tokens: maxTokens,
      // Cached: identical across a session's generations (brand + style rules),
      // so retries and multi-channel writes within 5 min read at 0.1x.
      system:     [{ type: 'text', text: brandSystem, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    })
    const out = ((msg.content.find(b => b.type === 'text') as any)?.text ?? '').trim()
    if ((!out || msg.stop_reason === 'max_tokens') && maxTokens < 8000) {
      return generate(prompt, maxTokens * 4)
    }
    return out
  }

  let text = await generate(userPrompt)

  // Self-correcting slop pass: same deterministic lint QA enforces. One retry
  // with the exact violations fed back — prevention beats flagging.
  let lint = checkAiSlop(text)
  if (lint.issues.length > 0 && text) {
    const fixPrompt = [
      userPrompt,
      '',
      'Your previous draft violated these hard style rules:',
      ...lint.issues.map(i => `- ${i}`),
      '',
      'Rewrite the post fixing every violation. Same topic, format, and substance — different wording.',
      'Previous draft:',
      text,
    ].join('\n')
    const fixed = await generate(fixPrompt)
    if (fixed) {
      text = fixed
      lint = checkAiSlop(text)
    }
  }

  return NextResponse.json({ text, qa_issues: lint.issues, qa_warnings: lint.warnings })
}
