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
    <div className="mt-5 pt-5 border-t border-[#E2E1DE]">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">New post</p>
        <button onClick={onCancel} className="text-[#BBBBBB] hover:text-[#111111] text-base leading-none transition-colors">×</button>
      </div>

      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Title or topic"
        className="w-full text-sm border border-[#E2E1DE] px-3 py-2 mb-3 focus:outline-none focus:border-[#3A3A3A] bg-white"
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {CH_OPTS.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={`px-2.5 py-1 font-mono text-xs border transition-colors ${
              channel === c.id
                ? 'border-[#111111] bg-[#111111] text-white'
                : 'border-[#E2E1DE] text-[#888880] hover:border-[#3A3A3A] hover:text-[#111111]'
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
          className="font-mono text-sm border border-[#E2E1DE] px-3 py-1.5 focus:outline-none focus:border-[#3A3A3A] bg-white"
        />
      </div>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your post here…"
        rows={5}
        className="w-full text-sm border border-[#E2E1DE] px-3 py-2 mb-3 resize-none focus:outline-none focus:border-[#3A3A3A] bg-white leading-relaxed"
      />

      {error && <p className="font-mono text-xs text-[#888880] mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#3A3A3A] disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Add to calendar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs text-[#888880] hover:text-[#111111] border border-[#E2E1DE] hover:border-[#3A3A3A] transition-colors">
          Cancel
        </button>
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
            className="w-7 h-7 flex items-center justify-center text-[#888880] hover:text-[#111111] hover:bg-[#E2E1DE] transition-colors">
            ‹
          </button>
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-7 h-7 flex items-center justify-center text-[#888880] hover:text-[#111111] hover:bg-[#E2E1DE] transition-colors">
            ›
          </button>
        </div>
      </div>

      {/* day headers */}
      <div className="grid grid-cols-7 pb-2 border-b border-[#E2E1DE] mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <p key={i} className="font-mono text-xs text-[#BBBBBB] text-center">{d}</p>
        ))}
      </div>

      {/* grid */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((key, i) => {
          if (!key) return <div key={i} />
          const day   = parseInt(key.slice(8))
          const posts = postsByDate[key] ?? []
          const isSel = selected === key
          const isTod = key === today

          return (
            <button
              key={key}
              onClick={() => handleDayClick(key)}
              className={`flex flex-col items-center justify-start pt-2 pb-1.5 min-h-[50px] transition-colors ${
                isSel
                  ? 'bg-[#111111] text-white'
                  : isTod
                  ? 'text-[#111111] font-bold'
                  : 'text-[#888880] hover:bg-[#E2E1DE] hover:text-[#111111]'
              }`}
            >
              <span className="font-mono text-sm leading-none">{day}</span>
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
        <div className="mt-5 pt-5 border-t border-[#E2E1DE]">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">
              {fmtDayLabel(selected)}
            </p>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors">
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
                    <div key={d.id} className="border-b border-[#E2E1DE] last:border-0">
                      {/* row — click to expand */}
                      <div
                        className="flex items-center gap-3 py-2.5 cursor-pointer group"
                        onClick={() => setExpandedId(isOpen ? null : d.id)}
                      >
                        <span className="font-mono text-xs text-[#888880] shrink-0 w-10">
                          {fmtTime(d.scheduled_for!)}
                        </span>
                        <span
                          className="font-mono text-[10px] font-semibold shrink-0 px-1.5 py-0.5 uppercase tracking-wide"
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
    <div className="border-b border-[#E2E1DE] last:border-0">
      <div
        className="flex items-center gap-3 py-2.5 cursor-pointer group"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="font-mono text-xs text-[#BBBBBB] shrink-0 w-14">
          {fmtShortDate(draft.scheduled_for!)}
        </span>
        <span
          className="font-mono text-[10px] font-semibold shrink-0 px-1.5 py-0.5 uppercase tracking-wide"
          style={{
            backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#F5F4F1',
            color: CH_COLOR[draft.channel]?.text ?? '#888880',
          }}
        >
          {draft.channel}
        </span>
        <p className="text-sm text-[#111111] flex-1 leading-snug">{draft.topic}</p>
        <span className="text-xs text-[#BBBBBB] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 select-none">
          {expanded ? '↑' : '↓'}
        </span>
      </div>
      {expanded && (
        <p className="text-sm text-[#555555] whitespace-pre-wrap leading-relaxed pb-3 pl-[4.25rem]">
          {draft.draft_text}
        </p>
      )}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: d } = await supabase
      .from('generated_drafts')
      .select('*')
      .order('created_at', { ascending: false })
    setDrafts(d ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400_000)

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
    <div className="px-5 sm:px-8 lg:px-10 py-8 lg:py-10 max-w-[1200px] w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 lg:mb-10 pb-6 border-b border-[#E2E1DE]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Dashboard</h1>
          <p className="font-mono text-xs text-[#BBBBBB] mt-1.5">{today}</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="font-mono text-sm text-[#BBBBBB] hover:text-[#111111] transition-colors">
          ↻
        </button>
      </div>

      {/* two-column layout: stacks on mobile */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-8 lg:gap-12 items-start">

        {/* left — calendar */}
        <DashboardCalendar drafts={scheduledDrafts} onPostCreated={load} />

        {/* right — upcoming */}
        <div>
          <p className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-1">Coming up</p>
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
  )
}
