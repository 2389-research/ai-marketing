export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Public — resolve a join code (org share code OR email invite) into the
// context an invited person sees before accepting: company, role, who invited.
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  // Org-wide shareable link → join as Member.
  const { data: org } = await db.from('organizations').select('id, name').eq('join_code', code).maybeSingle()
  if (org) return NextResponse.json({ valid: true, org_name: org.name, role: 'member', inviter: null })

  // Specific email invite. organizations embeds fine (real FK); the inviter's
  // profile does NOT (invited_by → auth.users, not profiles), so fetch it separately.
  const { data: inv } = await db
    .from('org_invitations')
    .select('role, status, invited_by, organizations(name)')
    .eq('code', code).maybeSingle()
  if (!inv || inv.status !== 'pending') {
    return NextResponse.json({ valid: false, error: 'This invite is invalid or already used.' }, { status: 404 })
  }
  let inviter: string | null = null
  if (inv.invited_by) {
    const { data: p } = await db.from('profiles').select('full_name, email').eq('id', inv.invited_by).maybeSingle()
    inviter = p?.full_name || p?.email || null
  }
  return NextResponse.json({
    valid: true,
    org_name: (inv as any).organizations?.name ?? 'a company',
    role: inv.role,
    inviter,
  })
}
