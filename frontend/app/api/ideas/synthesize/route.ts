export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// "What should I make?" — Layer 2 of the brain-dump funnel. Reads the user's
// own dumped ideas + inspiration clippings, clusters them, and proposes a
// SMALL number of concrete post concepts. This is Lane B: it draws only from
// the user's raw material, never touches scheduling, and is explicitly
// de-conflicted against Lane A (the research pipeline) so the two never
// propose the same thing.
const SYSTEM = `You help a founder turn their scattered raw ideas into a SMALL number of concrete, ready-to-make post concepts.

You are given:
1. Their DUMPED MATERIAL — raw ideas and saved inspiration, unorganized.
2. ALREADY COVERED — topics already drafted, scheduled, published, or queued by the automated research pipeline. You must NOT propose anything that overlaps these; this material is handled elsewhere.

Your job:
- CLUSTER related fragments. The most valuable move is combining several dumped pieces into one post concept the founder wouldn't have connected themselves.
- Propose AT MOST 3 concepts. Fewer is better if the material is thin — never pad. If nothing is post-worthy yet, return an empty array.
- Each concept must draw from the dumped material, not invent a brand-new topic out of nothing.
- Skip anything that overlaps ALREADY COVERED.

Respond ONLY with valid JSON:
{"concepts": [{
  "title": "short concept name",
  "angle": "one or two sentences: what the post actually says and why it works",
  "draws_from": [1, 4],           // the idea NUMBERS this combines (from the dumped list)
  "channel": "one channel id from: linkedin,instagram,email,tiktok,youtube,x,instagram_stories,youtube_shorts,pinterest,reddit,threads",
  "why_now": "one short line on why this is worth making"
}]}`

export async function POST(_req: NextRequest) {
  const pid = await getActiveProject()

  // 1) The dumped material: unrealized ideas + clippings only (not already
  //    drafted/queued/archived), newest first, capped.
  const { data: ideaRows } = await scoped(
    supabase.from('ideas').select('id, text, kind, enrichment, source_url, status'),
    pid,
  ).eq('status', 'new').order('created_at', { ascending: false }).limit(40)

  const ideas = ideaRows ?? []
  if (ideas.length < 2) {
    return NextResponse.json({
      concepts: [],
      note: 'Dump a few more ideas or clippings first — I need at least a couple of raw pieces to find something worth making.',
    })
  }

  // 2) ALREADY COVERED — everything Lane A (and prior Lane B) already handled,
  //    so we never propose a duplicate or fight the scheduler.
  const [{ data: drafts }, { data: pub }, { data: cand }] = await Promise.all([
    scoped(supabase.from('generated_drafts').select('topic, status'), pid)
      .in('status', ['pending', 'approved']).limit(80),
    scoped(supabase.from('published_posts').select('topic'), pid).limit(80),
    scoped(supabase.from('research_candidates').select('title, status'), pid)
      .neq('status', 'rejected').limit(60),
  ])
  const covered = [
    ...(drafts ?? []).map((d: any) => d.topic),
    ...(pub ?? []).map((p: any) => p.topic),
    ...(cand ?? []).map((c: any) => c.title),
  ].filter(Boolean)

  // 3) Brand context so concepts fit this brand's voice/strategy.
  const { data: brand } = await scoped(supabase.from('brand_profile').select('*'), pid)
    .limit(1).maybeSingle()
  const brandCtx = brand
    ? `Company: ${brand.company_name ?? ''}\nNotes: ${(brand.manual_notes ?? '').slice(0, 400)}`
    : '(no brand context)'

  const dumpedText = ideas.map((it: any, i: number) => {
    const tag = it.kind === 'inspiration' ? 'INSPIRATION' : 'IDEA'
    const hook = it.enrichment?.hook ? ` (hook: ${it.enrichment.hook})` : ''
    return `${i + 1}. [${tag}] ${it.text}${hook}`
  }).join('\n')

  const coveredText = covered.length
    ? covered.slice(0, 120).map((t: string) => `- ${t}`).join('\n')
    : '(nothing covered yet)'

  const userMsg = [
    `BRAND:\n${brandCtx}`,
    `\nDUMPED MATERIAL (${ideas.length} pieces):\n${dumpedText}`,
    `\nALREADY COVERED (do NOT overlap these):\n${coveredText}`,
    `\nPropose at most 3 post concepts from the dumped material. Return the JSON.`,
  ].join('\n')

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    })
    const raw = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim())
    const concepts = (parsed.concepts ?? []).slice(0, 3).map((c: any) => ({
      title: String(c.title ?? '').slice(0, 120),
      angle: String(c.angle ?? ''),
      channel: c.channel ?? 'linkedin',
      why_now: String(c.why_now ?? ''),
      // Map the model's 1-based idea numbers back to real idea ids so "Make
      // this" can mark exactly those source ideas as drafted.
      source_ids: (Array.isArray(c.draws_from) ? c.draws_from : [])
        .map((n: number) => ideas[n - 1]?.id)
        .filter(Boolean),
      draws_from_text: (Array.isArray(c.draws_from) ? c.draws_from : [])
        .map((n: number) => ideas[n - 1]?.text)
        .filter(Boolean),
    }))
    return NextResponse.json({ concepts })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Synthesis failed' }, { status: 502 })
  }
}
