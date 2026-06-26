'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── nav icons ──────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  )
}

function IconDrafts() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1" width="10" height="13" rx="1.5" />
      <line x1="5" y1="5" x2="10" y2="5" />
      <line x1="5" y1="8" x2="10" y2="8" />
      <line x1="5" y1="11" x2="8.5" y2="11" />
    </svg>
  )
}

function IconResearch() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4.5" />
      <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
    </svg>
  )
}

function IconWrite() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l3 3L5 13H2v-3L9.5 2.5z" />
    </svg>
  )
}

function IconBrand() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="5" r="3" />
      <path d="M2 13.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  )
}

function IconAudit() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="13" y2="4" />
      <line x1="2" y1="7.5" x2="13" y2="7.5" />
      <line x1="2" y1="11" x2="8.5" y2="11" />
    </svg>
  )
}

// ── nav config ─────────────────────────────────────────────────────────────────

const NAV = [
  { href: '/',         label: 'Dashboard', Icon: IconGrid     },
  { href: '/drafts',   label: 'Drafts',    Icon: IconDrafts   },
  { href: '/research', label: 'Research',  Icon: IconResearch },
  { href: '/write',    label: 'Write',     Icon: IconWrite    },
  { href: '/brand',    label: 'Brand',     Icon: IconBrand    },
  { href: '/audit',    label: 'Audit',     Icon: IconAudit    },
]

// ── sidebar ────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const path = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    supabase
      .from('brand_profile')
      .select('company_name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.company_name) setCompanyName(data.company_name)
      })

    supabase
      .from('generated_drafts')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'needs_edit'])
      .then(({ count }) => setPending(count ?? 0))
  }, [])

  const displayName = companyName ?? 'My Company'

  return (
    <aside className="fixed left-0 top-0 h-screen bg-white border-r border-[#E5E7EB] flex flex-col z-20 w-52">

      {/* brand header */}
      <div className="px-4 py-4 flex flex-col gap-3" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)' }}>
        <div className="overflow-hidden">
          <p className="text-[14px] font-semibold text-white truncate leading-tight" title={displayName}>
            {displayName}
          </p>
          <p className="text-[11px] text-white/55 mt-0.5">Marketing Agent</p>
        </div>
        <Link
          href="/generate"
          className="flex items-center justify-center gap-1.5 w-full py-1.5 text-white text-sm font-semibold rounded-lg transition-colors border border-white/25 hover:bg-white/15"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          Generate
        </Link>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 pt-3 pb-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          const showPending = label === 'Drafts' && pending > 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2 text-sm transition-colors rounded-lg ${
                active
                  ? 'bg-[#EDE9FE] text-[#7C3AED] font-semibold'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon />
                {label}
              </span>
              {showPending && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  active
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#EDE9FE] text-[#7C3AED]'
                }`}>
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
