// Browser-only Supabase Auth client. Kept separate from supabase-auth.ts so
// nothing here pulls in next/headers (server-only) — importing that into a
// client component breaks the build.
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
