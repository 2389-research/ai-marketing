export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { draftToBrief, CHANNEL_LABELS } from '@/lib/video-brief'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Returns an editable visual prompt derived from a post, WITHOUT rendering —
// the Videos studio shows it so the user can tweak it before generating.
export async function POST(req: NextRequest) {
  const { draft_id } = (await req.json().catch(() => ({}))) as { draft_id?: string }
  if (!draft_id) return NextResponse.json({ error: 'draft_id is required' }, { status: 400 })

  const projectId = await getActiveProject()
  const { data: draft, error } = await scoped(
    supabase.from('generated_drafts').select('id, topic, draft_text, visual_brief, channel'), projectId,
  ).eq('id', draft_id).limit(1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  try {
    const brief = await draftToBrief(draft)
    return NextResponse.json({
      brief,
      topic: draft.topic,
      channel: draft.channel,
      channelLabel: CHANNEL_LABELS[draft.channel] ?? draft.channel,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Brief generation failed' }, { status: 502 })
  }
}
