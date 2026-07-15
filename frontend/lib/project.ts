// Active-project resolution for multi-project support.
//
// The active project id lives in a plain cookie so BOTH client-side supabase
// queries and server API routes can read it. No cookie (or a stale one) falls
// back to the oldest project — matching the Python side's behavior.

import { supabase } from '@/lib/supabase'

export const PROJECT_COOKIE = 'active_project'

export interface Project {
  id: string
  name: string
  created_at?: string
  linked_project_id?: string | null
}

// ── client side ────────────────────────────────────────────────────────────────

export function getActiveProjectClient(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${PROJECT_COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

export function setActiveProject(id: string) {
  document.cookie = `${PROJECT_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
  window.location.reload()
}

/** Resolve the active project id on the client, falling back to the oldest
 *  project row. Returns null pre-migration (no projects table). */
export async function resolveActiveProjectClient(): Promise<string | null> {
  const fromCookie = getActiveProjectClient()
  if (fromCookie) return fromCookie
  try {
    const { data } = await supabase.from('projects').select('id').order('created_at').limit(1)
    return data?.[0]?.id ?? null
  } catch {
    return null
  }
}

/** Apply the project filter to a supabase query builder (no-op when pid is null).
 *  Deliberately untyped internally: constraining T to the builder's `eq` shape
 *  makes TypeScript recurse into supabase's query types and blow up with
 *  TS2589 ("type instantiation is excessively deep"). */
export function scoped<T>(q: T, pid: string | null): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pid ? (q as any).eq('project_id', pid) : q
}

/** All project ids that share real social channels with this one (itself
 *  included) — itself, any project whose linked_project_id points at it, and
 *  the project it points at (if any). Returns [] when pid is null, [pid] when
 *  nothing is linked — every existing single-project call site is unaffected.
 *  Fails open to [pid] on any query error.
 *  db is deliberately untyped (any) to match `scoped`'s pragmatic style and
 *  so this works with both the client-side `supabase` export and a
 *  server-route-local createClient() instance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getChannelGroupIds(db: any, pid: string | null): Promise<string[]> {
  if (!pid) return []
  try {
    const { data } = await db
      .from('projects')
      .select('id, linked_project_id')
      .or(`id.eq.${pid},linked_project_id.eq.${pid}`)
    const ids = new Set<string>([pid])
    for (const row of data ?? []) {
      ids.add(row.id)
      if (row.linked_project_id) ids.add(row.linked_project_id)
    }
    return Array.from(ids)
  } catch {
    return [pid]
  }
}
