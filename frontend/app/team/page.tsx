'use client'

import { useEffect, useState } from 'react'

type Role = 'owner' | 'admin' | 'member'
type Member = { user_id: string; role: Role; email: string; full_name: string | null }
type Invite = { id: string; email: string; role: Role; code: string; created_at: string }

const ROLE_PILL: Record<Role, string> = {
  owner: 'bg-[color-mix(in_srgb,var(--bmw-primary)_10%,transparent)] text-[var(--bmw-primary)]',
  admin: 'bg-[var(--bmw-surface-soft)] text-[var(--bmw-ink)] border border-[var(--bmw-hairline)]',
  member: 'bg-[var(--bmw-surface-soft)] text-[var(--bmw-body)]',
}
const AVATAR_COLORS = ['#1800ad', '#0f9d6b', '#b7791f', '#c026d3', '#0891b2', '#dc2626']
function initials(m: Member) {
  const base = (m.full_name || m.email || '?').trim()
  const parts = base.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
function hue(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length] }

export default function TeamPage() {
  const [loading, setLoading] = useState(true)
  const [needAuth, setNeedAuth] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [me, setMe] = useState('')
  const [org, setOrg] = useState<{ name: string; join_code: string | null }>({ name: '', join_code: null })

  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const canManage = myRole === 'owner' || myRole === 'admin'
  const joinBase = typeof window !== 'undefined' ? `${window.location.origin}/join/` : '/join/'

  const load = async () => {
    const res = await fetch('/api/orgs/members')
    if (res.status === 401) { setNeedAuth(true); setLoading(false); return }
    const m = await res.json()
    setMembers(m.members ?? []); setMyRole(m.role ?? null); setMe(m.me ?? ''); setOrg(m.org ?? { name: '', join_code: null })
    const iv = await fetch('/api/orgs/invite').then(r => r.json()).catch(() => ({ invites: [] }))
    setInvites(iv.invites ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const sendInvite = async () => {
    if (!email.trim() || busy) return
    setBusy(true); setError('')
    const res = await fetch('/api/orgs/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role: inviteRole }),
    })
    const j = await res.json()
    setBusy(false)
    if (!res.ok) { setError(j.error ?? 'Could not send invite'); return }
    setEmail('')
    load()
  }
  const changeRole = async (user_id: string, role: Role) => {
    await fetch('/api/orgs/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, role }) })
    load()
  }
  const removeMember = async (user_id: string) => {
    await fetch('/api/orgs/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id }) })
    load()
  }
  const revoke = async (id: string) => {
    await fetch('/api/orgs/invite', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) } catch {}
  }

  if (loading) return <div className="px-6 py-6 max-w-3xl mx-auto"><p className="text-sm text-[#9a9a9a]">Loading…</p></div>
  if (needAuth) return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--bmw-ink)] mb-2">Team</h1>
      <p className="text-sm text-[var(--bmw-body)]">Teams live in the new accounts system. <a href="/signin" className="font-semibold text-[var(--bmw-primary)]">Sign in</a> with your Postique account to manage your company&apos;s team.</p>
    </div>
  )

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-3xl w-full mx-auto">
      <div className="mb-6 pb-5 border-b border-[var(--bmw-hairline)]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[var(--bmw-ink)] tracking-tight">Team</h1>
        <p className="text-[13.5px] text-[var(--bmw-body)] mt-1.5">Who can work in {org.name || 'this company'} and what they can do.</p>
      </div>

      {/* invite */}
      {canManage && (
        <div className="mb-6 rounded-xl border border-[var(--bmw-hairline)] bg-[var(--bmw-canvas)] p-5">
          <p className="text-sm font-semibold text-[var(--bmw-ink)] mb-3">Invite a teammate</p>
          <div className="flex gap-2 flex-wrap">
            <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()}
              placeholder="teammate@email.com" type="email"
              className="flex-1 min-w-[200px] rounded-[10px] border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-surface-soft)] px-3 py-2.5 text-sm outline-none focus:border-[var(--bmw-primary)]" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}
              className="rounded-[10px] border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-surface-soft)] px-3 py-2.5 text-sm outline-none focus:border-[var(--bmw-primary)]">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={sendInvite} disabled={busy || !email.trim()}
              className="rounded-[10px] bg-[var(--bmw-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--bmw-primary-active)] disabled:opacity-40">
              {busy ? 'Inviting…' : 'Invite'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-[#dc2626]">{error}</p>}
          {org.join_code && (
            <p className="mt-3 text-xs text-[var(--bmw-body)]">
              Or share a join link:{' '}
              <button onClick={() => copy(joinBase + org.join_code, 'orglink')} className="font-semibold text-[var(--bmw-primary)]">
                {joinBase}{org.join_code}
              </button>{' '}
              {copied === 'orglink' ? <span className="text-[var(--bmw-primary)]">· copied</span> : '· click to copy'}
            </p>
          )}
        </div>
      )}

      {/* members */}
      <div className="rounded-xl border border-[var(--bmw-hairline)] bg-[var(--bmw-canvas)] p-5">
        <p className="text-xs uppercase tracking-widest text-[var(--bmw-body)] mb-1">Members · {members.length}</p>
        {members.map(m => (
          <div key={m.user_id} className="flex items-center gap-3 py-3 border-b border-[var(--bmw-hairline)] last:border-none">
            <span className="grid place-items-center rounded-full text-white text-[13px] font-bold shrink-0" style={{ width: 34, height: 34, background: hue(m.user_id), fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>{initials(m)}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--bmw-ink)] truncate">{m.full_name || m.email}{m.user_id === me && <span className="text-[var(--bmw-body)] font-normal"> · you</span>}</div>
              {m.full_name && <div className="text-xs text-[#9a9a9a] truncate">{m.email}</div>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canManage && m.role !== 'owner' && m.user_id !== me ? (
                <>
                  <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value as Role)}
                    className="rounded-full border border-[var(--bmw-hairline)] bg-[var(--bmw-surface-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--bmw-ink)] outline-none">
                    {myRole === 'owner' && <option value="owner">Owner</option>}
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  <button onClick={() => removeMember(m.user_id)} title="Remove" className="text-[#9a9a9a] hover:text-[#dc2626] text-sm">×</button>
                </>
              ) : (
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${ROLE_PILL[m.role]}`}>{m.role}</span>
              )}
            </div>
          </div>
        ))}

        {invites.length > 0 && (
          <>
            <p className="text-xs uppercase tracking-widest text-[var(--bmw-body)] mt-5 mb-1">Pending invites · {invites.length}</p>
            {invites.map(iv => (
              <div key={iv.id} className="flex items-center gap-3 py-3 border-b border-[var(--bmw-hairline)] last:border-none">
                <span className="grid place-items-center rounded-full text-[13px] font-bold shrink-0 text-[var(--bmw-body)] bg-[var(--bmw-surface-soft)] border border-[var(--bmw-hairline)]" style={{ width: 34, height: 34 }}>?</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--bmw-body)] truncate">{iv.email}</div>
                  <button onClick={() => copy(joinBase + iv.code, iv.id)} className="text-xs text-[var(--bmw-primary)] font-medium">
                    {copied === iv.id ? 'copied invite link' : 'copy invite link'}
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[color-mix(in_srgb,#b7791f_14%,transparent)] text-[#b7791f]">Pending · {iv.role}</span>
                  {canManage && <button onClick={() => revoke(iv.id)} title="Revoke" className="text-[#9a9a9a] hover:text-[#dc2626] text-sm">×</button>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
