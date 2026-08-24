// Supabase Auth session clients (SSR). These are SEPARATE from lib/supabase.ts
// (the plain anon client the rest of the app uses for data). Auth session state
// lives in cookies, handled here. Introduced alongside the legacy password gate
// during the multi-tenant migration — nothing here replaces existing data access.

import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Server client for route handlers / server components — bound to the request cookies. */
export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // called from a Server Component where cookies are read-only — the
          // middleware refresh path handles session cookie writes instead.
        }
      },
    },
  })
}
