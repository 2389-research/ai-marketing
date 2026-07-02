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
