'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { CHANNELS } from '@/lib/channels'
import { AuthShell, inputCls, primaryBtnCls, labelCls } from '@/components/AuthShell'

// The 3-step onboarding wizard. Step 1 (company) already happened on /welcome,
// so this covers step 2 (first brand + channels) and step 3 (invite team).
// Everything is skippable — you can set it up later inside the app.
const DEFAULT_CHANNELS = ['linkedin', 'x', 'instagram', 'tiktok']

function Stepper({ active }: { active: 2 | 3 }) {
  const pip = (n: number, state: 'done' | 'active' | 'todo') => (
    <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${
      state === 'done' ? 'bg-[var(--bmw-primary)] text-white'
      : state === 'active' ? 'border-2 border-[var(--bmw-primary)] bg-[color-mix(in_srgb,var(--bmw-primary)_8%,transparent)] text-[var(--bmw-primary)]'
      : 'border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-surface-soft)] text-[#9a9a9a]'
    }`} style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>{state === 'done' ? '✓' : n}</span>
  )
  const line = (done: boolean) => <span className={`mx-1.5 h-0.5 flex-1 ${done ? 'bg-[var(--bmw-primary)]' : 'bg-[var(--bmw-hairline)]'}`} />
  return (
    <>
      <div className="mb-1.5 flex items-center">
        {pip(1, 'done')}{line(true)}{pip(2, active === 2 ? 'active' : 'done')}{line(active === 3)}{pip(3, active === 3 ? 'active' : 'todo')}
      </div>
      <div className="mb-6 flex justify-between text-[11px] font-medium text-[var(--bmw-body)]">
        <span>Company</span>
        <span className={active === 2 ? 'font-bold text-[var(--bmw-primary)]' : ''}>First brand</span>
        <span className={active === 3 ? 'font-bold text-[var(--bmw-primary)]' : ''}>Invite</span>
      </div>
    </>
  )
}

export default function SetupPage() {
  const supabase = createSupabaseBrowser()
  const router = useRouter()

  const [step, setStep] = useState<2 | 3>(2)
  const [ready, setReady] = useState(false)

  // step 2
  const [brand, setBrand] = useState('')
  const [channels, setChannels] = useState<string[]>(DEFAULT_CHANNELS)
  // step 3
  const [invites, setInvites] = useState<string[]>([''])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.replace('/signin'); return }
      setReady(true)
    })()
  }, [router, supabase])

  const toggle = (id: string) => setChannels(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  async function saveBrand(goNext: boolean) {
    if (!brand.trim()) { if (goNext) setError('Give your brand a name, or skip.'); return true }
    setBusy(true); setError('')
    const res = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: brand.trim(), channels }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Could not create the brand'); return false }
    return true
  }

  async function sendInvites() {
    const emails = invites.map(e => e.trim()).filter(Boolean)
    for (const email of emails) {
      await fetch('/api/orgs/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'member' }),
      }).catch(() => {})
    }
  }

  const finish = async () => {
    setBusy(true)
    await sendInvites()
    router.push('/'); router.refresh()
  }

  if (!ready) return <AuthShell><p className="text-center text-[13px] text-[var(--bmw-body)]">Loading…</p></AuthShell>

  return (
    <AuthShell maxWidth={440}>
      <Stepper active={step} />

      {step === 2 ? (
        <>
          <h1 className="text-[19px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Set up your first brand</h1>
          <p className="mb-4 mt-1 text-[13px] text-[var(--bmw-body)]">A brand has its own voice, channels, and calendar. Add more later.</p>

          <label className={labelCls}>Brand name</label>
          <input value={brand} onChange={e => setBrand(e.target.value)} className={inputCls} placeholder="e.g. Acme, or your product name" autoFocus />

          <label className={`${labelCls} mt-4`}>Where does it post?</label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(ch => {
              const on = channels.includes(ch.id)
              return (
                <button key={ch.id} type="button" onClick={() => toggle(ch.id)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                    on ? 'border-[var(--bmw-primary)] bg-[color-mix(in_srgb,var(--bmw-primary)_8%,transparent)] font-semibold text-[var(--bmw-primary)]'
                       : 'border-[var(--bmw-hairline-strong)] text-[var(--bmw-body)] hover:border-[var(--bmw-primary)]'
                  }`}>{ch.label}</button>
              )
            })}
          </div>

          {error && <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p>}

          <button
            onClick={async () => { if (await saveBrand(true)) setStep(3) }}
            disabled={busy}
            className={`${primaryBtnCls} mt-6`}>{busy ? 'Saving…' : 'Continue'}</button>
          <button onClick={() => setStep(3)} className="mt-3 block w-full text-center text-[12px] text-[#9a9a9a] hover:text-[var(--bmw-body)]">Skip — I&apos;ll set up a brand later</button>
        </>
      ) : (
        <>
          <h1 className="text-[19px] font-bold text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Invite your team</h1>
          <p className="mb-4 mt-1 text-[13px] text-[var(--bmw-body)]">Optional. They&apos;ll join as Members and can create and edit content.</p>

          <div className="flex flex-col gap-2">
            {invites.map((v, i) => (
              <input key={i} value={v} type="email"
                onChange={e => setInvites(list => list.map((x, idx) => idx === i ? e.target.value : x))}
                className={inputCls} placeholder="teammate@email.com" />
            ))}
          </div>
          <button onClick={() => setInvites(l => [...l, ''])} className="mt-2 text-[13px] font-semibold text-[var(--bmw-primary)]">+ Add another</button>

          <button onClick={finish} disabled={busy} className={`${primaryBtnCls} mt-6`}>{busy ? 'Finishing…' : 'Finish & go to Postique'}</button>
          <button onClick={() => { router.push('/'); router.refresh() }} className="mt-3 block w-full text-center text-[12px] text-[#9a9a9a] hover:text-[var(--bmw-body)]">Skip for now</button>
        </>
      )}
    </AuthShell>
  )
}
