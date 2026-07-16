import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/drafts/[id]/mark-posted — you posted this yourself somewhere;
// record it. Separate from `status` (still 'approved') since auto-posting
// is disabled and "approved" no longer implies "posted".
//
// Optional body: { likes?: number, comments?: number } — with auto-posting
// off, published_posts.engagement never gets populated any other way, which
// would leave agents/audit_agent.py's percentile ranking permanently dead.
// Logging real numbers here (even just once in a while) is the only way
// that feature has any real data to work with.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json().catch(() => ({}))
  const { likes, comments } = body as { likes?: number; comments?: number }
  const hasEngagement = likes !== undefined || comments !== undefined

  const { error: draftError } = await supabase
    .from('generated_drafts')
    .update({ posted_at: new Date().toISOString() })
    .eq('id', id)

  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 })

  if (!hasEngagement) return NextResponse.json({ ok: true })

  const engagement = { likes: likes ?? 0, comments: comments ?? 0 }

  // published_posts may already have a bookkeeping row for this draft (the
  // dashboard's approve route writes one) — but a draft approved via Slack
  // instead never gets one, so upsert rather than assuming it exists.
  const { data: existing } = await supabase
    .from('published_posts')
    .select('id')
    .eq('draft_id', id)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('published_posts')
      .update({ engagement })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { data: draft } = await supabase
    .from('generated_drafts')
    .select('topic, channel, draft_text, project_id')
    .eq('id', id)
    .single()

  const { error: insertError } = await supabase.from('published_posts').insert({
    draft_id: id,
    topic: draft?.topic ?? '',
    channel: draft?.channel ?? '',
    post_text: draft?.draft_text ?? '',
    published_at: new Date().toISOString(),
    engagement,
    ...(draft?.project_id ? { project_id: draft.project_id } : {}),
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
