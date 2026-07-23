export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Bulk draft deletion for "Start over" / "Delete & replace".
// Two modes:
//   { scope: 'all_unposted' }  — wipe every draft that hasn't been posted
//   { ids: [...] }             — delete specific drafts (still guarded to unposted)
// Posted drafts (posted_at set) are NEVER deleted here — they're the project's
// real history and keep steering the strategy agent away from covered topics.
// Hard-deleting unposted rows is what makes regeneration "forget" them: the
// strategy agent builds its avoid-list from pending/approved generated_drafts,
// so removed rows free their topics up to be re-explored.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { scope?: string; ids?: string[] }
  const pid = await getActiveProject()

  let query = supabase.from('generated_drafts').delete({ count: 'exact' }).is('posted_at', null)
  if (pid) query = query.eq('project_id', pid)

  if (body.scope === 'all_unposted') {
    // no further filter — everything unposted in this project
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    query = query.in('id', body.ids)
  } else {
    return NextResponse.json({ error: 'Pass scope: "all_unposted" or a non-empty ids array' }, { status: 400 })
  }

  const { error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: count ?? 0 })
}
