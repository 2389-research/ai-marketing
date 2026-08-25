'use client'

import { useEffect, useState } from 'react'

// Whether Google OAuth is actually configured on this Supabase project. We hide
// the "Continue with Google" button until it is, so it never shows as a broken
// control — and it appears automatically once the provider is enabled in the
// Supabase dashboard. Checked via the public auth settings endpoint.
export function useGoogleEnabled(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setOn(!!d?.external?.google))
      .catch(() => {})
  }, [])
  return on
}
