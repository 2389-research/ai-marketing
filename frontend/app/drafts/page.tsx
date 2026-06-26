'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Draft } from '@/lib/supabase'

// ── platform character limits ─────────────────────────────────────────────────

const CHAR_LIMITS: Record<string, number> = {
  linkedin:  3000,
  instagram: 2200,
  x:          280,
  tiktok:    2200,
}

function CharCounter({ text, channel }: { text: string; channel: string }) {
  const limit = CHAR_LIMITS[channel]
  if (!limit) return null
  const len  = text.length
  const over = len > limit
  const warn = len / limit > 0.85
  return (
    <span className={`font-mono text-xs ${
      over ? 'font-semibold text-[#DC2626]' : warn ? 'text-[#F59E0B]' : 'text-[#BBBBBB]'
    }`}>
      {over
        ? `[!] ${len.toLocaleString()} / ${limit.toLocaleString()} — over limit`
        : `${len.toLocaleString()} / ${limit.toLocaleString()}`}
    </span>
  )
}

// ── channel color map ─────────────────────────────────────────────────────────

const CH_COLOR: Record<string, { dot: string; bg: string; text: string }> = {
  linkedin:  { dot: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  instagram: { dot: '#EC4899', bg: '#FDF2F8', text: '#BE185D' },
  email:     { dot: '#F59E0B', bg: '#FFFBEB', text: '#B45309' },
  tiktok:    { dot: '#14B8A6', bg: '#F0FDFA', text: '#0F766E' },
  youtube:   { dot: '#EF4444', bg: '#FEF2F2', text: '#B91C1C' },
  x:         { dot: '#8B5CF6', bg: '#F5F3FF', text: '#6D28D9' },
}

// ── status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:    { label: 'In review',  bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
  approved:   { label: 'Approved',   bg: '#ECFDF5', text: '#065F46', dot: '#10B981' },
  needs_edit: { label: 'Revise',     bg: '#FFF7ED', text: '#9A3412', dot: '#F97316' },
  rejected:   { label: 'Rejected',   bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status]
  if (!s) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const FILTERS = [
  { key: 'pending',    label: 'Pending'    },
  { key: 'needs_edit', label: 'Needs edit' },
  { key: 'approved',   label: 'Approved'   },
  { key: 'rejected',   label: 'Rejected'   },
  { key: 'all',        label: 'All'        },
] as const

// ── draft card ────────────────────────────────────────────────────────────────

// ── date helpers ──────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── draft card ────────────────────────────────────────────────────────────────

function DraftCard({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [loading, setLoading]           = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr, setRegenErr]         = useState('')
  const [expanded, setExpanded]         = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [feedback, setFeedback]         = useState('')
  const [actionDone, setActionDone]     = useState('')
  const [editingDate, setEditingDate]   = useState(false)
  const [dateVal, setDateVal]           = useState(draft.scheduled_for ? toDatetimeLocal(draft.scheduled_for) : '')
  const [dateSaved, setDateSaved]       = useState(false)
  const [media, setMedia]               = useState<string[]>(draft.media ?? [])
  const [uploading, setUploading]       = useState(false)
  const [uploadErr, setUploadErr]       = useState('')

  const act = async (endpoint: string, body?: object) => {
    setLoading(true)
    const res = await fetch(`/api/drafts/${draft.id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    setLoading(false)
    if (res.ok) {
      if (endpoint === 'approve')    setActionDone('Approved')
      if (endpoint === 'reject')     setActionDone('Rejected')
      if (endpoint === 'needs-edit') setActionDone('Sent for edit')
      setTimeout(onAction, 700)
    }
  }

  const regenerate = async (overrideFeedback?: string) => {
    setRegenerating(true)
    setRegenErr('')
    setShowEdit(false)
    const res = await fetch(`/api/drafts/${draft.id}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: overrideFeedback ?? '' }),
    })
    setRegenerating(false)
    if (res.ok) {
      onAction()
    } else {
      const j = await res.json().catch(() => ({}))
      setRegenErr(j.error ?? 'Regeneration failed — check backend logs')
    }
  }

  const saveDate = async () => {
    if (!dateVal) return
    setEditingDate(false)
    await fetch(`/api/drafts/${draft.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_for: new Date(dateVal).toISOString() }),
    })
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
    onAction()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadErr('')
    const newUrls: string[] = []
    for (const file of files) {
      const path = `${draft.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error } = await supabase.storage.from('draft-media').upload(path, file)
      if (error) { setUploadErr('Upload failed — make sure the draft-media bucket exists in Supabase Storage'); continue }
      const { data: urlData } = supabase.storage.from('draft-media').getPublicUrl(path)
      newUrls.push(urlData.publicUrl)
    }
    const updated = [...media, ...newUrls]
    setMedia(updated)
    await supabase.from('generated_drafts').update({ media: updated }).eq('id', draft.id)
    setUploading(false)
    e.target.value = ''
  }

  const removeMedia = async (url: string) => {
    const updated = media.filter(u => u !== url)
    setMedia(updated)
    await supabase.from('generated_drafts').update({ media: updated }).eq('id', draft.id)
    const path = url.split('/draft-media/')[1]
    if (path) await supabase.storage.from('draft-media').remove([decodeURIComponent(path)])
  }

  const isActionable = draft.status === 'pending' || draft.status === 'needs_edit'

  return (
    <div className={`bg-white border border-[#E5E7EB] rounded-xl shadow-sm transition-all duration-300 ${
      actionDone ? 'opacity-30 scale-[0.99]' : ''
    }`}>
      {/* top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#F3F4F6]">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#F3F4F6',
              color: CH_COLOR[draft.channel]?.text ?? '#6B7280',
            }}>
            {draft.channel}
          </span>
          <span className="text-[#CCCCCC] select-none">·</span>
          <StatusPill status={draft.status} />
          {draft.qa_passed === true  && <span className="font-mono text-xs text-[#888880]">QA ✓</span>}
          {draft.qa_passed === false && <span className="font-mono text-xs text-[#888880]">QA ✗</span>}
        </div>
        <span className="font-mono text-xs text-[#BBBBBB]">{fmtTime(draft.created_at)}</span>
      </div>

      {/* content — click anywhere to expand/collapse */}
      <div
        className="px-5 pt-4 pb-4 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-base font-semibold text-[#111111] leading-snug">{draft.topic}</p>
          <span className="font-mono text-xs text-[#BBBBBB] shrink-0 mt-0.5">
            {expanded ? '↑ collapse' : '↓ expand'}
          </span>
        </div>
        <p className="text-sm text-[#555555] whitespace-pre-wrap leading-relaxed">
          {expanded ? draft.draft_text : draft.draft_text.slice(0, 280) + (draft.draft_text.length > 280 ? '…' : '')}
        </p>
        {expanded && (
          <div className="mt-2">
            <CharCounter text={draft.draft_text} channel={draft.channel} />
          </div>
        )}
      </div>

      {/* QA issues */}
      {draft.qa_issues && draft.qa_issues.length > 0 && (
        <div className="mx-5 mb-3 border border-[#E5E7EB] rounded-lg px-4 py-2.5">
          <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-1.5">QA issues</p>
          {draft.qa_issues.map((issue, i) => (
            <p key={i} className="text-xs text-[#555555]">— {issue}</p>
          ))}
        </div>
      )}

      {/* media */}
      <div className="px-5 pb-4 border-t border-[#F3F4F6] pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-[#888880] uppercase tracking-widest">
            Media{media.length > 0 ? ` · ${media.length} file${media.length !== 1 ? 's' : ''}` : ''}
          </span>
          <label className={`cursor-pointer font-mono text-xs transition-colors ${uploading ? 'text-[#BBBBBB]' : 'text-[#888880] hover:text-[#111111]'}`}>
            {uploading ? 'Uploading…' : '+ Add photo / video'}
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        {uploadErr && <p className="font-mono text-xs text-[#888880] mb-2">{uploadErr}</p>}
        {media.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {media.map((url, i) => (
              <div key={i} className="relative group w-20 h-20 shrink-0">
                {/\.(mp4|mov|webm|avi)$/i.test(url) ? (
                  <div className="w-full h-full bg-[#F3F4F6] flex flex-col items-center justify-center gap-1">
                    <span className="font-mono text-[10px] text-[#888880]">VIDEO</span>
                    <span className="font-mono text-[9px] text-[#BBBBBB] px-1 truncate w-full text-center">
                      {decodeURIComponent(url.split('/').pop() ?? '').slice(0, 12)}
                    </span>
                  </div>
                ) : (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removeMedia(url)}
                  className="absolute top-0 right-0 bg-black/70 text-white text-[10px] w-5 h-5 hidden group-hover:flex items-center justify-center leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-xs text-[#CCCCCC]">No media attached — add photos or videos to pair with this post</p>
        )}
      </div>

      {/* scheduled date — click to edit */}
      {draft.scheduled_for && (
        <div className="px-5 pb-3">
          {editingDate ? (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={dateVal}
                onChange={e => setDateVal(e.target.value)}
                className="font-mono text-xs border border-[#E5E7EB] px-2 py-1 focus:outline-none focus:border-[#7C3AED] bg-white rounded-lg"
                autoFocus
              />
              <button
                onClick={saveDate}
                className="font-mono text-xs text-[#7C3AED] font-semibold hover:text-[#6D28D9] transition-colors">
                Save
              </button>
              <button
                onClick={() => { setEditingDate(false); setDateVal(toDatetimeLocal(draft.scheduled_for!)) }}
                className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="flex items-center gap-1.5 group"
              title="Click to change date">
              <span className="font-mono text-xs text-[#BBBBBB] group-hover:text-[#111111] transition-colors">
                {dateSaved ? '✓ Saved' : `Scheduled ${fmtTime(draft.scheduled_for)}`}
              </span>
              <span className="font-mono text-xs text-[#E5E7EB] group-hover:text-[#888880] transition-colors">✎</span>
            </button>
          )}
        </div>
      )}

      {/* actions */}
      {isActionable && !actionDone && (
        <div className="border-t border-[#F3F4F6] px-5 py-3 flex flex-wrap gap-2">
          <button
            onClick={() => act('approve')}
            disabled={loading || regenerating}
            className="px-4 py-1.5 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg disabled:opacity-40 transition-colors">
            Approve
          </button>
          {draft.status === 'needs_edit' ? (
            <button
              onClick={() => regenerate()}
              disabled={loading || regenerating}
              className="px-4 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#555555] hover:border-[#7C3AED] hover:text-[#111111] disabled:opacity-40 transition-colors">
              {regenerating ? 'Rewriting…' : 'Regenerate'}
            </button>
          ) : (
            <button
              onClick={() => setShowEdit(e => !e)}
              disabled={loading || regenerating}
              className="px-4 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#555555] hover:border-[#7C3AED] hover:text-[#111111] disabled:opacity-40 transition-colors">
              Request edit
            </button>
          )}
          <button
            onClick={() => act('reject')}
            disabled={loading || regenerating}
            className="px-4 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#888880] hover:border-[#7C3AED] hover:text-[#111111] disabled:opacity-40 transition-colors">
            Reject
          </button>
        </div>
      )}

      {regenErr && (
        <div className="border-t border-[#F3F4F6] px-5 py-3">
          <p className="font-mono text-xs text-[#888880]">{regenErr}</p>
        </div>
      )}

      {actionDone && (
        <div className="border-t border-[#F3F4F6] px-5 py-3">
          <p className="font-mono text-xs text-[#888880]">{actionDone}</p>
        </div>
      )}

      {showEdit && !actionDone && (
        <div className="border-t border-[#E5E7EB] px-5 py-4 bg-[#F9FAFB]">
          <p className="text-sm font-semibold text-[#111111] mb-2">What needs to change?</p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Be specific — the AI will apply these changes immediately."
            rows={3}
            className="w-full text-sm border border-[#E5E7EB] px-3 py-2 resize-none focus:outline-none focus:border-[#7C3AED] bg-white leading-relaxed rounded-lg"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => regenerate(feedback)}
              disabled={!feedback.trim() || regenerating}
              className="px-4 py-1.5 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg disabled:opacity-40 transition-colors">
              {regenerating ? 'Rewriting…' : 'Regenerate now'}
            </button>
            <button
              onClick={() => { act('needs-edit', { feedback }); setShowEdit(false) }}
              disabled={!feedback.trim() || loading}
              className="px-4 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#555555] hover:border-[#7C3AED] hover:text-[#111111] disabled:opacity-40 transition-colors">
              Save for manual edit
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="px-4 py-1.5 text-sm text-[#888880] hover:text-[#111111] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-[#111111] mb-1">
        No {filter === 'all' ? '' : filter.replace('_', ' ')} drafts
      </p>
      <p className="text-sm text-[#888880]">
        {filter === 'pending'
          ? 'Run the Generate pipeline to create new drafts.'
          : 'Nothing here yet.'}
      </p>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DraftsPage() {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>('pending')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('generated_drafts')
      .select('*')
      .order('created_at', { ascending: false })
    setDrafts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === 'all'
      ? drafts.length
      : drafts.filter(d => d.status === f.key).length
    return acc
  }, {})

  const visible = filter === 'all' ? drafts : drafts.filter(d => d.status === filter)

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-8 lg:py-10 max-w-2xl w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Drafts</h1>
          <p className="text-base text-[#888880] mt-1.5">Review and approve generated content</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="font-mono text-xs text-[#BBBBBB] hover:text-[#111111] transition-colors">
          ↻
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-0 border-b border-[#E5E7EB] mb-8">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              filter === f.key
                ? 'border-[#7C3AED] text-[#7C3AED] font-semibold'
                : 'border-transparent text-[#888880] hover:text-[#111111]'
            }`}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`font-mono text-xs ${
                filter === f.key ? 'text-[#7C3AED]' : 'text-[#BBBBBB]'
              }`}>{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-4">
          {visible.map(d => (
            <DraftCard key={d.id} draft={d} onAction={load} />
          ))}
        </div>
      )}

    </div>
  )
}
