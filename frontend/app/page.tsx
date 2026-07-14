'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type Draft } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import { CHANNELS as CH_OPTS, CH_COLOR } from '@/lib/channels'
import ChannelCard from '@/components/ChannelCard'
import ChannelIcon from '@/components/ChannelIcon'
import PostEditModal from '@/components/PostEditModal'
import DayDetailModal from '@/components/DayDetailModal'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// ── helpers ───────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(iso: string) {
  return iso.slice(0, 10)
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

function fmtDayLabel(key: string) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
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
    <div className="mt-5 pt-5 border-t border-[#E4E9F2]">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-[#64748B] uppercase tracking-widest">New post</p>
        <button onClick={onCancel} className="text-[#94A3B8] hover:text-[#1A2130] text-base leading-none transition-colors">×</button>
      </div>

      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Title or topic"
        className="w-full text-sm border border-[#E4E9F2] px-3 py-2 mb-3 focus:outline-none focus:border-[#3B5BFF] bg-white rounded-xl"
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {CH_OPTS.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={`px-2.5 py-1 font-mono text-xs border transition-colors rounded-xl ${
              channel === c.id
                ? 'border-[#3B5BFF] bg-[#3B5BFF] text-white'
                : 'border-[#E4E9F2] text-[#64748B] hover:border-[#3B5BFF] hover:text-[#1A2130]'
            }`}>
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="font-mono text-xs text-[#64748B] uppercase tracking-widest shrink-0">Time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="font-mono text-sm border border-[#E4E9F2] px-3 py-1.5 focus:outline-none focus:border-[#3B5BFF] bg-white rounded-xl"
        />
      </div>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your post here…"
        rows={5}
        className="w-full text-sm border border-[#E4E9F2] px-3 py-2 mb-3 resize-none focus:outline-none focus:border-[#3B5BFF] bg-white leading-relaxed rounded-xl"
      />

      {error && <p className="font-mono text-xs text-[#64748B] mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 bg-[#3B5BFF] text-white text-xs font-semibold hover:bg-[#2F44D9] disabled:opacity-50 transition-colors rounded-xl">
          {saving ? 'Saving…' : 'Add to calendar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 text-xs text-[#64748B] hover:text-[#1A2130] border border-[#E4E9F2] hover:border-[#3B5BFF] transition-colors rounded-xl">
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
    <div className="bg-white rounded-2xl border border-[#E4E9F2] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-widest">WHAT'S LEFT</p>
          <p className="font-mono text-xs text-[#94A3B8] mt-0.5">{doneCount}/{tasks.length} done</p>
        </div>
        <Link href="/guide" className="font-mono text-xs text-[#3B5BFF] hover:text-[#2F44D9] transition-colors">
          How it works →
        </Link>
      </div>

      {/* progress bar */}
      <div className="h-1 bg-[#EEF1F4] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-[#3B5BFF] rounded-full transition-all duration-500"
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
                ? 'border-[#0EA5A0] bg-[#0EA5A0]'
                : 'border-[#E4E9F2] group-hover:border-[#3B5BFF]'
            }`}>
              {t.done && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <polyline points="1,4 3,6 7,2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-snug ${t.done ? 'line-through text-[#94A3B8]' : 'text-[#1A2130] group-hover:text-[#3B5BFF]'} transition-colors`}>
                {t.label}
              </p>
              {!t.done && <p className="font-mono text-xs text-[#94A3B8] mt-0.5">{t.sub}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── calendar ──────────────────────────────────────────────────────────────────

// draggable post chip — click opens the edit modal, drag reschedules it
function PostChip({ draft, onOpen }: { draft: Draft; onOpen: (d: Draft) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draft.id,
    data: { draft },
  })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={e => { e.stopPropagation(); onOpen(draft) }}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        borderLeftColor: CH_COLOR[draft.channel]?.dot ?? '#64748B',
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="w-full text-left px-1.5 py-1 mb-1 border-l-2 bg-[#F8FAFC] hover:bg-[#EEF1F4] rounded-sm cursor-grab active:cursor-grabbing transition-colors"
    >
      <p className="font-mono text-[9px] leading-none text-[#94A3B8] mb-0.5">{fmtTime(draft.scheduled_for!)}</p>
      <p className="text-[11px] leading-tight text-[#1A2130] truncate">{draft.topic}</p>
    </button>
  )
}

// droppable day cell
function DayCell({
  dayKey, day, isToday, isSelected, isPast, posts, onDayClick, onChipOpen, onShowAll,
}: {
  dayKey: string
  day: number
  isToday: boolean
  isSelected: boolean
  isPast: boolean
  posts: Draft[]
  onDayClick: (key: string) => void
  onChipOpen: (d: Draft) => void
  onShowAll: (key: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  const shown = posts.slice(0, 4)
  const overflow = posts.length - shown.length

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick(dayKey)}
      className={`flex flex-col items-stretch min-h-[92px] p-1 cursor-pointer transition-colors ${
        isOver ? 'bg-[#EEF1FF]' : isSelected ? 'bg-[#EEF1FF]' : isPast ? 'bg-white' : 'bg-white hover:bg-[#F8FAFC]'
      }`}
    >
      <div className="flex items-center justify-center mb-1">
        {isToday ? (
          <span className="w-5 h-5 rounded-full bg-[#3B5BFF] text-white flex items-center justify-center text-[11px] font-medium">{day}</span>
        ) : (
          <span className={`text-xs leading-none ${isPast ? 'text-[#B4BECC]' : 'text-[#1A2130]'}`}>{day}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {shown.map(d => <PostChip key={d.id} draft={d} onOpen={onChipOpen} />)}
        {overflow > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onShowAll(dayKey) }}
            className="w-full font-mono text-[9px] text-[#3B5BFF] hover:text-[#2F44D9] text-center transition-colors">
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  )
}

function DashboardCalendar({ drafts, onPostCreated }: { drafts: Draft[]; onPostCreated: () => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selected,    setSelected]    = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [openDraft,   setOpenDraft]   = useState<Draft | null>(null)
  const [dayDetail,   setDayDetail]   = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const draft = active.data.current?.draft as Draft | undefined
    if (!draft || !draft.scheduled_for) return
    const newDayKey = over.id as string
    if (newDayKey === dateKey(draft.scheduled_for)) return // dropped on the same day
    const time = draft.scheduled_for.slice(11, 19) // keep existing time-of-day
    await supabase.from('generated_drafts').update({ scheduled_for: `${newDayKey}T${time}` }).eq('id', draft.id)
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

  const handleDayClick = (key: string) => {
    if (selected === key) {
      setSelected(null)
      setShowCreate(false)
    } else {
      setSelected(key)
      setShowCreate(true)
    }
  }

  return (
    <div>
      {/* month nav */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[#1A2130]">{monthLabel}</h2>
        <div className="flex gap-0">
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-7 h-7 flex items-center justify-center text-[#64748B] hover:text-[#1A2130] hover:bg-[#EEF1F4] transition-colors rounded-xl">
            ‹
          </button>
          <button
            onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelected(null); setShowCreate(false) }}
            className="w-7 h-7 flex items-center justify-center text-[#64748B] hover:text-[#1A2130] hover:bg-[#EEF1F4] transition-colors rounded-xl">
            ›
          </button>
        </div>
      </div>

      {/* day headers */}
      <div className="grid grid-cols-7 pb-2 border-b border-[#E4E9F2] mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <p key={i} className="text-[11px] text-[#94A3B8] text-center tracking-wide">{d}</p>
        ))}
      </div>

      {/* grid — drag a chip to reschedule its day, click a chip to edit */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-7 gap-px bg-[#EEF1F4]">
          {cells.map((key, i) => {
            if (!key) return <div key={i} />
            const day = parseInt(key.slice(8))
            return (
              <DayCell
                key={key}
                dayKey={key}
                day={day}
                isToday={key === today}
                isSelected={selected === key}
                isPast={key < today}
                posts={postsByDate[key] ?? []}
                onDayClick={handleDayClick}
                onChipOpen={setOpenDraft}
                onShowAll={setDayDetail}
              />
            )
          })}
        </div>
      </DndContext>

      {/* create-post panel for the selected day */}
      {selected && showCreate && (
        <div className="mt-5 pt-5 border-t border-[#E4E9F2]">
          <CreatePostForm
            dateKey={selected}
            onSaved={() => { setShowCreate(false); setSelected(null); onPostCreated() }}
            onCancel={() => { setShowCreate(false); setSelected(null) }}
          />
        </div>
      )}

      {openDraft && (
        <PostEditModal
          draft={openDraft}
          onClose={() => setOpenDraft(null)}
          onSaved={onPostCreated}
        />
      )}

      {dayDetail && (
        <DayDetailModal
          dateLabel={fmtDayLabel(dayDetail)}
          posts={postsByDate[dayDetail] ?? []}
          onClose={() => setDayDetail(null)}
          onOpenDraft={setOpenDraft}
        />
      )}
    </div>
  )
}

// ── upcoming row ──────────────────────────────────────────────────────────────

function UpcomingRow({ draft }: { draft: Draft }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-[#EEF1F4] last:border-0">
      <div
        className="flex items-center gap-2 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xs text-[#94A3B8] shrink-0 w-12">
          {fmtShortDate(draft.scheduled_for!)}
        </span>
        <span
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#EEF1F4' }}
        >
          <ChannelIcon channel={draft.channel} className="w-3 h-3" />
        </span>
        <p className="text-sm text-[#1A2130] flex-1 truncate leading-snug">{draft.topic}</p>
        <span className="text-[10px] text-[#B4BECC] shrink-0 select-none">
          {expanded ? '↑' : '↓'}
        </span>
      </div>
      {expanded && (
        <p className="text-xs text-[#64748B] leading-relaxed pb-2.5 pl-14 line-clamp-4">
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
    const pid = await resolveActiveProjectClient()
    const [draftsRes, researchRes, brandRes, photoRes] = await Promise.all([
      scoped(supabase.from('generated_drafts').select('*'), pid).order('created_at', { ascending: false }),
      scoped(supabase.from('research_candidates').select('id', { count: 'exact', head: true }), pid),
      scoped(supabase.from('brand_profile').select('company_name, strategy, strategy_updated_at, posting_cadence'), pid).limit(1).maybeSingle(),
      scoped(supabase.from('photo_library').select('id', { count: 'exact', head: true }), pid),
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

  const pendingByChannel = useMemo(() => {
    const map: Record<string, number> = {}
    drafts.forEach(d => {
      if (d.status === 'pending' || d.status === 'needs_edit') {
        map[d.channel] = (map[d.channel] ?? 0) + 1
      }
    })
    return map
  }, [drafts])

  const approvedByChannel = useMemo(() => {
    const map: Record<string, number> = {}
    drafts.forEach(d => {
      if (d.status === 'approved') map[d.channel] = (map[d.channel] ?? 0) + 1
    })
    return map
  }, [drafts])

  // channels with any activity at all — cadence target, pending/approved drafts, or posts this week
  const activeChannels = useMemo(
    () => CH_OPTS.filter(ch =>
      (cadence[ch.id] ?? 0) > 0 ||
      (pendingByChannel[ch.id] ?? 0) > 0 ||
      (approvedByChannel[ch.id] ?? 0) > 0 ||
      (weekByChannel[ch.id] ?? 0) > 0
    ),
    [cadence, pendingByChannel, approvedByChannel, weekByChannel]
  )

  const doReset = async () => {
    setResetting(true)
    const res = await fetch('/api/reset', { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setResetting(false)
    setResetStep(0)
    if (res.ok) {
      window.location.reload()
    } else {
      const errs = json.errors?.join(' · ') ?? 'Reset failed'
      setResetMsg(`Error: ${errs}`)
      setTimeout(() => setResetMsg(''), 6000)
      setResetting(false)
    }
  }

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-mono text-xs text-[#94A3B8]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-[1200px] w-full">

      {/* header */}
      <div className="flex items-center justify-between mb-4 lg:mb-5 pb-4 border-b border-[#E4E9F2]">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#1A2130] tracking-tight">Dashboard</h1>
          <p className="font-mono text-[11px] text-[#94A3B8] mt-1.5">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {resetMsg && (
            <p className="text-xs text-[#64748B]">{resetMsg}</p>
          )}
          {resetStep === 0 ? (
            <button
              onClick={() => setResetStep(1)}
              className="text-xs text-[#94A3B8] hover:text-[#D6336C] transition-colors">
              Start over
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748B]">Clear all data?</span>
              <button
                onClick={doReset}
                disabled={resetting}
                className="text-xs font-semibold text-white bg-[#D6336C] hover:bg-[#B0285A] px-3 py-1 rounded-xl disabled:opacity-50 transition-colors">
                {resetting ? 'Clearing…' : 'Yes, clear'}
              </button>
              <button
                onClick={() => setResetStep(0)}
                className="text-xs text-[#94A3B8] hover:text-[#1A2130] transition-colors">
                Cancel
              </button>
            </div>
          )}
          <button
            onClick={() => { setLoading(true); load() }}
            className="font-mono text-sm text-[#94A3B8] hover:text-[#1A2130] transition-colors">
            ↻
          </button>
        </div>
      </div>

      {/* strategy refresh prompt */}
      {!strategyBannerDismissed && strategyAgeDays !== null && strategyAgeDays >= 90 && (
        <div className="mb-5 flex items-center justify-between gap-4 px-4 py-3 bg-[#EEF1FF] border border-[#DBE1FF] rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="text-base">💡</span>
            <div>
              <p className="text-sm font-semibold text-[#2F44D9]">Your brand strategy is {strategyAgeDays} days old</p>
              <p className="text-xs text-[#2F44D9] mt-0.5">Markets change — a quick refresh helps the AI stay aligned with where your brand is heading.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/brand"
              className="px-3 py-1.5 text-xs font-semibold bg-[#3B5BFF] text-white rounded-xl hover:bg-[#2F44D9] transition-colors">
              Refresh strategy
            </Link>
            <button
              onClick={() => setStrategyBannerDismissed(true)}
              className="text-[#3B5BFF] hover:text-[#2F44D9] transition-colors text-lg leading-none px-1">
              ×
            </button>
          </div>
        </div>
      )}

      {/* two-column layout: stacks on mobile */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-5 lg:gap-7 items-start">

        {/* left — calendar */}
        <div className="bg-white rounded-2xl border border-[#E4E9F2] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] p-5 w-full">
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
            <div className="bg-white rounded-2xl border border-[#E4E9F2] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] p-5 w-full">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-widest">THIS WEEK</p>
                <Link href="/brand" className="font-mono text-xs text-[#94A3B8] hover:text-[#3B5BFF] transition-colors">
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
                        <span className={`font-mono text-xs ${overdue ? 'text-[#0EA5A0]' : done === target ? 'text-[#0EA5A0]' : 'text-[#64748B]'}`}>
                          {done}/{target}
                        </span>
                      </div>
                      <div className="h-1 bg-[#EEF1F4] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? '#0EA5A0' : color?.dot ?? '#3B5BFF',
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
          <div className="bg-white rounded-2xl border border-[#E4E9F2] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] p-5 w-full">
            <p className="text-xs font-semibold text-[#64748B] mb-1">COMING UP</p>
            {scheduledDrafts.length > 0 && (
              <p className="font-mono text-sm text-[#64748B] mb-5">
                {scheduledDrafts.length} scheduled{thisWeek > 0 ? ` · ${thisWeek} this week` : ''}
              </p>
            )}
            {upcoming.length === 0 ? (
              <p className="font-mono text-sm text-[#94A3B8]">Nothing scheduled yet.</p>
            ) : (
              <div>
                {upcoming.map(d => <UpcomingRow key={d.id} draft={d} />)}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* per-channel breakdown */}
      {activeChannels.length > 0 && (
        <div className="mt-5 lg:mt-7">
          <p className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-widest mb-3">By channel</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeChannels.map(ch => (
              <ChannelCard
                key={ch.id}
                id={ch.id}
                label={ch.label}
                color={CH_COLOR[ch.id]}
                pending={pendingByChannel[ch.id] ?? 0}
                approved={approvedByChannel[ch.id] ?? 0}
                scheduledThisWeek={weekByChannel[ch.id] ?? 0}
                cadenceTarget={cadence[ch.id]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
