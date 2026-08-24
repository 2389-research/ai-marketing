'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { AuthShell, inputCls, primaryBtnCls } from '@/components/AuthShell'

// The create-or-join fork, shown right after signup. If the user already
// belongs to a company, we skip straight into the app.
export default function WelcomePage() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.replace('/signin'); return }
      const nm = (data.user.user_metadata?.full_name || data.user.email || '').split('@')[0].split(' ')[0]
      setFirstName(nm ? nm[0].toUpperCase() + nm.slice(1) : '')
      // Already in a company? Go straight in.
      const res = await fetch('/api/orgs')
      const j = await res.json().catch(() => ({ orgs: [] }))
      if ((j.orgs ?? []).length > 0) { router.replace('/'); return }
      setReady(true)
    })()
  }, [router, supabase])

  async function create() {
    if (!companyName.trim() || busy) return
    setBusy('create'); setError('')
    const res = await fetch('/api/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: companyName.trim() }),
    })
    const j = await res.json()
    if (!res.ok) { setError(j.error ?? 'Could not create the company'); setBusy(null); return }
    router.push('/'); router.refresh()
  }

  async function join() {
    if (!joinCode.trim() || busy) return
    setBusy('join'); setError('')
    const res = await fetch('/api/orgs/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: joinCode.trim() }),
    })
    const j = await res.json()
    if (!res.ok) { setError(j.error ?? 'Could not join'); setBusy(null); return }
    router.push('/'); router.refresh()
  }

  if (!ready) {
    return <AuthShell><p className="text-center text-[13px] text-[var(--bmw-body)]">Loading…</p></AuthShell>
  }

  return (
    <AuthShell maxWidth={460}>
      <h1 className="text-center text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>
        Welcome{firstName ? `, ${firstName}` : ''} 👋
      </h1>
      <p className="mb-6 mt-1 text-center text-[13px] text-[var(--bmw-body)]">Where do you want to work?</p>

      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Create */}
        <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-[var(--bmw-primary)] bg-[color-mix(in_srgb,var(--bmw-primary)_6%,transparent)] p-5">
          <div className="mb-1 grid h-10 w-10 place-items-center rounded-[11px] bg-[var(--bmw-primary)] text-[20px] text-white">＋</div>
          <p className="text-[15px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Create a company</p>
          <p className="mb-1 flex-1 text-[12.5px] text-[var(--bmw-body)]">Start fresh. You&apos;ll be the owner and can invite your team.</p>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} placeholder="Company name" onKeyDown={e => e.key === 'Enter' && create()} />
          <button onClick={create} disabled={busy !== null || !companyName.trim()} className={primaryBtnCls}>{busy === 'create' ? 'Creating…' : 'Create'}</button>
        </div>

        {/* Join */}
        <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-[var(--bmw-hairline)] p-5">
          <div className="mb-1 grid h-10 w-10 place-items-center rounded-[11px] border border-[var(--bmw-hairline)] bg-[var(--bmw-surface-soft)] text-[18px] text-[var(--bmw-primary)]">↳</div>
          <p className="text-[15px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Join a company</p>
          <p className="mb-1 flex-1 text-[12.5px] text-[var(--bmw-body)]">Got an invite code or link from a teammate?</p>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} className={inputCls} placeholder="Enter code or paste link" onKeyDown={e => e.key === 'Enter' && join()} />
          <button onClick={join} disabled={busy !== null || !joinCode.trim()} className="w-full rounded-[10px] border border-[var(--bmw-hairline-strong)] px-4 py-2.5 text-[14px] font-semibold text-[var(--bmw-ink)] transition-colors hover:border-[var(--bmw-primary)] disabled:opacity-50">{busy === 'join' ? 'Joining…' : 'Join'}</button>
        </div>
      </div>

      {error && <p className="mt-4 text-center text-[13px] text-[#dc2626]">{error}</p>}
    </AuthShell>
  )
}
