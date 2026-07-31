export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// "Into the pipeline": the idea becomes a high-scored research candidate, so
// the strategist weighs it against trends in the next batch. source_category
// 'idea' gets explicit priority in the strategy prompt.
export async function POST(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const pid = await getActiveProject()

  const { data: idea } = await supabase.from('ideas').select('*').eq('id', id).maybeSingle()
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const hook = idea.enrichment?.hook ?? ''
  const angles = (idea.enrichment?.angles ?? []).join(' | ')
  const { error } = await supabase.from('research_candidates').insert(stampRow({
    title: idea.text.slice(0, 180),
    summary: [hook, angles].filter(Boolean).join(' — ').slice(0, 500) || idea.text.slice(0, 500),
    source: 'Founder idea',
    source_category: 'idea',
    score: 8.5,
    score_reason: 'Founder-submitted idea from the Idea Inbox',
  }, pid))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('ideas').update({ status: 'queued' }).eq('id', id)
  return NextResponse.json({ ok: true })
}
