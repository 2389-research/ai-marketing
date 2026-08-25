'use client'

import { useEffect, useState } from 'react'

type Org = { org_id: string; name: string; role: string }
const TILE = ['#1800ad', '#0f9d6b', '#b7791f', '#c026d3', '#0891b2', '#dc2626']
function color(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TILE[h % TILE.length] }

// The company switcher as a horizontal row of icon tiles at the top of the app.
// Clicking a company switches into it (its brands + calendar + dashboard).
// Hidden for legacy password-gate users (no orgs).
export default function CompanyBar() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/orgs')
      .then(r => (r.ok ? r.json() : { orgs: [] }))
      .then(d => { setOrgs(d.orgs ?? []); setActiveId(d.active_org_id ?? d.orgs?.[0]?.org_id ?? null) })
      .catch(() => {})
  }, [])

  if (orgs.length === 0) return null

  const active = orgs.find(o => o.org_id === activeId) ?? orgs[0]

  const switchTo = async (id: string) => {
    if (id === active.org_id) return
    await fetch('/api/orgs/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: id }) })
    window.location.href = '/'
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        {orgs.map(o => {
          const on = o.org_id === active.org_id
          return (
            <button
              key={o.org_id}
              onClick={() => switchTo(o.org_id)}
              title={`${o.name} · ${o.role}`}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white transition-all ${on ? 'ring-2 ring-offset-2 ring-[var(--bmw-primary)] ring-offset-[var(--bmw-canvas)]' : 'opacity-70 hover:opacity-100'}`}
              style={{ backgroundColor: color(o.org_id), fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
            >
              {o.name.slice(0, 2).toUpperCase()}
            </button>
          )
        })}
        <a
          href="/welcome?add=1"
          title="Create or join a company"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-dashed border-[var(--bmw-hairline-strong)] text-[16px] text-[var(--bmw-body)] hover:border-[var(--bmw-primary)] hover:text-[var(--bmw-primary)] transition-colors"
        >+</a>
      </div>
      <span className="hidden md:block ml-1 truncate text-[13px] font-semibold text-[var(--bmw-ink)]">{active.name}</span>
    </div>
  )
}
