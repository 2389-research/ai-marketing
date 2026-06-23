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

const CHANNELS = ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x'] as const

const CH_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  linkedin:  { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  instagram: { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-500'   },
  email:     { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  tiktok:    { bg: 'bg-cyan-50',   text: 'text-cyan-700',   dot: 'bg-cyan-500'   },
  youtube:   { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
  x:         { bg: 'bg-gray-100',  text: 'text-gray-900',   dot: 'bg-gray-900'   },
}

const CH_BADGE: Record<string, string> = {
  linkedin:  'bg-blue-100 text-blue-800',
  instagram: 'bg-pink-100 text-pink-800',
  email:     'bg-amber-100 text-amber-800',
  tiktok:    'bg-cyan-100 text-cyan-800',
  youtube:   'bg-red-100 text-red-800',
  x:         'bg-gray-900 text-white',
}

// ── create post form ──────────────────────────────────────────────────────────

const CH_OPTS = [
  { id: 'linkedin',  label: 'LinkedIn',  cls: 'bg-blue-100 border-blue-400 text-blue-800'   },
  { id: 'instagram', label: 'Instagram', cls: 'bg-pink-100 border-pink-400 text-pink-800'   },
  { id: 'email',     label: 'Email',     cls: 'bg-amber-100 border-amber-400 text-amber-800' },
  { id: 'tiktok',    label: 'TikTok',   cls: 'bg-cyan-100 border-cyan-400 text-cyan-800'    },
  { id: 'youtube',   label: 'YouTube',  cls: 'bg-red-100 border-red-400 text-red-800'       },
  { id: 'x',         label: 'X',        cls: 'bg-gray-900 border-gray-900 text-white'        },
]

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
    <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New post</p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {/* title */}
      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Title or topic"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />

      {/* channel pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CH_OPTS.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={`px-3 py-1 text-xs font-bold rounded-lg border-2 transition-colors ${
              channel === c.id ? c.cls : 'border-gray-200 text-gray-400 hover:border-gray-300'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* time */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-gray-500 shrink-0">Time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
      </div>

      {/* content */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your post here…"
        rows={5}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white leading-relaxed"
      />

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Add to calendar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-white transition-colors">
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

  const today        = todayKey()
  const monthLabel   = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const selectedPosts = selected ? (postsByDate[selected] ?? []) : []

  const handleDayClick = (key: string) => {
    if (selected === key) {
      setSelected(null)
      setShowCreate(false)
    } else {
      setSelected(key)
      setShowCreate(false)
    }
  }

  const handleSaved = () => {
    setShowCreate(false)
    onPostCreated()
  }

  return (
    <div>
      {/* month nav */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">
            ‹
          </button>
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">
            ›
          </button>
        </div>
      </div>

      {/* contextual month stats */}
      {(() => {
        const now = new Date()
        const in7 = new Date(now.getTime() + 7 * 86400_000)
        const thisWeek = drafts.filter(d => {
          const t = new Date(d.scheduled_for!)
          return t >= now && t <= in7
        }).length
        const total = drafts.length
        if (total === 0) return null
        return (
          <p className="text-xs text-gray-400 mb-4 -mt-1">
            {total} scheduled
            {thisWeek > 0 && <> · <span className="text-gray-600 font-medium">{thisWeek} this week</span></>}
          </p>
        )
      })()}

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
              onClick={() => handleDayClick(key)}
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
                        isSel ? 'bg-white/80' : CH_COLOR[p.channel]?.dot ?? 'bg-gray-400'
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {fmtDayLabel(selected)}
            </p>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2.5 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                + Create post
              </button>
            )}
          </div>

          {selectedPosts.length === 0 && !showCreate ? (
            <p className="text-sm text-gray-400">Nothing scheduled — click Create post to add one.</p>
          ) : (
            <div className="space-y-2">
              {selectedPosts
                .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
                .map(d => (
                  <div key={d.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${CH_BADGE[d.channel] ?? 'bg-gray-100 text-gray-700'}`}>
                      {d.channel.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{d.topic}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(d.scheduled_for!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {d.status === 'approved' && <span className="ml-2 text-green-500 font-medium">· approved</span>}
                        {d.status === 'pending'  && <span className="ml-2 text-orange-400 font-medium">· pending review</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => rejectPost(d.id)}
                      disabled={deletingId === d.id}
                      title="Remove from calendar"
                      className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                      {deletingId === d.id ? '…' : '×'}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {showCreate && (
            <CreatePostForm
              dateKey={selected}
              onSaved={handleSaved}
              onCancel={() => setShowCreate(false)}
            />
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

  const now  = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400_000)

  const pending        = useMemo(() => drafts.filter(d => d.status === 'pending' || d.status === 'needs_edit').length, [drafts])
  const scheduledDrafts = useMemo(() => drafts.filter(d => d.scheduled_for && d.status !== 'rejected'), [drafts])

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
    <div className="px-8 py-10 max-w-[1200px]">
      {/* header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">{today}</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="text-sm text-gray-400 hover:text-gray-700 px-3 py-1.5 border border-stone-200 rounded-lg hover:bg-white transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* main: two columns */}
      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

        {/* left — calendar */}
        <div className="bg-white rounded-2xl border border-stone-100 p-6">
          <DashboardCalendar drafts={scheduledDrafts} onPostCreated={load} />
        </div>

        {/* right column */}
        <div className="space-y-5">

          {/* channel breakdown */}
          <div className="bg-white rounded-2xl border border-stone-100 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Channels — next 30 days</p>
            <div className="space-y-2">
              {channelStats.map(s => (
                <ChannelCard key={s.channel} {...s} />
              ))}
            </div>
          </div>

          {/* upcoming */}
          <div className="bg-white rounded-2xl border border-stone-100 p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coming up</p>
              {pending > 0 && (
                <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 border border-orange-200 rounded-full px-2 py-0.5">
                  {pending} pending
                </span>
              )}
            </div>
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
