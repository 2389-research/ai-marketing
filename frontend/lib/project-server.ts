// Server-side active-project resolution for API routes.
// Separate file from project.ts because next/headers cannot be imported
// into client components.

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { PROJECT_COOKIE } from '@/lib/project'
import { getUser, getActiveOrg } from '@/lib/auth'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Project ids belonging to a company (its brands), oldest first. */
export async function getOrgProjectIds(orgId: string): Promise<string[]> {
  const { data } = await db.from('projects').select('id').eq('org_id', orgId).order('created_at')
  return (data ?? []).map((r: { id: string }) => r.id)
}

const LEGACY_COOKIE = 'postique_auth'

/** Active project (brand) for the current request. FAILS CLOSED (issue #7):
 *  - Authenticated (Supabase) session: the cookie is honored ONLY if it names a
 *    brand in the user's active company. No company, no brands, or ANY error →
 *    null (never a raw, caller-supplied cookie). This is the security boundary
 *    every route built on it inherits; "I can't tell which project you may
 *    access" must never become "then I'll trust whatever id you sent".
 *  - Legacy shared-password session ONLY (the trusted-team gate): cookie, then
 *    oldest project. Reachable only when the legacy auth cookie is actually
 *    present — an anonymous request with a forged project cookie gets null. */
export async function getActiveProject(): Promise<string | null> {
  const store = await cookies()
  const fromCookie = store.get(PROJECT_COOKIE)?.value
  const hasLegacy = !!process.env.AUTH_TOKEN && store.get(LEGACY_COOKIE)?.value === process.env.AUTH_TOKEN

  let user = null
  try {
    user = await getUser()
  } catch (e) {
    console.error('[getActiveProject] getUser failed', e)
  }

  // Authenticated session → fail closed.
  if (user) {
    try {
      const org = await getActiveOrg(user.id)
      if (!org) return null // authenticated but no company → no project
      const ids = await getOrgProjectIds(org.org_id)
      if (ids.length === 0) return null
      return fromCookie && ids.includes(fromCookie) ? fromCookie : ids[0]
    } catch (e) {
      console.error('[getActiveProject] org resolution failed', e)
      return null
    }
  }

  // Legacy trusted-team session only.
  if (hasLegacy) {
    if (fromCookie) return fromCookie
    try {
      const { data } = await db.from('projects').select('id').order('created_at').limit(1)
      return data?.[0]?.id ?? null
    } catch {
      return null
    }
  }

  // Neither a real session nor the legacy cookie → no project context.
  return null
}

/** Add project_id to an insert payload (no-op when no project exists). */
export function stampRow<T extends Record<string, unknown>>(row: T, pid: string | null): T {
  return pid ? { ...row, project_id: pid } : row
}
