'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { AuthShell, inputCls, primaryBtnCls, labelCls } from '@/components/AuthShell'

type View = 'choose' | 'create' | 'join'
const CODE_LEN = 8

// Pull an 8-char join code out of a raw code or a pasted "/join/<code>" link.
function extractCode(input: string): string {
  const m = input.trim().match(/([A-Za-z0-9]{4,})\s*$/)
  return (m ? m[1] : input).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CODE_LEN)
}

export default function WelcomePage() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [view, setView] = useState<View>('choose')

  const [companyName, setCompanyName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cellRefs = useRef<(HTMLInputElement | null)[]>([])

  // "?add=1" = the user came from the org switcher to add ANOTHER company, so
  // don't bounce them back into the app even though they already have one.
  const [addMode, setAddMode] = useState(false)

  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get('add') === '1'
    setAddMode(add)
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.replace('/signin'); return }
      const nm = (data.user.user_metadata?.full_name || data.user.email || '').split('@')[0].split(' ')[0]
      setFirstName(nm ? nm[0].toUpperCase() + nm.slice(1) : '')
      const res = await fetch('/api/orgs')
      const j = await res.json().catch(() => ({ orgs: [] }))
      if (!add && (j.orgs ?? []).length > 0) { router.replace('/'); return }
      setReady(true)
    })()
  }, [router, supabase])

  async function create() {
    if (!companyName.trim() || busy) return
    setBusy(true); setError('')
    const res = await fetch('/api/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: companyName.trim() }),
    })
    const j = await res.json()
    if (!res.ok) { setError(j.error ?? 'Could not create the company'); setBusy(false); return }
    router.push('/setup'); router.refresh()
  }

  async function join() {
    if (code.length < 4 || busy) return
    setBusy(true); setError('')
    const res = await fetch('/api/orgs/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const j = await res.json()
    if (!res.ok) { setError(j.error ?? 'Could not join'); setBusy(false); return }
    router.push('/'); router.refresh()
  }

  // segmented code entry
  const setCell = (i: number, val: string) => {
    const ch = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1)
    const arr = code.padEnd(CODE_LEN).split('')
    arr[i] = ch || ' '
    const next = arr.join('').replace(/\s+$/,'')
    setCode(next.trimEnd())
    if (ch && i < CODE_LEN - 1) cellRefs.current[i + 1]?.focus()
  }
  const onCellKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) cellRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') join()
  }
  const onCellPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const c = extractCode(e.clipboardData.getData('text'))
    setCode(c)
    cellRefs.current[Math.min(c.length, CODE_LEN - 1)]?.focus()
  }

  if (!ready) return <AuthShell><p className="text-center text-[13px] text-[var(--bmw-body)]">Loading…</p></AuthShell>

  // ── CHOOSE ────────────────────────────────────────────────────────────────
  if (view === 'choose') {
    return (
      <AuthShell maxWidth={560}>
        <h1 className="text-center text-[22px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>
          Welcome{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="mb-7 mt-1.5 text-center text-[14px] text-[var(--bmw-body)]">How do you want to start?</p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <button
            onClick={() => { setError(''); setView('create') }}
            className="group flex-1 rounded-2xl border-2 border-[var(--bmw-hairline)] p-6 text-left transition-all hover:border-[var(--bmw-primary)] hover:bg-[color-mix(in_srgb,var(--bmw-primary)_5%,transparent)] hover:shadow-[0_10px_30px_-14px_rgba(24,0,173,.35)]">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[var(--bmw-primary)] text-[24px] text-white">＋</div>
            <p className="text-[16px] font-bold text-[var(--bmw-ink)] mb-1.5" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Create a company</p>
            <p className="text-[13px] leading-relaxed text-[var(--bmw-body)]">Start fresh. You&apos;ll be the owner and can invite your team afterwards.</p>
            <span className="mt-3 inline-block text-[13px] font-semibold text-[var(--bmw-primary)] group-hover:translate-x-0.5 transition-transform">Set up a company →</span>
          </button>

          <button
            onClick={() => { setError(''); setView('join') }}
            className="group flex-1 rounded-2xl border-2 border-[var(--bmw-hairline)] p-6 text-left transition-all hover:border-[var(--bmw-primary)] hover:bg-[color-mix(in_srgb,var(--bmw-primary)_5%,transparent)] hover:shadow-[0_10px_30px_-14px_rgba(24,0,173,.35)]">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-[var(--bmw-hairline)] bg-[var(--bmw-surface-soft)] text-[22px] text-[var(--bmw-primary)]">↳</div>
            <p className="text-[16px] font-bold text-[var(--bmw-ink)] mb-1.5" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Join a company</p>
            <p className="text-[13px] leading-relaxed text-[var(--bmw-body)]">Got an invite code or link from a teammate? Enter it to join their workspace.</p>
            <span className="mt-3 inline-block text-[13px] font-semibold text-[var(--bmw-primary)] group-hover:translate-x-0.5 transition-transform">Enter a code →</span>
          </button>
        </div>
        {addMode && (
          <p className="mt-6 text-center">
            <a href="/" className="text-[13px] font-medium text-[var(--bmw-body)] hover:text-[var(--bmw-ink)]">← Back to app</a>
          </p>
        )}
      </AuthShell>
    )
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <AuthShell maxWidth={440}>
        <button onClick={() => setView('choose')} className="mb-4 text-[13px] font-medium text-[var(--bmw-body)] hover:text-[var(--bmw-ink)]">← Back</button>
        <h1 className="text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Create your company</h1>
        <p className="mb-5 mt-1 text-[13px] text-[var(--bmw-body)]">This is your team&apos;s home. You&apos;ll add a brand and invite people next.</p>
        <label className={labelCls}>Company name</label>
        <input autoFocus value={companyName} onChange={e => setCompanyName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} className={inputCls} placeholder="e.g. 2389 Research" />
        {error && <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p>}
        <button onClick={create} disabled={busy || !companyName.trim()} className={`${primaryBtnCls} mt-6`}>{busy ? 'Creating…' : 'Continue →'}</button>
      </AuthShell>
    )
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────
  return (
    <AuthShell maxWidth={440}>
      <button onClick={() => setView('choose')} className="mb-4 text-[13px] font-medium text-[var(--bmw-body)] hover:text-[var(--bmw-ink)]">← Back</button>
      <h1 className="text-[20px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Join a company</h1>
      <p className="mb-5 mt-1 text-[13px] text-[var(--bmw-body)]">Enter the invite code from your teammate. You can also paste the whole invite link.</p>

      <label className={labelCls}>Invite code</label>
      <div className="flex gap-2" onPaste={onCellPaste}>
        {Array.from({ length: CODE_LEN }).map((_, i) => (
          <input
            key={i}
            ref={el => { cellRefs.current[i] = el }}
            value={code[i] ?? ''}
            onChange={e => setCell(i, e.target.value)}
            onKeyDown={e => onCellKey(i, e)}
            maxLength={1}
            inputMode="text"
            autoFocus={i === 0}
            className="h-12 w-full rounded-[10px] border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-surface-soft)] text-center text-[18px] font-semibold uppercase text-[var(--bmw-ink)] outline-none focus:border-[var(--bmw-primary)]"
          />
        ))}
      </div>
      {error && <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p>}
      <button onClick={join} disabled={busy || code.length < 4} className={`${primaryBtnCls} mt-6`}>{busy ? 'Joining…' : 'Join company'}</button>
    </AuthShell>
  )
}
