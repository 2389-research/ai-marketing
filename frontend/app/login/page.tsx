'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogoMark } from '@/components/Logo'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push(params.get('from') || '/')
        router.refresh()
      } else {
        setError('Incorrect password')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong — try again')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bmw-surface-soft)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] rounded border border-[var(--bmw-hairline)] bg-[var(--bmw-canvas)] p-8"
      >
        <div className="mb-6 flex items-center gap-2">
          <LogoMark size={28} />
          <span className="text-[15px] font-extrabold tracking-[0.08em] text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>POSTIQUE</span>
        </div>

        <label htmlFor="password" className="mb-1.5 block text-[13px] font-bold text-[var(--bmw-ink)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-canvas)] px-3 py-2 text-[14px] text-[var(--bmw-body-strong)] outline-none focus:border-[var(--bmw-primary)]"
        />

        {error && <p className="mb-4 text-[13px] text-[#dc2626]">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded bg-[var(--bmw-primary)] py-2 text-[14px] font-bold text-white transition-colors hover:bg-[var(--bmw-primary-active)] disabled:bg-[var(--bmw-primary-disabled)]"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
