'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type Draft } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(iso: string) {
  return iso.slice(0, 10)
}

function fmtDayLabel(key: string) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

// ── channel options + colors ──────────────────────────────────────────────────

const CH_OPTS = [
  { id: 'linkedin',  label: 'LinkedIn'  },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email',     label: 'Email'     },
  { id: 'tiktok',    label: 'TikTok'    },
  { id: 'youtube',   label: 'YouTube'   },
  { id: 'x',         label: 'X'         },
]

// Accent colors per channel — used for dots and labels
const CH_COLOR: Record<string, { dot: string; bg: string; text: string }> = {
  linkedin:  { dot: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  instagram: { dot: '#EC4899', bg: '#FDF2F8', text: '#BE185D' },
  email:     { dot: '#F59E0B', bg: '#FFFBEB', text: '#B45309' },
  tiktok:    { dot: '#14B8A6', bg: '#F0FDFA', text: '#0F766E' },
  youtube:   { dot: '#EF4444', bg: '#FEF2F2', text: '#B91C1C' },
  x:         { dot: '#8B5CF6', bg: '#F5F3FF', text: '#6D28D9' },
}

// ── create post form ──────────────────────────────────────────────────────────

function CreatePostForm({ dateKey, onSaved, onCancel }: {
  dateKey: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [topic,   setTopic]   = useState('')
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState('linkedin')
  const [time,    setTime]    = useState('09:00')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const save = async () => {
    if (!topic.trim())   { setError('Add a title.'); return }
    if (!content.trim()) { setError('Write some content.'); return }
    setError('')
    setSaving(true)

    const scheduled_for = `${dateKey}T${time}:00`

    const res = await fetch('/api/drafts/schedule', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic: topic.trim(), draft_text: content.trim(), channel, scheduled_for }),
    })

    setSaving(false)

    if (res.ok) {
      onSaved()
    } else {
      const { error: msg } = await res.json().catch(() => ({}))
      setError(msg ?? 'Failed to save.')
    }
  }

  return (
    <div className="mt-5 pt-5 border-t border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">New post</p>
        <button onClick={onCancel} className="text-[#BBBBBB] hover:text-[#111111] text-base leading-none transition-colors">×</button>
      </div>

      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Title or topic"
        className="w-full text-sm border border-[#E5E7EB] px-3 py-2 mb-3 focus:outline-none focus:border-[#7C3AED] bg-white rounded-lg"
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {CH_OPTS.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={`px-2.5 py-1 font-mono text-xs border transition-colors rounded-lg ${
              channel === c.id
                ? 'border-[#7C3AED] bg-[#7C3AED] text-white'
                : 'border-[#E5E7EB] text-[#888880] hover:border-[#7C3AED] hover:text-[#111827]'
            }`}>
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="font-mono text-xs text-[#888880] uppercase tracking-widest shrink-0">Time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="font-mono text-sm border border-[#E5E7EB] px-3 py-1.5 focus:outline-none focus:border-[#7C3AED] bg-white rounded-lg"
        />
      </div>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your post here…"
        rows={5}
        className="w-full text-sm border border-[#E5E7EB] px-3 py-2 mb-3 resize-none focus:outline-none focus:border-[#7C3AED] bg-white leading-relaxed rounded-lg"
      />

      {error && <p className="font-mono text-xs text-[#888880] mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] disabled:opacity-50 transition-colors rounded-lg">
          {saving ? 'Saving…' : 'Add to calendar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs text-[#888880] hover:text-[#111827] border border-[#E5E7EB] hover:border-[#7C3AED] transition-colors rounded-lg">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── what's left ───────────────────────────────────────────────────────────────

function WhatsLeft({
  brandReady, researchCount, draftsCount, pendingCount, photoCount,
}: {
  brandReady: boolean
  researchCount: number
  draftsCount: number
  pendingCount: number
  photoCount: number
}) {
  const tasks = [
    {
      done: brandReady,
      label: 'Set up brand profile',
      sub: 'Add company info and generate strategy',
      href: '/brand',
    },
    {
      done: researchCount > 0,
      label: 'Run research scan',
      sub: 'Find content ideas from YouTube and trends',
      href: '/research',
    },
    {
      done: draftsCount > 0,
      label: 'Generate content',
      sub: 'AI creates posts based on your strategy',
      href: '/generate',
    },
    {
      done: photoCount > 0,
      label: 'Upload photos',
      sub: 'Build your media library for auto-matching',
      href: '/photos',
    },
    {
      done: pendingCount === 0 && draftsCount > 0,
      label: pendingCount > 0 ? `Review ${pendingCount} pending draft${pendingCount !== 1 ? 's' : ''}` : 'Review drafts',
      sub: pendingCount > 0 ? 'Approve, edit, or reject waiting content' : 'All drafts reviewed',
      href: '/drafts?filter=pending',
    },
  ]

  const doneCount = tasks.filter(t => t.done).length

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-[#6B7280]">WHAT'S LEFT</p>
          <p className="font-mono text-xs text-[#BBBBBB] mt-0.5">{doneCount}/{tasks.length} done</p>
        </div>
        <Link href="/guide" className="font-mono text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
          How it works →
        </Link>
      </div>

      {/* progress bar */}
      <div className="h-1 bg-[#F3F4F6] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-[#7C3AED] rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / tasks.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2.5">
        {tasks.map((t, i) => (
          <Link
            key={i}
            href={t.href}
            className={`flex items-start gap-3 group transition-opacity ${t.done ? 'opacity-50' : 'opacity-100'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
              t.done
                ? 'border-[#10B981] bg-[#10B981]'
                : 'border-[#E5E7EB] group-hover:border-[#7C3AED]'
            }`}>
              {t.done && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <polyline points="1,4 3,6 7,2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-snug ${t.done ? 'line-through text-[#9CA3AF]' : 'text-[#111111] group-hover:text-[#7C3AED]'} transition-colors`}>
                {t.label}
              </p>
              {!t.done && <p className="font-mono text-xs text-[#BBBBBB] mt-0.5">{t.sub}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── calendar ──────────────────────────────────────────────────────────────────

function DashboardCalendar({ drafts, onPostCreated }: { drafts: Draft[]; onPostCreated: () => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selected,    setSelected]    = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)

  const rejectPost = async (id: string) => {
    setDeletingId(id)
    await supabase.from('generated_drafts').update({ status: 'rejected' }).eq('id', id)
    setDeletingId(null)
    onPostCreated()
  }

  const postsByDate = useMemo(() => {
    const map: Record<string, Draft[]> = {}
    drafts.filter(d => d.scheduled_for).forEach(d => {
      const k = dateKey(d.scheduled_for!)
      if (!map[k]) map[k] = []
      map[k].push(d)
    })
    return map
  }, [drafts])

  const cells = useMemo(() => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const first = new Date(y, m, 1)
    const last  = new Date(y, m + 1, 0)
    const offset = (first.getDay() + 6) % 7
    const arr: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= last.getDate(); d++) {
      arr.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
    return arr
  }, [currentMonth])

  const today       = todayKey()
  const monthLabel  = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const selectedPosts = selected ? (postsByDate[selected] ?? []) : []

  const handleDayClick = (key: string) => {
    if (selected === key) {
      setSelected(null)
      setShowCreate(false)
    } else {
      setSelected(key)
      setShowCreate(false)
      setExpandedId(null)
    }
  }

  return (
    <div>
      {/* month nav */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[#111111]">{monthLabel}</h2>
        <div className="flex gap-0">
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-7 h-7 flex items-center justify-center text-[#888880] hover:text-[#111111] hover:bg-[#F3F4F6] transition-colors rounded-lg">
            ‹
          </button>
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-7 h-7 flex items-center justify-center text-[#888880] hover:text-[#111111] hover:bg-[#F3F4F6] transition-colors rounded-lg">
            ›
          </button>
        </div>
      </div>

      {/* day headers */}
      <div className="grid grid-cols-7 pb-2 border-b border-[#E5E7EB] mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <p key={i} className="text-[11px] text-[#9CA3AF] text-center tracking-wide">{d}</p>
        ))}
      </div>

      {/* grid */}
      <div className="grid grid-cols-7 gap-px bg-[#F3F4F6]">
        {cells.map((key, i) => {
          if (!key) return <div key={i} />
          const day   = parseInt(key.slice(8))
          const posts = postsByDate[key] ?? []
          const isSel = selected === key
          const isTod = key === today

          const isPast = key < today

          return (
            <button
              key={key}
              onClick={() => handleDayClick(key)}
              className={`flex flex-col items-center justify-start pt-2 pb-1.5 min-h-[50px] transition-colors ${
                isSel
                  ? 'bg-[#7C3AED] text-white'
                  : isPast
                  ? 'bg-white text-[#D1D5DB] hover:bg-[#F9FAFB]'
                  : 'bg-white text-[#374151] hover:bg-[#F9FAFB]'
              }`}
            >
              {isTod ? (
                <span className="w-6 h-6 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-xs font-medium">{day}</span>
              ) : (
                <span className="text-sm leading-none">{day}</span>
              )}
              {posts.length > 0 && (
                <div className="flex gap-0.5 mt-1.5 flex-wrap justify-center px-0.5">
                  {posts.slice(0, 4).map((p, pi) => (
                    <span
                      key={pi}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : (CH_COLOR[p.channel]?.dot ?? '#888880') }}
                    />
                  ))}
                  {posts.length > 4 && (
                    <span className={`font-mono text-[8px] leading-none ${isSel ? 'text-white/60' : 'text-[#BBBBBB]'}`}>
                      +{posts.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* selected day detail */}
      {selected && (
        <div className="mt-5 pt-5 border-t border-[#E5E7EB]">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">
              {fmtDayLabel(selected)}
            </p>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="font-mono text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
                + post
              </button>
            )}
          </div>

          {selectedPosts.length === 0 && !showCreate ? (
            <p className="font-mono text-xs text-[#BBBBBB]">Nothing scheduled</p>
          ) : (
            <div>
              {selectedPosts
                .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
                .map(d => {
                  const isOpen = expandedId === d.id
                  return (
                    <div key={d.id} className="border-b border-[#E5E7EB] last:border-0">
                      {/* row — click to expand */}
                      <div
                        className="flex items-center gap-3 py-2.5 cursor-pointer group"
                        onClick={() => setExpandedId(isOpen ? null : d.id)}
                      >
                        <span className="font-mono text-xs text-[#888880] shrink-0 w-10">
                          {fmtTime(d.scheduled_for!)}
                        </span>
                        <span
                          className="font-mono text-[10px] font-semibold shrink-0 px-1.5 py-0.5 uppercase tracking-wide rounded-full"
                          style={{
                            backgroundColor: CH_COLOR[d.channel]?.bg ?? '#F5F4F1',
                            color: CH_COLOR[d.channel]?.text ?? '#888880',
                          }}
                        >
                          {d.channel}
                        </span>
                        <p className="text-sm text-[#111111] flex-1 truncate">{d.topic}</p>
                        <span className="font-mono text-xs text-[#CCCCCC] group-hover:text-[#888880] shrink-0 transition-colors">
                          {isOpen ? '↑' : '↓'}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); rejectPost(d.id) }}
                          disabled={deletingId === d.id}
                          className="shrink-0 text-[#BBBBBB] hover:text-[#111111] transition-colors disabled:opacity-40 text-sm leading-none">
                          {deletingId === d.id ? '…' : '×'}
                        </button>
                      </div>

                      {/* expanded content */}
                      {isOpen && (
                        <div className="pb-4 px-0">
                          {d.status === 'pending' && (
                            <p className="font-mono text-xs text-[#BBBBBB] mb-2">pending approval</p>
                          )}
                          <p className="text-sm text-[#444444] whitespace-pre-wrap leading-relaxed">
                            {d.draft_text}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}

          {showCreate && (
            <CreatePostForm
              dateKey={selected}
              onSaved={() => { setShowCreate(false); onPostCreated() }}
              onCancel={() => setShowCreate(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── upcoming row ──────────────────────────────────────────────────────────────

function UpcomingRow({ draft }: { draft: Draft }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-[#F3F4F6] last:border-0">
      <div
        className="flex items-center gap-2 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xs text-[#9CA3AF] shrink-0 w-12">
          {fmtShortDate(draft.scheduled_for!)}
        </span>
        <span
          className="text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#F3F4F6',
            color: CH_COLOR[draft.channel]?.text ?? '#6B7280',
          }}
        >
          {draft.channel[0].toUpperCase()}
        </span>
        <p className="text-sm text-[#111827] flex-1 truncate leading-snug">{draft.topic}</p>
        <span className="text-[10px] text-[#D1D5DB] shrink-0 select-none">
          {expanded ? '↑' : '↓'}
        </span>
      </div>
      {expanded && (
        <p className="text-xs text-[#6B7280] leading-relaxed pb-2.5 pl-14 line-clamp-4">
          {draft.draft_text.replace(/\n+/g, ' ')}
        </p>
      )}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [drafts, setDrafts]               = useState<Draft[]>([])
  const [researchCount, setResearch]      = useState(0)
  const [brandReady, setBrandReady]       = useState(false)
  const [photoCount, setPhotoCount]       = useState(0)
  const [loading, setLoading]             = useState(true)
  const [resetStep, setResetStep]         = useState<0|1>(0)
  const [resetting, setResetting]         = useState(false)
  const [resetMsg, setResetMsg]           = useState('')
  const [strategyAgeDays, setStrategyAge] = useState<number | null>(null)
  const [strategyBannerDismissed, setStrategyBannerDismissed] = useState(false)
  const [cadence, setCadence]             = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    const [draftsRes, researchRes, brandRes, photoRes] = await Promise.all([
      supabase.from('generated_drafts').select('*').order('created_at', { ascending: false }),
      supabase.from('research_candidates').select('id', { count: 'exact', head: true }),
      supabase.from('brand_profile').select('company_name, strategy, strategy_updated_at, posting_cadence').limit(1).maybeSingle(),
      supabase.from('photo_library').select('id', { count: 'exact', head: true }),
    ])
    setDrafts(draftsRes.data ?? [])
    setResearch(researchRes.count ?? 0)
    setBrandReady(!!(brandRes.data?.company_name && brandRes.data?.strategy))
    setPhotoCount(photoRes.count ?? 0)
    if (brandRes.data?.strategy_updated_at) {
      const days = Math.floor((Date.now() - new Date(brandRes.data.strategy_updated_at).getTime()) / 86_400_000)
      setStrategyAge(days)
    }
    setCadence((brandRes.data as any)?.posting_cadence ?? {})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400_000)

  // Mon–Sun of the current calendar week
  const weekStart = (() => {
    const d = new Date(now)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)

  const scheduledDrafts = useMemo(
    () => drafts.filter(d => d.scheduled_for && d.status !== 'rejected'),
    [drafts]
  )

  const thisWeek = useMemo(
    () => scheduledDrafts.filter(d => {
      const t = new Date(d.scheduled_for!)
      return t >= now && t <= in7
    }).length,
    [scheduledDrafts]
  )

  const upcoming = useMemo(
    () => drafts
      .filter(d => d.scheduled_for && new Date(d.scheduled_for) >= now && d.status !== 'rejected')
      .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
      .slice(0, 10),
    [drafts]
  )

  const weekByChannel = useMemo(() => {
    const map: Record<string, number> = {}
    scheduledDrafts.forEach(d => {
      if (!d.scheduled_for) return
      const t = new Date(d.scheduled_for)
      if (t >= weekStart && t < weekEnd) {
        map[d.channel] = (map[d.channel] ?? 0) + 1
      }
    })
    return map
  }, [scheduledDrafts])

  const pendingCount = useMemo(
    () => drafts.filter(d => d.status === 'pending' || d.status === 'needs_edit').length,
    [drafts]
  )

  const approvedCount = useMemo(
    () => drafts.filter(d => d.status === 'approved').length,
    [drafts]
  )

  const doReset = async () => {
    setResetting(true)
    const res = await fetch('/api/reset', { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setResetting(false)
    setResetStep(0)
    if (res.ok) {
      setResetMsg(`Cleared — ${json.deleted?.drafts ?? 0} drafts, ${json.deleted?.research ?? 0} research items`)
      setTimeout(() => setResetMsg(''), 4000)
      load()
    }
  }

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-[1200px] w-full">

      {/* header */}
      <div className="flex items-center justify-between mb-4 lg:mb-5 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[#111827]">Dashboard</h1>
          <p className="font-mono text-xs text-[#BBBBBB] mt-1.5">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {resetMsg && (
            <p className="text-xs text-[#6B7280]">{resetMsg}</p>
          )}
          {resetStep === 0 ? (
            <button
              onClick={() => setResetStep(1)}
              className="text-xs text-[#9CA3AF] hover:text-[#DC2626] transition-colors">
              Start over
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">Clear all data?</span>
              <button
                onClick={doReset}
                disabled={resetting}
                className="text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] px-3 py-1 rounded-lg disabled:opacity-50 transition-colors">
                {resetting ? 'Clearing…' : 'Yes, clear'}
              </button>
              <button
                onClick={() => setResetStep(0)}
                className="text-xs text-[#9CA3AF] hover:text-[#111827] transition-colors">
                Cancel
              </button>
            </div>
          )}
          <button
            onClick={() => { setLoading(true); load() }}
            className="font-mono text-sm text-[#BBBBBB] hover:text-[#111827] transition-colors">
            ↻
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Link href="/drafts?filter=pending" className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 hover:border-[#7C3AED] transition-colors group">
          <p className="text-2xl font-semibold text-[#111827] group-hover:text-[#7C3AED] transition-colors">{pendingCount}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Pending review</p>
        </Link>
        <Link href="/drafts?filter=approved" className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 hover:border-[#7C3AED] transition-colors group">
          <p className="text-2xl font-semibold text-[#111827] group-hover:text-[#7C3AED] transition-colors">{approvedCount}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Approved</p>
        </Link>
        <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3">
          <p className="text-2xl font-semibold text-[#111827]">{thisWeek}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">This week</p>
        </div>
        <Link href="/research" className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 hover:border-[#7C3AED] transition-colors group">
          <p className="text-2xl font-semibold text-[#111827] group-hover:text-[#7C3AED] transition-colors">{researchCount}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Research items</p>
        </Link>
      </div>

      {/* strategy refresh prompt */}
      {!strategyBannerDismissed && strategyAgeDays !== null && strategyAgeDays >= 90 && (
        <div className="mb-5 flex items-center justify-between gap-4 px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-base">💡</span>
            <div>
              <p className="text-sm font-semibold text-[#92400E]">Your brand strategy is {strategyAgeDays} days old</p>
              <p className="text-xs text-[#B45309] mt-0.5">Markets change — a quick refresh helps the AI stay aligned with where your brand is heading.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/brand"
              className="px-3 py-1.5 text-xs font-semibold bg-[#D97706] text-white rounded-lg hover:bg-[#B45309] transition-colors">
              Refresh strategy
            </Link>
            <button
              onClick={() => setStrategyBannerDismissed(true)}
              className="text-[#D97706] hover:text-[#92400E] transition-colors text-lg leading-none px-1">
              ×
            </button>
          </div>
        </div>
      )}

      {/* two-column layout: stacks on mobile */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-5 lg:gap-7 items-start">

        {/* left — calendar */}
        <div className="bg-white rounded-xl shadow-sm p-5 border border-[#E5E7EB] w-full">
          <DashboardCalendar drafts={scheduledDrafts} onPostCreated={load} />
        </div>

        {/* right column */}
        <div className="space-y-5 w-full">

          {/* what's left checklist */}
          <WhatsLeft
            brandReady={brandReady}
            researchCount={researchCount}
            draftsCount={drafts.length}
            pendingCount={pendingCount}
            photoCount={photoCount}
          />

          {/* cadence progress */}
          {Object.keys(cadence).some(ch => cadence[ch] > 0) && (
            <div className="bg-white rounded-xl shadow-sm p-5 border border-[#E5E7EB] w-full">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-[#6B7280]">THIS WEEK</p>
                <Link href="/brand" className="font-mono text-xs text-[#BBBBBB] hover:text-[#7C3AED] transition-colors">
                  edit →
                </Link>
              </div>
              <div className="space-y-3">
                {CH_OPTS.filter(ch => (cadence[ch.id] ?? 0) > 0).map(ch => {
                  const target  = cadence[ch.id] ?? 0
                  const done    = weekByChannel[ch.id] ?? 0
                  const pct     = Math.min(100, Math.round((done / target) * 100))
                  const color   = CH_COLOR[ch.id]
                  const overdue = done > target
                  return (
                    <div key={ch.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: color?.bg, color: color?.text }}>
                          {ch.label.toUpperCase()}
                        </span>
                        <span className={`font-mono text-xs ${overdue ? 'text-[#10B981]' : done === target ? 'text-[#10B981]' : 'text-[#888880]'}`}>
                          {done}/{target}
                        </span>
                      </div>
                      <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? '#10B981' : color?.dot ?? '#7C3AED',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* upcoming */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-[#E5E7EB] w-full">
            <p className="text-xs font-semibold text-[#6B7280] mb-1">COMING UP</p>
            {scheduledDrafts.length > 0 && (
              <p className="font-mono text-sm text-[#888880] mb-5">
                {scheduledDrafts.length} scheduled{thisWeek > 0 ? ` · ${thisWeek} this week` : ''}
              </p>
            )}
            {upcoming.length === 0 ? (
              <p className="font-mono text-sm text-[#BBBBBB]">Nothing scheduled yet.</p>
            ) : (
              <div>
                {upcoming.map(d => <UpcomingRow key={d.id} draft={d} />)}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
