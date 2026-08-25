'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useGoogleEnabled } from '@/lib/use-google-enabled'
import { AuthShell, GoogleButton, inputCls, primaryBtnCls, labelCls } from '@/components/AuthShell'

function SignUpForm() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()
  const next = useSearchParams().get('next') || '/welcome'
  const googleOn = useGoogleEnabled()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) { setError(error.message); setLoading(false); return }
    // If email confirmation is off, a session comes back immediately.
    if (data.session) { router.push(next); router.refresh(); return }
    setCheckEmail(true); setLoading(false)
  }

  async function google() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  if (checkEmail) {
    return (
      <AuthShell>
        <h1 className="text-center text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Check your email</h1>
        <p className="mt-2 text-center text-[13px] text-[var(--bmw-body)]">We sent a confirmation link to <b className="text-[var(--bmw-ink)]">{email}</b>. Click it to finish creating your account.</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-center text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Create your account</h1>
      <p className="mb-6 mt-1 text-center text-[13px] text-[var(--bmw-body)]">Set up your marketing employee in a couple of minutes.</p>

      {googleOn && (
        <>
          <GoogleButton onClick={google} />
          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.1em] text-[var(--bmw-body)]">
            <span className="h-px flex-1 bg-[var(--bmw-hairline)]" />or<span className="h-px flex-1 bg-[var(--bmw-hairline)]" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit}>
        <label className={labelCls} htmlFor="name">Full name</label>
        <input id="name" type="text" autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} placeholder="Jane Doe" />
        <div className="h-3" />
        <label className={labelCls} htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
        <div className="h-3" />
        <label className={labelCls} htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
        {error && <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p>}
        <div className="h-4" />
        <button type="submit" disabled={loading} className={primaryBtnCls}>{loading ? 'Creating…' : 'Create account'}</button>
      </form>

      <p className="mt-5 text-center text-[13px] text-[var(--bmw-body)]">
        Already have an account? <Link href="/signin" className="font-semibold text-[var(--bmw-primary)]">Sign in</Link>
      </p>
    </AuthShell>
  )
}

export default function SignUpPage() {
  return <Suspense><SignUpForm /></Suspense>
}
