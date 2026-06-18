'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, type Draft, type ResearchCandidate } from '@/lib/supabase'

type Tab = 'drafts' | 'write' | 'calendar' | 'research'
type CalendarView = 'list' | 'grid'

const CHANNEL_COLORS: Record<string, string> = {
  linkedin:  'bg-blue-100 text-blue-800',
  instagram: 'bg-pink-100 text-pink-800',
  email:     'bg-yellow-100 text-yellow-800',
  tiktok:    'bg-cyan-100 text-cyan-800',
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-orange-100 text-orange-700',
  approved:   'bg-green-100 text-green-700',
  rejected:   'bg-red-100 text-red-700',
  needs_edit: 'bg-purple-100 text-purple-700',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(dateKey: string) {
  return new Date(dateKey + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// ── Draft Card ────────────────────────────────────────────────────────────────

function DraftCard({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [loading, setLoading]       = useState(false)
  const [showEditBox, setShowEditBox] = useState(false)
  const [feedback, setFeedback]     = useState('')
  const [expanded, setExpanded]     = useState(false)

  const act = async (endpoint: string, body?: object) => {
    setLoading(true)
    await fetch(`/api/drafts/${draft.id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    setLoading(false)
    onAction()
  }

  const isPending = draft.status === 'pending' || draft.status === 'needs_edit'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHANNEL_COLORS[draft.channel] ?? 'bg-gray-100 text-gray-700'}`}>
            {draft.channel.toUpperCase()}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[draft.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {draft.status.replace('_', ' ')}
          </span>
          {draft.qa_passed === true  && <span className="text-xs text-green-600 font-medium">✓ QA</span>}
          {draft.qa_passed === false && <span className="text-xs text-red-500 font-medium">✗ QA</span>}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{fmtTime(draft.created_at)}</span>
      </div>

      <p className="text-sm font-semibold text-gray-800 mb-2">{draft.topic}</p>

      <div className="text-sm text-gray-600 whitespace-pre-wrap mb-3">
        {expanded ? draft.draft_text : draft.draft_text.slice(0, 200) + (draft.draft_text.length > 200 ? '…' : '')}
        {draft.draft_text.length > 200 && (
          <button onClick={() => setExpanded(e => !e)} className="ml-1 text-blue-500 hover:underline text-xs">
            {expanded ? 'show less' : 'show more'}
          </button>
        )}
      </div>

      {draft.qa_issues && draft.qa_issues.length > 0 && (
        <ul className="mb-3 text-xs text-red-600 space-y-0.5">
          {draft.qa_issues.map((issue, i) => <li key={i}>• {issue}</li>)}
        </ul>
      )}

      {draft.scheduled_for && (
        <p className="text-xs text-gray-500 mb-3">📅 Scheduled: {fmtTime(draft.scheduled_for)}</p>
      )}

      {draft.notes && (
        <p className="text-xs text-gray-400 italic mb-3">{draft.notes}</p>
      )}

      {isPending && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => act('approve')} disabled={loading}
            className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            ✅ Approve
          </button>
          <button onClick={() => setShowEditBox(e => !e)} disabled={loading}
            className="px-3 py-1.5 text-sm font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50">
            ✏️ Request Edit
          </button>
          <button onClick={() => act('reject')} disabled={loading}
            className="px-3 py-1.5 text-sm font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50">
            ❌ Reject
          </button>
        </div>
      )}

      {showEditBox && (
        <div className="mt-3">
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
            placeholder="What needs to change?"
            className="w-full text-sm border border-gray-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
            rows={3} />
          <button
            onClick={() => { act('needs-edit', { feedback }); setShowEditBox(false) }}
            disabled={!feedback.trim() || loading}
            className="mt-1 px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            Submit feedback
          </button>
        </div>
      )}
    </div>
  )
}

// ── Scheduled Post Row (used in both list + grid detail) ──────────────────────

function ScheduledRow({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate, setNewDate]           = useState('')
  const [loading, setLoading]           = useState(false)

  const reschedule = async (iso: string) => {
    setLoading(true)
    await fetch(`/api/drafts/${draft.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_for: iso }),
    })
    setLoading(false)
    setRescheduling(false)
    onAction()
  }

  const postpone = (days: number) => {
    const base = draft.scheduled_for ? new Date(draft.scheduled_for) : new Date()
    base.setDate(base.getDate() + days)
    reschedule(base.toISOString())
  }

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500 w-36 shrink-0">{fmtTime(draft.scheduled_for)}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${CHANNEL_COLORS[draft.channel] ?? 'bg-gray-100 text-gray-700'}`}>
          {draft.channel.toUpperCase()}
        </span>
        <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">{draft.topic}</p>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => postpone(3)} disabled={loading} className="text-xs text-gray-400 hover:text-gray-700 underline">+3d</button>
          <button onClick={() => postpone(7)} disabled={loading} className="text-xs text-gray-400 hover:text-gray-700 underline">+7d</button>
          <button onClick={() => setRescheduling(r => !r)} className="text-xs text-blue-500 hover:underline">reschedule</button>
        </div>
      </div>
      {rescheduling && (
        <div className="flex gap-2 mt-2 pl-0">
          <input type="datetime-local" value={newDate} onChange={e => setNewDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={() => reschedule(new Date(newDate).toISOString())} disabled={!newDate || loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ── Calendar List View ────────────────────────────────────────────────────────

function CalendarList({ drafts, onAction }: { drafts: Draft[]; onAction: () => void }) {
  const grouped = useMemo(() => {
    const map: Record<string, Draft[]> = {}
    drafts
      .filter(d => d.scheduled_for)
      .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
      .forEach(d => {
        const key = d.scheduled_for!.slice(0, 10)
        if (!map[key]) map[key] = []
        map[key].push(d)
      })
    return map
  }, [drafts])

  if (Object.keys(grouped).length === 0)
    return <p className="text-sm text-gray-400">No scheduled posts yet. Approve some drafts first.</p>

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([dateKey, posts]) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">{fmtDate(dateKey)}</h3>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-1 shadow-sm">
            {posts.map(d => <ScheduledRow key={d.id} draft={d} onAction={onAction} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Calendar Grid View ────────────────────────────────────────────────────────

function CalendarGrid({ drafts, onAction }: { drafts: Draft[]; onAction: () => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const postsByDate = useMemo(() => {
    const map: Record<string, Draft[]> = {}
    drafts.filter(d => d.scheduled_for).forEach(d => {
      const key = d.scheduled_for!.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(d)
    })
    return map
  }, [drafts])

  const days = useMemo(() => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const first = new Date(year, month, 1)
    const last  = new Date(year, month + 1, 0)
    const offset = (first.getDay() + 6) % 7  // Mon = 0
    const cells: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= last.getDate(); d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push(key)
    }
    return cells
  }, [currentMonth])

  const todayKey = new Date().toISOString().slice(0, 10)
  const selectedPosts = selectedKey ? (postsByDate[selectedKey] ?? []) : []

  const monthLabel = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedKey(null) }}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 text-lg leading-none">‹</button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button
          onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedKey(null) }}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 text-lg leading-none">›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-xs text-center text-gray-400 py-1 font-medium">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((key, i) => {
          if (!key) return <div key={i} />
          const day    = parseInt(key.slice(8))
          const posts  = postsByDate[key] ?? []
          const isSelected = selectedKey === key
          const isToday    = key === todayKey

          return (
            <button
              key={key}
              onClick={() => setSelectedKey(isSelected ? null : key)}
              className={`rounded-xl p-1.5 flex flex-col items-center min-h-[48px] transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="text-sm">{day}</span>
              {posts.length > 0 && (
                <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                  {posts.slice(0, 3).map((p, pi) => (
                    <span key={pi}
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedKey && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{fmtDate(selectedKey)}</h3>
          {selectedPosts.length === 0 ? (
            <p className="text-sm text-gray-400">No posts scheduled for this day.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-1 shadow-sm">
              {selectedPosts.map(d => <ScheduledRow key={d.id} draft={d} onAction={onAction} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Compose Form ─────────────────────────────────────────────────────────────

const CHANNELS = ['linkedin', 'instagram', 'email', 'tiktok'] as const

const POST_TYPES = [
  { label: 'Company update',    placeholder: "We just shipped / launched / hit a milestone..." },
  { label: 'Holiday / wish',    placeholder: "Happy [holiday] from the 2389 Research team..." },
  { label: 'Behind the scenes', placeholder: "A look at what we've been working on lately..." },
  { label: 'Announcement',      placeholder: "We're excited to share..." },
  { label: 'Other',             placeholder: "Write your post here..." },
]

function ComposeForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [topic, setTopic]           = useState('')
  const [text, setText]             = useState('')
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['linkedin', 'instagram'])
  const [postType, setPostType]     = useState(POST_TYPES[0])
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState('')

  const toggleChannel = (ch: string) =>
    setSelectedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])

  const submit = async () => {
    if (!topic.trim() || !text.trim() || selectedChannels.length === 0) {
      setError('Fill in the topic, content, and select at least one channel.')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/drafts/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic.trim(), draft_text: text.trim(), channels: selectedChannels }),
    })
    setLoading(false)
    if (res.ok) {
      setSuccess(true)
      setTopic('')
      setText('')
      setTimeout(() => { setSuccess(false); onSubmitted() }, 1500)
    } else {
      const { error: msg } = await res.json()
      setError(msg ?? 'Something went wrong.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-2xl">
      {/* Post type quick-select */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Type</label>
        <div className="flex flex-wrap gap-2">
          {POST_TYPES.map(pt => (
            <button key={pt.label} onClick={() => setPostType(pt)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                postType.label === pt.label
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Topic / Title</label>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. Happy New Year from 2389 Research"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Content */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Content</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={postType.placeholder}
          rows={7}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p className="text-xs text-gray-400 mt-1">{text.length} characters</p>
      </div>

      {/* Channel selector */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Channels</label>
        <div className="flex gap-2">
          {CHANNELS.map(ch => (
            <button key={ch} onClick={() => toggleChannel(ch)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-colors ${
                selectedChannels.includes(ch)
                  ? ch === 'linkedin'  ? 'bg-blue-100 border-blue-400 text-blue-800'
                  : ch === 'instagram' ? 'bg-pink-100 border-pink-400 text-pink-800'
                  : ch === 'email'     ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                  :                     'bg-cyan-100 border-cyan-400 text-cyan-800'
                  : 'border-gray-200 text-gray-400 hover:border-gray-400'
              }`}>
              {ch.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {success
        ? <p className="text-sm text-green-600 font-medium">✓ Saved to Drafts — go approve it!</p>
        : <button onClick={submit} disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving…' : 'Submit for Approval'}
          </button>
      }
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Page() {
  const [tab, setTab]                 = useState<Tab>('drafts')
  const [calView, setCalView]         = useState<CalendarView>('grid')
  const [drafts, setDrafts]           = useState<Draft[]>([])
  const [candidates, setCandidates]   = useState<ResearchCandidate[]>([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')

  const loadDrafts = useCallback(async () => {
    const { data } = await supabase.from('generated_drafts').select('*').order('created_at', { ascending: false })
    setDrafts(data ?? [])
  }, [])

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase.from('research_candidates').select('*').order('score', { ascending: false })
    setCandidates(data ?? [])
  }, [])

  useEffect(() => {
    Promise.all([loadDrafts(), loadCandidates()]).finally(() => setLoading(false))
  }, [loadDrafts, loadCandidates])

  const filteredDrafts  = drafts.filter(d => statusFilter === 'all' || d.status === statusFilter)
  const scheduledDrafts = drafts.filter(d => d.scheduled_for)
  const pendingCount    = drafts.filter(d => d.status === 'pending').length

  const refresh = () => {
    setLoading(true)
    Promise.all([loadDrafts(), loadCandidates()]).finally(() => setLoading(false))
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">2389 Research</h1>
            <p className="text-xs text-gray-500">Marketing Dashboard</p>
          </div>
          <button onClick={refresh}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-5xl mx-auto flex gap-6">
          {(['drafts', 'write', 'calendar', 'research'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'drafts'
                ? `Drafts${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                : t === 'write' ? '✏️ Write'
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}

        {/* ── Drafts ── */}
        {!loading && tab === 'drafts' && (
          <div>
            <div className="flex gap-2 mb-5">
              {['pending', 'approved', 'needs_edit', 'rejected', 'all'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    statusFilter === s
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            {filteredDrafts.length === 0
              ? <p className="text-sm text-gray-400">No drafts with status "{statusFilter}".</p>
              : <div className="space-y-4">
                  {filteredDrafts.map(d => <DraftCard key={d.id} draft={d} onAction={loadDrafts} />)}
                </div>
            }
          </div>
        )}

        {/* ── Write ── */}
        {!loading && tab === 'write' && (
          <div>
            <p className="text-sm text-gray-500 mb-5">
              Write a post manually — updates, wishes, announcements. It goes straight to Drafts for approval, no AI generation.
            </p>
            <ComposeForm onSubmitted={() => { loadDrafts(); setTab('drafts') }} />
          </div>
        )}

        {/* ── Calendar ── */}
        {!loading && tab === 'calendar' && (
          <div>
            {/* View toggle */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">
                {scheduledDrafts.length} post{scheduledDrafts.length !== 1 ? 's' : ''} scheduled
              </p>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setCalView('grid')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    calView === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  Grid
                </button>
                <button onClick={() => setCalView('list')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    calView === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  List
                </button>
              </div>
            </div>

            {calView === 'grid'
              ? <CalendarGrid drafts={scheduledDrafts} onAction={loadDrafts} />
              : <CalendarList drafts={scheduledDrafts} onAction={loadDrafts} />
            }
          </div>
        )}

        {/* ── Research ── */}
        {!loading && tab === 'research' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-4">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} from last research run
            </h2>
            {candidates.length === 0
              ? <p className="text-sm text-gray-400">
                  No research candidates yet. Run{' '}
                  <code className="bg-gray-100 px-1 rounded">python run.py --auto</code> first.
                </p>
              : <div className="space-y-3">
                  {candidates.map((c, i) => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.title}</p>
                            {c.summary && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.summary}</p>}
                            {c.score_reason && <p className="text-xs text-gray-400 mt-1 italic">{c.score_reason}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs font-bold text-gray-700">{c.score.toFixed(1)}</span>
                          <span className="text-xs text-gray-400">{c.source}</span>
                          {c.selected && <span className="text-xs text-green-600 font-medium">✓ selected</span>}
                          {c.source_url && (
                            <a href={c.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline">link ↗</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </main>
    </div>
  )
}
