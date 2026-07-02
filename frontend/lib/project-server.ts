// Server-side active-project resolution for API routes.
// Separate file from project.ts because next/headers cannot be imported
// into client components.

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { PROJECT_COOKIE } from '@/lib/project'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Active project id for the current request: cookie first, then the oldest
 *  project row. Returns null pre-migration (no projects table). */
export async function getActiveProject(): Promise<string | null> {
  const store = await cookies()
  const fromCookie = store.get(PROJECT_COOKIE)?.value
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
