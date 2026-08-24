export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser, getActiveOrg, getRole, listMembers, canManageTeam } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// GET — members of the active company (+ the caller's own role).
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org) return NextResponse.json({ members: [], role: null })
  return NextResponse.json({
    members: await listMembers(org.org_id),
    role: org.role,
    me: user.id,
    org: { name: org.name, join_code: org.join_code },
  })
}

// PATCH { user_id, role } — change a member's role. Owner/Admin only.
export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org || !canManageTeam(org.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const { user_id, role } = await req.json().catch(() => ({}))
  if (!user_id || !['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'user_id and a valid role are required' }, { status: 400 })
  }
  // Only an Owner can grant or change Owner; and never strip the last owner.
  if ((role === 'owner' || (await getRole(user_id, org.org_id)) === 'owner') && org.role !== 'owner') {
    return NextResponse.json({ error: 'Only an owner can change ownership' }, { status: 403 })
  }
  const { error } = await db.from('org_members').update({ role }).eq('org_id', org.org_id).eq('user_id', user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { user_id } — remove a member. Owner/Admin only; can't remove an owner.
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const org = await getActiveOrg(user.id)
  if (!org || !canManageTeam(org.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const { user_id } = await req.json().catch(() => ({}))
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  if ((await getRole(user_id, org.org_id)) === 'owner') {
    return NextResponse.json({ error: "You can't remove an owner" }, { status: 403 })
  }
  const { error } = await db.from('org_members').delete().eq('org_id', org.org_id).eq('user_id', user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
