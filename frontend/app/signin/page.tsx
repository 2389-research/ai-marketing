'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { AuthShell, GoogleButton, inputCls, primaryBtnCls, labelCls } from '@/components/AuthShell'

function SignInForm() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('from') || '/welcome'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push(next); router.refresh()
  }

  async function google() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  return (
    <AuthShell>
      <h1 className="text-center text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Sign in to Postique</h1>
      <p className="mb-6 mt-1 text-center text-[13px] text-[var(--bmw-body)]">Your AI marketing employee is waiting.</p>

      <GoogleButton onClick={google} />
      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.1em] text-[var(--bmw-body)]">
        <span className="h-px flex-1 bg-[var(--bmw-hairline)]" />or<span className="h-px flex-1 bg-[var(--bmw-hairline)]" />
      </div>

      <form onSubmit={handleSubmit}>
        <label className={labelCls} htmlFor="email">Work email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
        <div className="h-3" />
        <label className={labelCls} htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="••••••••••" />
        {error && <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p>}
        <div className="h-4" />
        <button type="submit" disabled={loading} className={primaryBtnCls}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>

      <p className="mt-5 text-center text-[13px] text-[var(--bmw-body)]">
        New to Postique? <Link href="/signup" className="font-semibold text-[var(--bmw-primary)]">Create an account</Link>
      </p>
    </AuthShell>
  )
}

export default function SignInPage() {
  return <Suspense><SignInForm /></Suspense>
}
