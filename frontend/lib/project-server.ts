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

/** Active project (brand) for the current request.
 *  - Signed-in user: constrained to their ACTIVE COMPANY's brands. The cookie
 *    is honored only if it points at a brand in that company; otherwise the
 *    company's first brand. This is what makes switching companies actually
 *    change what content is shown, and stops a stale/forged cookie leaking
 *    another company's brand.
 *  - Legacy (shared-password) users, or pre-migration: cookie, then oldest. */
export async function getActiveProject(): Promise<string | null> {
  const store = await cookies()
  const fromCookie = store.get(PROJECT_COOKIE)?.value

  try {
    const user = await getUser()
    if (user) {
      const org = await getActiveOrg(user.id)
      if (org) {
        const ids = await getOrgProjectIds(org.org_id)
        if (ids.length === 0) return null
        return fromCookie && ids.includes(fromCookie) ? fromCookie : ids[0]
      }
    }
  } catch {
    // fall through to legacy resolution
  }

  if (fromCookie) return fromCookie
  try {
    const { data } = await db.from('projects').select('id').order('created_at').limit(1)
    return data?.[0]?.id ?? null
  } catch {
    return null
  }
}

/** Add project_id to an insert payload (no-op when no project exists). */
export function stampRow<T extends Record<string, unknown>>(row: T, pid: string | null): T {
  return pid ? { ...row, project_id: pid } : row
}
