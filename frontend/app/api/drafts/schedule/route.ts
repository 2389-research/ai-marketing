import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { topic, draft_text, channel, scheduled_for } = await req.json()

  if (!topic || !draft_text || !channel || !scheduled_for) {
    return NextResponse.json(
      { error: 'topic, draft_text, channel, and scheduled_for are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase.from('generated_drafts').insert({
    topic,
    channel,
    draft_text,
    qa_passed: true,
    status: 'approved',
    scheduled_for,
    notes: 'Manually created from calendar',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}
