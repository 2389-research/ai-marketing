'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import ProjectSwitcher from '@/components/ProjectSwitcher'
import Logo from '@/components/Logo'

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

function IconRules() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1L13 3.5v4c0 3.5-2.3 5.8-5.5 6.5-3.2-.7-5.5-3-5.5-6.5v-4L7.5 1z" />
      <path d="M5.2 7.5l1.6 1.6 3-3.2" />
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

function IconCompetitors() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="5.5" r="2.5" />
      <circle cx="11" cy="7.5" r="2" />
      <path d="M1.5 13c0-2.2 1.6-3.8 3.5-3.8s3.5 1.6 3.5 3.8" />
      <path d="M9 13c0-1.7 0.9-3 2-3s2 1.3 2 3" />
    </svg>
  )
}

function IconAssistant() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5h11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H6.5L3 13.5V11H2a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
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
      { href: '/qa-rules',  label: 'QA Rules',  Icon: IconRules     },
      { href: '/research',  label: 'Research',  Icon: IconResearch  },
      { href: '/write',     label: 'Write',     Icon: IconWrite     },
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
      { href: '/assistant',   label: 'Assistant',   Icon: IconAssistant   },
      { href: '/audit',       label: 'Audit',       Icon: IconAudit       },
      { href: '/competitors', label: 'Competitors', Icon: IconCompetitors },
    ],
  },
]

// ── sidebar ────────────────────────────────────────────────────────────────────

export default function Sidebar({ open = false, onClose, collapsed = false, onToggleCollapse }: {
  open?: boolean; onClose?: () => void; collapsed?: boolean; onToggleCollapse?: () => void
}) {
  const path = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    resolveActiveProjectClient().then(pid => {
      const profileQuery = supabase.from('brand_profile').select('company_name')
      scoped(profileQuery, pid)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.company_name) setCompanyName(data.company_name)
        })

      const pendingQuery = supabase.from('generated_drafts').select('id', { count: 'exact', head: true })
      scoped(pendingQuery, pid)
        .in('status', ['pending', 'needs_edit'])
        .then(({ count }) => setPending(count ?? 0))
    })
  }, [])

  const displayName = companyName ?? 'My Company'

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#1a2129] border-r border-[#262e38] flex flex-col z-40 w-56 ${collapsed ? 'md:w-[68px]' : 'md:w-56'} transition-all duration-200 md:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >

      {/* header — Postique's own mark, then the project switcher (which brand you're managing) */}
      <div className={`py-4 border-b border-[#262e38] ${collapsed ? 'px-4 md:px-3' : 'px-4'}`}>
        <div className="mb-4 flex items-center justify-between">
          <Logo hideWord={collapsed} />
          {/* close button — only on mobile, where the sidebar is a drawer */}
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden text-[#d5d5d5]/60 hover:text-[#d5d5d5] text-2xl leading-none -mr-1"
          >
            ×
          </button>
        </div>
        <div className={`mb-3.5 ${collapsed ? 'md:hidden' : ''}`}>
          <ProjectSwitcher fallbackName={displayName} />
        </div>
        <Link
          href="/generate"
          title="Generate"
          className="flex items-center justify-center gap-1.5 w-full py-[7px] text-[13px] font-bold tracking-[0.01em] text-[#d5d5d5] bg-[#1800ad] hover:bg-[#2f1ac9] transition-colors rounded"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="5.5" y1="1" x2="5.5" y2="10" />
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
          <span className={collapsed ? 'md:hidden' : ''}>Generate</span>
        </Link>
      </div>

      {/* grouped nav */}
      <nav className="flex-1 px-3 pt-2 pb-2 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
            {group.label && (
              <p className={`font-bold text-[10px] text-[#bbbbbb] uppercase tracking-[0.12em] px-3 py-1.5 ${collapsed ? 'md:hidden' : ''}`}>
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
                    title={label}
                    className={`flex items-center justify-between pl-2.5 pr-3 py-[7px] text-[13px] transition-colors border-l-2 ${collapsed ? 'md:justify-center md:pl-0 md:pr-0' : ''} ${
                      active
                        ? 'border-[#1800ad] text-[#d5d5d5] font-bold'
                        : 'border-transparent text-[#bbbbbb] hover:bg-[#262e38] hover:text-[#d5d5d5]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon />
                      <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
                    </span>
                    {showPending && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 bg-[#1800ad] text-[#d5d5d5] rounded ${collapsed ? 'md:hidden' : ''}`}>
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

      {/* collapse toggle + guide link at bottom */}
      <div className="px-3 pb-4 pt-2 border-t border-[#262e38]">
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className={`hidden md:flex items-center gap-2.5 w-full pl-2.5 pr-3 py-[7px] mb-1 text-[13px] text-[#9a9a9a] hover:bg-[#262e38] hover:text-[#d5d5d5] transition-colors border-l-2 border-transparent rounded-sm ${collapsed ? 'md:justify-center md:pl-0 md:pr-0' : ''}`}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={collapsed ? 'rotate-180' : ''}>
            <path d="M9.5 3.5l-4 4 4 4" />
            <line x1="3" y1="2.5" x2="3" y2="12.5" />
          </svg>
          <span className={collapsed ? 'md:hidden' : ''}>Collapse</span>
        </button>
        <Link
          href="/guide"
          title="How it works"
          className={`flex items-center gap-2.5 pl-2.5 pr-3 py-[7px] text-[13px] transition-colors border-l-2 ${collapsed ? 'md:justify-center md:pl-0 md:pr-0' : ''} ${
            path === '/guide'
              ? 'border-[#1800ad] text-[#d5d5d5] font-bold'
              : 'border-transparent text-[#9a9a9a] hover:bg-[#262e38] hover:text-[#d5d5d5]'
          }`}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="7.5" r="6" />
            <line x1="7.5" y1="5" x2="7.5" y2="5.5" strokeWidth="2" />
            <line x1="7.5" y1="7.5" x2="7.5" y2="10.5" />
          </svg>
          <span className={collapsed ? 'md:hidden' : ''}>How it works</span>
        </Link>
      </div>
    </aside>
  )
}
