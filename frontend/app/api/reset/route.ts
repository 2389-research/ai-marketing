import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key so bulk deletes bypass RLS — this route is server-only
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// DELETE /api/reset
// Wipes all pipeline data so the system can start from scratch.
// Brand profile (company name, strategy, voice, URLs) is preserved.
export async function DELETE() {
  const errors: string[] = []
  const counts: Record<string, number> = {}

  // 1. Research candidates
  const r1 = await db.from('research_candidates').delete({ count: 'exact' }).not('id', 'is', null)
  if (r1.error) errors.push(`research_candidates: ${r1.error.message}`)
  else counts.research = r1.count ?? 0

  // 2. Published posts first — has FK draft_id → generated_drafts(id)
  const r3 = await db.from('published_posts').delete({ count: 'exact' }).not('id', 'is', null)
  if (r3.error) errors.push(`published_posts: ${r3.error.message}`)
  else counts.published = r3.count ?? 0

  // 3. Generated drafts — must come after published_posts due to FK constraint
  const r2 = await db.from('generated_drafts').delete({ count: 'exact' }).not('id', 'is', null)
  if (r2.error) errors.push(`generated_drafts: ${r2.error.message}`)
  else counts.drafts = r2.count ?? 0

  // 4. Reset scrape cooldown so website gets re-scraped on next run
  const r4 = await db.from('brand_profile').update({
    last_website_scraped: null,
    strategy_updated_at:  null,
  }).not('id', 'is', null)
  if (r4.error) errors.push(`brand_profile reset: ${r4.error.message}`)

  if (errors.length > 0) {
    return NextResponse.json({ errors, deleted: counts }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: counts })
}
