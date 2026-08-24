export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ACTIVE_ORG = 'active_org'

// Pull a join code out of either a raw code or a pasted "/join/<code>" link.
function normalizeCode(input: string): string {
  const m = input.trim().match(/([A-Za-z0-9]{6,})\s*$/)
  return (m ? m[1] : input.trim()).toUpperCase()
}

// POST { code } — join a company by its shareable code/link, as a Member.
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { code } = await req.json().catch(() => ({}))
  if (!code?.trim()) return NextResponse.json({ error: 'Enter a code or invite link' }, { status: 400 })
  const clean = normalizeCode(code)

  // A code can be either an org's shareable join_code or a specific email invite.
  const { data: org } = await db.from('organizations').select('id, name').eq('join_code', clean).maybeSingle()
  let orgId = org?.id ?? null
  let inviteId: string | null = null
  let inviteRole = 'member'

  if (!orgId) {
    const { data: invite } = await db
      .from('org_invitations')
      .select('id, org_id, role, status')
      .eq('code', clean)
      .maybeSingle()
    if (invite && invite.status === 'pending') {
      orgId = invite.org_id
      inviteId = invite.id
      inviteRole = invite.role
    }
  }

  if (!orgId) return NextResponse.json({ error: "That code didn't match any company. Check it and try again." }, { status: 404 })

  // Idempotent: already a member → just switch to it.
  const { data: existing } = await db
    .from('org_members').select('id').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!existing) {
    const { error } = await db.from('org_members').insert({ org_id: orgId, user_id: user.id, role: inviteRole })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (inviteId) {
    await db.from('org_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', inviteId)
  }

  const res = NextResponse.json({ org_id: orgId })
  res.cookies.set(ACTIVE_ORG, orgId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
