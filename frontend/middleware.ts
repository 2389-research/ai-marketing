import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const LEGACY_COOKIE = 'postique_auth'

// Public routes — reachable without any auth. Includes the legacy password
// gate AND the new Supabase auth flow, so both entry paths work during the
// multi-tenant migration.
const PUBLIC_PATHS = [
  '/login', '/api/auth/login',   // legacy shared-password gate (still active)
  '/signin', '/signup', '/join', // new Supabase auth flow
  '/auth/callback',              // OAuth / email-link return
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Accept EITHER auth: legacy shared-password cookie …
  const legacy = req.cookies.get(LEGACY_COOKIE)?.value
  if (legacy && legacy === process.env.AUTH_TOKEN) {
    return NextResponse.next()
  }

  // … or a real Supabase session. Refresh it on the response so the session
  // cookie stays fresh (the standard @supabase/ssr middleware pattern).
  const res = NextResponse.next({ request: req })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(toSet) {
          for (const { name, value, options } of toSet) res.cookies.set(name, value, options)
        },
      },
    },
  )
  const { data } = await supabase.auth.getUser()
  if (data.user) {
    // Signed in but hasn't picked a company yet → send to the welcome fork
    // (except when already there or hitting an API route).
    return res
  }

  // During migration the default door stays the legacy gate so the team is
  // never locked out. The new Supabase flow is reached directly at /signup and
  // /signin (both public). Cutover flips this to /signin later.
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
