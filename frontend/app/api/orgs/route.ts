export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser, getUserOrgs, getActiveOrg } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ACTIVE_ORG = 'active_org'

// GET — the companies the signed-in user belongs to (for the org switcher).
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const [orgs, active] = await Promise.all([getUserOrgs(user.id), getActiveOrg(user.id)])
  return NextResponse.json({ orgs, active_org_id: active?.org_id ?? null })
}

// POST — create a company. The creator becomes its Owner.
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { name } = await req.json().catch(() => ({}))
  if (!name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: name.trim(), created_by: user.id })
    .select('id, join_code')
    .single()
  if (error) {
    const msg = error.message.includes('does not exist') || error.message.includes('schema cache')
      ? 'Auth tables not found — run sql/setup_auth_orgs.sql in the Supabase SQL editor'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { error: memErr } = await db
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  const res = NextResponse.json({ org_id: org.id, join_code: org.join_code })
  res.cookies.set(ACTIVE_ORG, org.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
