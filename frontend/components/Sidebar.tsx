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

function IconPublished() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="7.5" r="6" />
      <polyline points="5,7.5 7,9.5 10,6" />
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

function IconVideo() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="9" height="9" rx="1.5" />
      <path d="M10 6l4-2v7l-4-2" />
    </svg>
  )
}

function IconPhotos() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2.5" width="13" height="10" rx="1.5" />
      <circle cx="5" cy="6" r="1.5" />
      <path d="M1 10.5l3.5-3 2.5 2.5 2-2 4 4" />
    </svg>
  )
}

// ── nav config ─────────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: '/', label: 'Dashboard', Icon: IconGrid },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/drafts',    label: 'Drafts',    Icon: IconDrafts    },
      { href: '/research',  label: 'Research',  Icon: IconResearch  },
      { href: '/write',     label: 'Write',     Icon: IconWrite     },
      { href: '/published', label: 'Published', Icon: IconPublished },
    ],
  },
  {
    label: 'Assets',
    items: [
      { href: '/brand',  label: 'Brand',  Icon: IconBrand  },
      { href: '/videos', label: 'Videos', Icon: IconVideo  },
      { href: '/photos', label: 'Photos', Icon: IconPhotos },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/audit', label: 'Audit', Icon: IconAudit },
    ],
  },
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
    <aside className="fixed left-0 top-0 h-screen bg-[#18181B] border-r border-[#27272A] flex flex-col z-20 w-56">

      {/* header */}
      <div className="px-4 py-4 border-b border-[#27272A]">
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-7 h-7 rounded-lg bg-[#3F3F46] text-[#D4D4D8] text-[11px] font-bold flex items-center justify-center shrink-0 leading-none select-none">
            {displayName[0]?.toUpperCase() ?? 'M'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white truncate leading-tight" title={displayName}>
              {displayName}
            </p>
            <p className="text-[11px] text-[#52525B] mt-0.5 leading-tight">Marketing Agent</p>
          </div>
        </div>
        <Link
          href="/generate"
          className="flex items-center justify-center gap-1.5 w-full py-[7px] text-[13px] font-semibold text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="5.5" y1="1" x2="5.5" y2="10" />
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
          Generate
        </Link>
      </div>

      {/* grouped nav */}
      <nav className="flex-1 px-3 pt-2 pb-2 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
            {group.label && (
              <p className="font-mono text-[9.5px] text-[#52525B] uppercase tracking-[0.1em] px-3 py-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const active = href === '/' ? path === '/' : path.startsWith(href)
                const showPending = label === 'Drafts' && pending > 0
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-between px-3 py-[7px] text-[13px] transition-colors rounded-lg ${
                      active
                        ? 'bg-[#3F3F46] text-white font-medium'
                        : 'text-[#71717A] hover:bg-[#27272A] hover:text-[#D4D4D8]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon />
                      {label}
                    </span>
                    {showPending && (
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-white">
                        {pending}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* guide link at bottom */}
      <div className="px-3 pb-4 pt-2 border-t border-[#27272A]">
        <Link
          href="/guide"
          className={`flex items-center gap-2.5 px-3 py-[7px] text-[13px] transition-colors rounded-lg ${
            path === '/guide'
              ? 'bg-[#3F3F46] text-white font-medium'
              : 'text-[#52525B] hover:bg-[#27272A] hover:text-[#D4D4D8]'
          }`}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="7.5" r="6" />
            <line x1="7.5" y1="5" x2="7.5" y2="5.5" strokeWidth="2" />
            <line x1="7.5" y1="7.5" x2="7.5" y2="10.5" />
          </svg>
          How it works
        </Link>
      </div>
    </aside>
  )
}
