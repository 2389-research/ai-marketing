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

// Turns a raw brainstorm note into a card with potential: angles, channels, hook.
const SYSTEM = `You develop a founder's raw content idea for their brand.
Given the idea and brand context, respond ONLY with JSON:
{"angles": ["2-3 distinct concrete angles, one line each"],
 "channels": ["2-3 channel ids from: linkedin,instagram,email,tiktok,youtube,x,instagram_stories,youtube_shorts,pinterest,reddit,threads"],
 "hook": "one punchy opening line for the strongest angle"}
Stay concrete and specific to the idea — no generic marketing filler.`

export async function POST(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const pid = await getActiveProject()

  const { data: idea } = await supabase.from('ideas').select('*').eq('id', id).maybeSingle()
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const { data: brand } = await scoped(supabase.from('brand_profile').select('*'), pid).limit(1).maybeSingle()
  const brandCtx = brand
    ? `Company: ${brand.company_name ?? ''}\nNotes: ${(brand.manual_notes ?? '').slice(0, 300)}`
    : '(no brand context)'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: `BRAND:\n${brandCtx}\n\nIDEA:\n${idea.text}` }],
    })
    const text = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const enrichment = JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim())
    await supabase.from('ideas').update({ enrichment }).eq('id', id)
    return NextResponse.json({ enrichment })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Enrichment failed' }, { status: 502 })
  }
}
