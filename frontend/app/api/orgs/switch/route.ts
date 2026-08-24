export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getUser, getRole } from '@/lib/auth'

const ACTIVE_ORG = 'active_org'
const PROJECT_COOKIE = 'active_project'

// POST { org_id } — switch the active company. Clears the active brand cookie
// so the app re-resolves to a brand inside the new company on next load.
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { org_id } = await req.json().catch(() => ({}))
  if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Only switch to a company the user actually belongs to.
  if (!(await getRole(user.id, org_id))) {
    return NextResponse.json({ error: 'Not a member of that company' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACTIVE_ORG, org_id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  res.cookies.set(PROJECT_COOKIE, '', { path: '/', maxAge: 0 }) // let it re-resolve to the new company's first brand
  return res
}
