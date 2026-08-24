export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser, getActiveOrg, canManageTeam } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// GET — pending invitations for the active company.
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org) return NextResponse.json({ invites: [] })
  const { data } = await db
    .from('org_invitations')
    .select('id, email, role, code, status, created_at')
    .eq('org_id', org.org_id).eq('status', 'pending')
    .order('created_at', { ascending: false })
  return NextResponse.json({ invites: data ?? [] })
}

// POST { email, role } — invite someone by email. Owner/Admin only. Returns the
// invite (with its code) so the UI can show a shareable /join/<code> link.
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org || !canManageTeam(org.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const { email, role } = await req.json().catch(() => ({}))
  const clean = (email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })
  const r = ['admin', 'member'].includes(role) ? role : 'member' // Owners are created, not invited

  // Reuse an existing pending invite for the same email rather than piling up.
  const { data: existing } = await db
    .from('org_invitations').select('id, code')
    .eq('org_id', org.org_id).eq('email', clean).eq('status', 'pending').maybeSingle()
  if (existing) {
    await db.from('org_invitations').update({ role: r }).eq('id', existing.id)
    return NextResponse.json({ invite: { ...existing, email: clean, role: r } })
  }

  const { data, error } = await db
    .from('org_invitations')
    .insert({ org_id: org.org_id, email: clean, role: r, invited_by: user.id })
    .select('id, email, role, code, status, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Note: this records the invite and produces a shareable link. Actual invite
  // EMAIL delivery is a later step (needs an email provider wired up).
  return NextResponse.json({ invite: data })
}

// DELETE { id } — revoke a pending invite. Owner/Admin only.
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org || !canManageTeam(org.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await db.from('org_invitations').update({ status: 'revoked' }).eq('id', id).eq('org_id', org.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
