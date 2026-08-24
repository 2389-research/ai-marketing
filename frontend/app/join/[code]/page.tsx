'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { AuthShell, GoogleButton, primaryBtnCls } from '@/components/AuthShell'

const ROLE_TEXT: Record<string, string> = {
  owner: 'an Owner — full control of the company',
  admin: 'an Admin — you can manage the team and all content',
  member: 'a Member — you can create and edit content',
}

export default function JoinPage() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()
  const code = String(useParams().code ?? '')

  const [ctx, setCtx] = useState<{ valid: boolean; org_name?: string; role?: string; inviter?: string | null; error?: string } | null>(null)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      setSignedIn(!!data.user)
      const res = await fetch(`/api/orgs/invite/lookup?code=${encodeURIComponent(code)}`)
      setCtx(await res.json())
    })()
  }, [code, supabase])

  async function accept() {
    setBusy(true); setError('')
    const res = await fetch('/api/orgs/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const j = await res.json()
    if (!res.ok) { setError(j.error ?? 'Could not join'); setBusy(false); return }
    router.push('/'); router.refresh()
  }

  async function google() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/join/${code}`)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  if (!ctx) return <AuthShell><p className="text-center text-[13px] text-[var(--bmw-body)]">Loading invite…</p></AuthShell>

  if (!ctx.valid) return (
    <AuthShell>
      <h1 className="text-center text-[19px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Invite not found</h1>
      <p className="mt-2 text-center text-[13px] text-[var(--bmw-body)]">{ctx.error ?? 'This link is invalid or expired.'}</p>
      <div className="h-4" />
      <a href="/signin" className="block text-center text-[13px] font-semibold text-[var(--bmw-primary)]">Go to sign in</a>
    </AuthShell>
  )

  const mark = (ctx.org_name ?? 'C').slice(0, 2).toUpperCase()

  return (
    <AuthShell>
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[15px] bg-[var(--bmw-primary)] text-[22px] font-extrabold text-white" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>{mark}</div>
        {ctx.inviter && (
          <span className="mb-1 inline-block rounded-full border border-[var(--bmw-hairline)] bg-[var(--bmw-surface-soft)] px-3 py-1 text-[12.5px] text-[var(--bmw-body)]">{ctx.inviter} invited you</span>
        )}
        <h1 className="mt-2 text-[19px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Join {ctx.org_name} on Postique</h1>
        <p className="mb-6 mt-1 text-[13px] text-[var(--bmw-body)]">You&apos;re joining as {ROLE_TEXT[ctx.role ?? 'member']}.</p>
      </div>

      {signedIn ? (
        <>
          <button onClick={accept} disabled={busy} className={primaryBtnCls}>{busy ? 'Joining…' : `Accept & join ${ctx.org_name}`}</button>
          <p className="mt-4 text-center text-[12px] text-[var(--bmw-body)]">Wrong account? <a href="/signin" className="font-semibold text-[var(--bmw-primary)]">Sign in as someone else</a></p>
        </>
      ) : (
        <>
          <GoogleButton onClick={google} label="Accept & continue with Google" />
          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.1em] text-[var(--bmw-body)]">
            <span className="h-px flex-1 bg-[var(--bmw-hairline)]" />or<span className="h-px flex-1 bg-[var(--bmw-hairline)]" />
          </div>
          <a href={`/signup?next=${encodeURIComponent(`/join/${code}`)}`} className={`block text-center ${primaryBtnCls}`}>Create an account to join</a>
          <p className="mt-4 text-center text-[13px] text-[var(--bmw-body)]">Already have an account? <a href={`/signin?from=${encodeURIComponent(`/join/${code}`)}`} className="font-semibold text-[var(--bmw-primary)]">Sign in</a></p>
        </>
      )}
      {error && <p className="mt-4 text-center text-[13px] text-[#dc2626]">{error}</p>}
    </AuthShell>
  )
}
