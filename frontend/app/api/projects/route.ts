export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser, getActiveOrg } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// The brands the current viewer may see: a signed-in user gets only their
// ACTIVE COMPANY's brands; a legacy (shared-password) user still gets all.
export async function GET() {
  let orgId: string | null = null
  try {
    const user = await getUser()
    if (user) orgId = (await getActiveOrg(user.id))?.org_id ?? null
  } catch { /* legacy / pre-migration */ }

  let q = db.from('projects').select('id, name, created_at').order('created_at')
  if (orgId) q = q.eq('org_id', orgId)

  const { data, error } = await q
  if (error) {
    // Pre-migration: table missing — report empty so the UI hides the switcher
    return NextResponse.json([])
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // New brands belong to the creator's active company.
  let orgId: string | null = null
  try {
    const user = await getUser()
    if (user) orgId = (await getActiveOrg(user.id))?.org_id ?? null
  } catch { /* legacy */ }

  const { data: project, error } = await db
    .from('projects')
    .insert(orgId ? { name: name.trim(), org_id: orgId } : { name: name.trim() })
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Every project owns exactly one brand profile row — create it empty so the
  // Brand page has something to edit immediately after switching.
  await db.from('brand_profile').insert({ company_name: name.trim(), project_id: project.id })

  return NextResponse.json(project)
}
