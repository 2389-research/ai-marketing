import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { getUser, getActiveOrg, canManageTeam } from '@/lib/auth'

// Service role key so bulk deletes bypass RLS — this route is server-only.
// (The anon fallback stays until RLS lands in #1; the authorization gate below
// is what actually closes the cross-tenant exploit, not the key choice.)
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// DELETE /api/reset
// Wipes all pipeline data (for the active brand) so it can start from scratch.
// Brand profile (company name, strategy, voice, URLs) is preserved.
//
// Issue #3: this is a service-role bulk delete. It MUST prove the caller is an
// owner/admin of the active company, and MUST only ever resolve a brand inside
// that company. getActiveProject() (issue #7) now fails closed, so a forged
// cookie from an org-less session resolves to null and is rejected below.
export async function DELETE() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org || !canManageTeam(org.role)) {
    return NextResponse.json({ error: 'Only an owner or admin can reset a brand' }, { status: 403 })
  }

  const errors: string[] = []
  const counts: Record<string, number> = {}
  const pid = await getActiveProject()
  // Fail closed: getActiveProject only returns a brand inside the caller's
  // active company, so a null here means no legitimate target.
  if (!pid) return NextResponse.json({ error: 'No active brand to reset' }, { status: 400 })

  // 1. Research candidates
  const r1 = await scoped(db.from('research_candidates').delete({ count: 'exact' }), pid).not('id', 'is', null)
  if (r1.error) errors.push(`research_candidates: ${r1.error.message}`)
  else counts.research = r1.count ?? 0

  // 2. Published posts first — has FK draft_id → generated_drafts(id)
  const r3 = await scoped(db.from('published_posts').delete({ count: 'exact' }), pid).not('id', 'is', null)
  if (r3.error) errors.push(`published_posts: ${r3.error.message}`)
  else counts.published = r3.count ?? 0

  // 3. Generated drafts — must come after published_posts due to FK constraint
  const r2 = await scoped(db.from('generated_drafts').delete({ count: 'exact' }), pid).not('id', 'is', null)
  if (r2.error) errors.push(`generated_drafts: ${r2.error.message}`)
  else counts.drafts = r2.count ?? 0

  // 4. Reset scrape cooldown so website gets re-scraped on next run
  const r4 = await scoped(db.from('brand_profile').update({
    last_website_scraped: null,
    strategy_updated_at:  null,
  }), pid).not('id', 'is', null)
  if (r4.error) errors.push(`brand_profile reset: ${r4.error.message}`)

  if (errors.length > 0) {
    return NextResponse.json({ errors, deleted: counts }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: counts })
}
