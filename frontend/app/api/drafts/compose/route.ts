import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { topic, draft_text, channels } = await req.json()

  if (!topic || !draft_text || !channels?.length) {
    return NextResponse.json({ error: 'topic, draft_text, and channels are required' }, { status: 400 })
  }

  const pid = await getActiveProject()
  const inserts = channels.map((channel: string) => stampRow({
    topic,
    channel,
    draft_text,
    qa_passed: null,
    status: 'pending',
    notes: 'Manually written via dashboard',
  }, pid))

  const { data, error } = await supabase.from('generated_drafts').insert(inserts).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: data })
}
