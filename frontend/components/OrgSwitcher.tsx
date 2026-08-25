'use client'

import { useEffect, useRef, useState } from 'react'

type Org = { org_id: string; name: string; role: string; join_code: string | null }

// Company switcher — sits above the brand switcher in the sidebar. Only shows
// once the user belongs to a company (i.e. signed in via the new accounts
// system); legacy shared-password users don't have orgs, so it stays hidden.
export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/orgs')
      .then(r => (r.ok ? r.json() : { orgs: [] }))
      .then(d => { setOrgs(d.orgs ?? []); setActiveId(d.active_org_id ?? d.orgs?.[0]?.org_id ?? null) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (orgs.length === 0) return null

  const active = orgs.find(o => o.org_id === activeId) ?? orgs[0]

  const switchTo = async (id: string) => {
    setOpen(false)
    if (id === active.org_id) return
    await fetch('/api/orgs/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: id }),
    })
    window.location.href = '/' // reload into the new company (brand cookie was cleared server-side)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-[#262e38] transition-colors text-left rounded">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 bg-white/15 text-white text-[10px] font-bold flex items-center justify-center shrink-0 rounded">
            {active.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-[11px] font-semibold text-white/85 truncate">{active.name}</span>
        </div>
        <span className="text-white/40 text-[9px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-[#1a2129] border border-[#262e38] rounded z-50 py-1">
          <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-widest text-[#6f6f7d]">Your companies</p>
          {orgs.map(o => (
            <button
              key={o.org_id}
              onClick={() => switchTo(o.org_id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                o.org_id === active.org_id ? 'text-white font-semibold bg-[#262e38]' : 'text-[#bbbbbb] hover:bg-[#262e38]'
              }`}>
              <span className="w-5 h-5 bg-[#3c3c3c] text-white text-[9px] font-bold flex items-center justify-center shrink-0 rounded">
                {o.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{o.name}</span>
              <span className="ml-auto text-[9px] uppercase tracking-wide text-[#6f6f7d]">{o.role}</span>
              {o.org_id === active.org_id && <span className="text-[#8b7bff] text-xs">✓</span>}
            </button>
          ))}
          <div className="border-t border-[#262e38] mt-1 pt-1">
            <a href="/welcome?add=1" className="block px-3 py-2 text-[13px] text-[#9a9a9a] hover:text-white hover:bg-[#262e38] transition-colors">+ Create or join a company</a>
          </div>
        </div>
      )}
    </div>
  )
}
