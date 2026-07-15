import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findNextSlot } from '@/lib/scheduler'
import { getChannelGroupIds } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  // Get full draft so we can write to published_posts memory
  // (select * so project_id comes along when the column exists)
  const { data: draft, error: fetchError } = await supabase
    .from('generated_drafts')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status === 'approved') {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  // Find booked dates for this channel — includes any project that shares
  // real social channels with this one (see getChannelGroupIds), so two
  // linked projects posting to the same real feed don't pick the same slot.
  // Falls back to the draft's own project only when nothing is linked.
  const pid = draft.project_id ?? null
  const groupIds = await getChannelGroupIds(supabase, pid)
  let bookedQuery = supabase.from('generated_drafts').select('scheduled_for').eq('channel', draft.channel)
  if (pid) bookedQuery = bookedQuery.in('project_id', groupIds)
  const { data: booked } = await bookedQuery.not('scheduled_for', 'is', null)

  const bookedDates = new Set((booked ?? []).map((r) => r.scheduled_for?.slice(0, 10)).filter(Boolean) as string[])
  const scheduledFor = findNextSlot(draft.channel, bookedDates)

  const { error } = await supabase
    .from('generated_drafts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      scheduled_for: scheduledFor.toISOString(),
      notes: 'Approved via dashboard',
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Write to published_posts — this is the permanent memory that prevents
  // the strategy agent from re-generating the same topics in future runs.
  await supabase.from('published_posts').insert({
    topic:      draft.topic,
    channel:    draft.channel,
    post_text:  draft.draft_text ?? '',
    draft_id:   id,
    published_at: new Date().toISOString(),
    ...(draft.project_id ? { project_id: draft.project_id } : {}),
    ...(draft.format ? { format: draft.format } : {}),
    ...(draft.pillar_id ? { pillar_id: draft.pillar_id } : {}),
  })

  return NextResponse.json({ scheduled_for: scheduledFor.toISOString() })
}
