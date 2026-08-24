export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-auth'

// OAuth / email-confirmation return. Exchanges the code for a session cookie,
// then sends the user on (defaults to the create-or-join welcome screen).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/welcome'

  if (code) {
    const supabase = await createSupabaseServer()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(new URL(next, url.origin))
}
