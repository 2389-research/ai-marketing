export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Bulk draft deletion for "Start over" / "Delete & replace".
// Three modes:
//   { scope: 'all_unposted' }  — wipe every draft that hasn't been posted
//   { scope: 'full_reset' }    — wipe ALL drafts AND all published_posts for
//                                the project. This erases posting history, so
//                                the content-maturity phase drops back to
//                                BRAND NEW and the next batch leads with a
//                                brand-introduction post again.
//   { ids: [...] }             — delete specific drafts (still guarded to unposted)
// Outside full_reset, posted drafts (posted_at set) are NEVER deleted — they're
// the project's real history and keep steering the strategy agent away from
// covered topics. Hard-deleting rows is what makes regeneration "forget" them:
// the strategy agent builds its avoid-list from pending/approved
// generated_drafts + published_posts.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { scope?: string; ids?: string[] }
  const pid = await getActiveProject()

  if (body.scope === 'full_reset') {
    if (!pid) return NextResponse.json({ error: 'No active project' }, { status: 400 })
    // published_posts first (FK parent-child order), then every draft.
    const { error: pubError } = await supabase
      .from('published_posts').delete().eq('project_id', pid)
    if (pubError) return NextResponse.json({ error: pubError.message }, { status: 500 })
    const { error: draftError, count } = await supabase
      .from('generated_drafts').delete({ count: 'exact' }).eq('project_id', pid)
    if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 })
    return NextResponse.json({ deleted: count ?? 0, historyReset: true })
  }

  // Resolve the exact target ids first — we need them to clear FK children.
  let sel = supabase.from('generated_drafts').select('id').is('posted_at', null)
  if (pid) sel = sel.eq('project_id', pid)

  if (body.scope === 'all_unposted') {
    // no further filter — everything unposted in this project
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    sel = sel.in('id', body.ids)
  } else {
    return NextResponse.json({ error: 'Pass scope: "all_unposted" or a non-empty ids array' }, { status: 400 })
  }

  const { data: targets, error: selError } = await sel
  if (selError) return NextResponse.json({ error: selError.message }, { status: 500 })
  const targetIds = (targets ?? []).map(t => t.id)
  if (targetIds.length === 0) return NextResponse.json({ deleted: 0 })

  // The approve route writes a published_posts bookkeeping row (topic memory)
  // at APPROVAL time — before anything is actually posted. Those rows FK-block
  // deleting the draft. For unposted drafts they're stubs of content that
  // never reached an audience, so they must go too — otherwise the strategy
  // agent would forever avoid topics that were never actually posted. Rows
  // belonging to genuinely posted drafts are untouchable here because posted
  // drafts (posted_at set) are excluded from targetIds.
  const { error: childError } = await supabase
    .from('published_posts').delete().in('draft_id', targetIds)
  if (childError) return NextResponse.json({ error: childError.message }, { status: 500 })

  const { error, count } = await supabase
    .from('generated_drafts').delete({ count: 'exact' }).in('id', targetIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: count ?? targetIds.length })
}
