'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase, type Draft } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(iso: string) {
  return iso.slice(0, 10)
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDayLabel(key: string) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// ── channel config ────────────────────────────────────────────────────────────

const CHANNELS = ['linkedin', 'instagram', 'email', 'tiktok'] as const

const CH_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  linkedin:  { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  instagram: { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-500'   },
  email:     { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  tiktok:    { bg: 'bg-cyan-50',   text: 'text-cyan-700',   dot: 'bg-cyan-500'   },
}

const CH_BADGE: Record<string, string> = {
  linkedin:  'bg-blue-100 text-blue-800',
  instagram: 'bg-pink-100 text-pink-800',
  email:     'bg-amber-100 text-amber-800',
  tiktok:    'bg-cyan-100 text-cyan-800',
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5 shadow-sm">
      <p className={`text-3xl font-bold tracking-tight ${accent ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  )
}

// ── calendar ──────────────────────────────────────────────────────────────────

function DashboardCalendar({ drafts }: { drafts: Draft[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string | null>(null)

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

  const today = todayKey()
  const monthLabel = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const selectedPosts = selected ? (postsByDate[selected] ?? []) : []

  return (
    <div>
      {/* month nav */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelected(null) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">
            ‹
          </button>
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelected(null) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">
            ›
          </button>
        </div>
      </div>

      {/* day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <p key={d} className="text-xs text-gray-400 text-center py-1 font-medium">{d}</p>
        ))}
      </div>

      {/* grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <div key={i} />
          const day   = parseInt(key.slice(8))
          const posts = postsByDate[key] ?? []
          const isSel = selected === key
          const isTod = key === today

          return (
            <button
              key={key}
              onClick={() => setSelected(isSel ? null : key)}
              className={`flex flex-col items-center justify-start pt-1.5 pb-1 rounded-xl min-h-[52px] transition-colors ${
                isSel ? 'bg-blue-600 text-white'
                : isTod ? 'bg-blue-50 text-blue-700 font-bold'
                : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="text-sm leading-none">{day}</span>
              {posts.length > 0 && (
                <div className="flex gap-0.5 mt-1.5 flex-wrap justify-center px-1">
                  {posts.slice(0, 4).map((p, pi) => (
                    <span
                      key={pi}
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSel ? 'bg-white/80'
                        : CH_COLOR[p.channel]?.dot ?? 'bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* selected day detail */}
      {selected && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
            {fmtDayLabel(selected)}
          </p>
          {selectedPosts.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedPosts
                .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
                .map(d => (
                  <div key={d.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${CH_BADGE[d.channel] ?? 'bg-gray-100 text-gray-700'}`}>
                      {d.channel.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{d.topic}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(d.scheduled_for!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── channel breakdown card ────────────────────────────────────────────────────

function ChannelCard({ channel, scheduled, pending, next }: {
  channel: string
  scheduled: number
  pending: number
  next: Draft | undefined
}) {
  const c = CH_COLOR[channel] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }
  return (
    <div className={`rounded-xl ${c.bg} px-4 py-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold tracking-wider ${c.text}`}>
          {channel.toUpperCase()}
        </span>
        <span className={`text-lg font-bold ${c.text}`}>{scheduled}</span>
      </div>
      <p className="text-xs text-gray-500">
        {scheduled === 1 ? '1 post' : `${scheduled} posts`} scheduled
        {pending > 0 && (
          <span className="ml-2 text-orange-500 font-medium">· {pending} pending</span>
        )}
      </p>
      {next?.scheduled_for && (
        <p className="text-xs text-gray-400 mt-1 truncate">
          Next: {new Date(next.scheduled_for).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}

// ── upcoming post row ─────────────────────────────────────────────────────────

function UpcomingRow({ draft }: { draft: Draft }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${CH_BADGE[draft.channel] ?? 'bg-gray-100 text-gray-700'}`}>
        {draft.channel.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800 truncate">{draft.topic}</p>
        <p className="text-xs text-gray-400 mt-0.5">{fmtShort(draft.scheduled_for!)}</p>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [drafts, setDrafts]         = useState<Draft[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    const [{ data: d }, { count }] = await Promise.all([
      supabase.from('generated_drafts').select('*').order('created_at', { ascending: false }),
      supabase.from('research_candidates').select('*', { count: 'exact', head: true }),
    ])
    setDrafts(d ?? [])
    setCandidateCount(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const in7  = new Date(now.getTime() + 7  * 86400_000)
  const in30 = new Date(now.getTime() + 30 * 86400_000)

  const pending      = useMemo(() => drafts.filter(d => d.status === 'pending' || d.status === 'needs_edit').length, [drafts])
  const thisWeek     = useMemo(() => drafts.filter(d => d.scheduled_for && new Date(d.scheduled_for) >= now && new Date(d.scheduled_for) <= in7).length, [drafts])
  const totalSched   = useMemo(() => drafts.filter(d => d.scheduled_for && new Date(d.scheduled_for) >= now).length, [drafts])
  const scheduledDrafts = useMemo(() => drafts.filter(d => d.scheduled_for), [drafts])

  const channelStats = useMemo(() =>
    CHANNELS.map(ch => {
      const sched = drafts.filter(d =>
        d.channel === ch && d.scheduled_for &&
        new Date(d.scheduled_for) >= now && new Date(d.scheduled_for) <= in30
      ).sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())

      const pend = drafts.filter(d => d.channel === ch && (d.status === 'pending' || d.status === 'needs_edit'))

      return { channel: ch, scheduled: sched.length, pending: pend.length, next: sched[0] }
    })
  , [drafts])

  const upcoming = useMemo(() =>
    drafts
      .filter(d => d.scheduled_for && new Date(d.scheduled_for) >= now)
      .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
      .slice(0, 6)
  , [drafts])

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      {/* header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard value={pending}    label="Pending review"    accent={pending > 0 ? 'text-orange-500' : undefined} />
        <StatCard value={thisWeek}   label="Scheduled this week" />
        <StatCard value={totalSched} label="Upcoming posts" />
        <StatCard value={candidateCount} label="Research candidates" />
      </div>

      {/* main content: two columns */}
      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

        {/* left — calendar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <DashboardCalendar drafts={scheduledDrafts} />
        </div>

        {/* right column */}
        <div className="space-y-5">

          {/* channel breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Channels — next 30 days</p>
            <div className="space-y-2">
              {channelStats.map(s => (
                <ChannelCard key={s.channel} {...s} />
              ))}
            </div>
          </div>

          {/* upcoming */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Coming up</p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">No posts scheduled yet.</p>
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
