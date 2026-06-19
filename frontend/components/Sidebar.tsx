'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/',          icon: '◈',  label: 'Dashboard'  },
  { href: '/brand',     icon: '◎',  label: 'Brand'      },
  { href: '/generate',  icon: '⚡', label: 'Generate'   },
  { href: '/drafts',    icon: '▤',  label: 'Drafts'     },
  { href: '/write',     icon: '✏',  label: 'Write'      },
  { href: '/research',  icon: '○',  label: 'Research'   },
]

export default function Sidebar() {
  const path = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('brand_profile')
      .select('company_name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.company_name) setCompanyName(data.company_name)
      })
  }, [])

  const displayName = companyName ?? 'My Company'

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-white border-r border-gray-200 flex flex-col z-20">
      <div className="px-5 py-5 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900 tracking-tight truncate" title={displayName}>
          {displayName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Marketing</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="w-4 text-center shrink-0">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 truncate">{displayName} © 2026</p>
      </div>
    </aside>
  )
}
