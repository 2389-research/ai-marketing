'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Draft } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import { CHANNELS, CH_COLOR } from '@/lib/channels'
import { fmtScheduleTime } from '@/lib/timezone'
import PhotoPickerModal from '@/components/PhotoPickerModal'
import Lightbox from '@/components/Lightbox'
import StartOverModal from '@/components/StartOverModal'

interface PhotoMatch {
  id: string
  filename: string
  display_url: string | null
  public_url: string
  reason: string
}

// read ?filter= from URL on first render (no Suspense wrapper needed)
function getInitialFilter(): string {
  if (typeof window === 'undefined') return 'pending'
  const f = new URLSearchParams(window.location.search).get('filter') ?? 'pending'
  return ['pending', 'needs_edit', 'approved', 'rejected', 'all'].includes(f) ? f : 'pending'
}

// read ?channel= from URL on first render
function getInitialChannel(): string {
  if (typeof window === 'undefined') return 'all'
  const c = new URLSearchParams(window.location.search).get('channel') ?? 'all'
  return c === 'all' || CHANNELS.some(ch => ch.id === c) ? c : 'all'
}

const CHANNEL_FILTERS = [{ id: 'all', label: 'All' }, ...CHANNELS]

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
    <span className={`text-xs ${
      over ? 'font-semibold text-[#DC2626]' : warn ? 'text-[#F59E0B]' : 'text-[#9a9a9a]'
    }`}>
      {over
        ? `[!] ${len.toLocaleString()} / ${limit.toLocaleString()} — over limit`
        : `${len.toLocaleString()} / ${limit.toLocaleString()}`}
    </span>
  )
}

// ── status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:    { label: 'In review',  bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
  approved:   { label: 'Approved',   bg: '#ECFDF5', text: '#065F46', dot: '#22c55e' },
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

// Display all times in the scheduling timezone (see lib/timezone.ts) so the
// wall-clock hour a user sees matches the optimal slot the scheduler picked,
// regardless of the viewer's browser timezone.
function fmtTime(iso: string | null) {
  return fmtScheduleTime(iso)
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

function DraftCard({ draft, onAction, selectable, selected, onToggleSelect }: {
  draft: Draft; onAction: () => void
  selectable?: boolean; selected?: boolean; onToggleSelect?: () => void
}) {
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
  const [matching, setMatching]         = useState(false)
  const [matches, setMatches]           = useState<PhotoMatch[]>([])
  const [matchErr, setMatchErr]         = useState('')
  const [showPicker, setShowPicker]     = useState(false)
  const [marking, setMarking]           = useState(false)
  const [markErr, setMarkErr]           = useState('')
  const [likesVal, setLikesVal]         = useState('')
  const [commentsVal, setCommentsVal]   = useState('')
  const [lightboxUrl, setLightboxUrl]   = useState<string | null>(null)

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

  const fixQaIssues = () => {
    const issues = (draft.qa_issues ?? [])
      .map(i => `- ${i.replace(/^\[WARNING\]\s*/, '')}`)
      .join('\n')
    regenerate(issues)
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
    const pid = await resolveActiveProjectClient()
    const newUrls: string[] = []
    for (const file of files) {
      const path = `${pid ? `${pid}/` : ''}${draft.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
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

  const findMatchingPhoto = async () => {
    setMatching(true)
    setMatches([])
    setMatchErr('')
    try {
      const res = await fetch('/api/photos/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: draft.draft_text, topic: draft.topic }),
      })
      const j = await res.json()
      if (!res.ok) { setMatchErr(j.error ?? 'Matching failed'); return }
      const found: PhotoMatch[] = j.matches ?? []
      if (found.length === 0) setMatchErr('No photos in the library fit this post. Upload some, or pick manually.')
      setMatches(found)
    } catch {
      setMatchErr('Matching failed — try again')
    } finally {
      setMatching(false)
    }
  }

  const attachUrl = async (url: string) => {
    if (media.includes(url)) return
    const updated = [...media, url]
    setMedia(updated)
    await supabase.from('generated_drafts').update({ media: updated }).eq('id', draft.id)
  }

  const removeMedia = async (url: string) => {
    const updated = media.filter(u => u !== url)
    setMedia(updated)
    await supabase.from('generated_drafts').update({ media: updated }).eq('id', draft.id)
    const path = url.split('/draft-media/')[1]
    if (path) await supabase.storage.from('draft-media').remove([decodeURIComponent(path)])
  }

  const isActionable = draft.status === 'pending' || draft.status === 'needs_edit'

  const markPosted = async () => {
    setMarking(true)
    setMarkErr('')
    const body: { likes?: number; comments?: number } = {}
    if (likesVal.trim())    body.likes    = Number(likesVal)
    if (commentsVal.trim()) body.comments = Number(commentsVal)
    const res = await fetch(`/api/drafts/${draft.id}/mark-posted`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    setMarking(false)
    if (res.ok) {
      onAction()
    } else {
      const j = await res.json().catch(() => ({}))
      setMarkErr(j.error ?? 'Could not save — try again')
    }
  }

  return (
    <div className={`bg-white border border-[#e6e6e6] rounded  transition-all duration-300 ${
      actionDone ? 'opacity-30 scale-[0.99]' : ''
    }`}>
      {/* top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f7f7f7]">
        <div className="flex items-center gap-3">
          {selectable && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              disabled={!!draft.posted_at}
              title={draft.posted_at ? 'Posted drafts can’t be deleted' : 'Select for delete & replace'}
              className="w-4 h-4 accent-[#1800ad] cursor-pointer disabled:opacity-30"
            />
          )}
          <span
            className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#f7f7f7',
              color: CH_COLOR[draft.channel]?.text ?? '#6b6b6b',
            }}>
            {draft.channel}
          </span>
          <span className="text-[#CCCCCC] select-none">·</span>
          <StatusPill status={draft.status} />
          {draft.qa_passed === true  && <span className="text-xs text-[#6b6b6b]">QA ✓</span>}
          {draft.qa_passed === false && <span className="text-xs text-[#6b6b6b]">QA ✗</span>}
        </div>
        <span className="text-xs text-[#9a9a9a]">{fmtTime(draft.created_at)}</span>
      </div>

      {/* content — click anywhere to expand/collapse */}
      <div
        className="px-5 pt-4 pb-4 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-base font-semibold text-[#262626] leading-snug">{draft.topic}</p>
          <span className="text-xs text-[#9a9a9a] shrink-0 mt-0.5">
            {expanded ? '↑ collapse' : '↓ expand'}
          </span>
        </div>
        <p className="text-sm text-[#3c3c3c] whitespace-pre-wrap leading-relaxed">
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
        <div className="mx-5 mb-3 border border-[#e6e6e6] rounded px-4 py-2.5">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <p className="text-xs text-[#6b6b6b] uppercase tracking-widest">QA issues</p>
            <button
              onClick={fixQaIssues}
              disabled={regenerating}
              className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0"
            >
              {regenerating ? 'Fixing…' : '✦ Fix issues'}
            </button>
          </div>
          {draft.qa_issues.map((issue, i) => (
            <p key={i} className="text-xs text-[#3c3c3c]">— {issue}</p>
          ))}
        </div>
      )}

      {/* media */}
      <div className="px-5 pb-4 border-t border-[#f7f7f7] pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#6b6b6b] uppercase tracking-widest">
            Media{media.length > 0 ? ` · ${media.length} file${media.length !== 1 ? 's' : ''}` : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={findMatchingPhoto}
              disabled={matching}
              className={`text-xs transition-colors ${matching ? 'text-[#9a9a9a]' : 'text-[#1800ad] hover:text-[#2f1ac9]'}`}>
              {matching ? 'Matching…' : '✦ Match photo'}
            </button>
            <button
              onClick={() => { window.location.href = `/videos?forDraft=${draft.id}` }}
              title="Open the video studio for this post — edit the prompt, optionally add footage, preview, then attach"
              className="text-xs transition-colors text-[#1800ad] hover:text-[#2f1ac9]">
              ✦ Generate video
            </button>
            <button
              onClick={() => setShowPicker(true)}
              className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
              ▤ Choose from library
            </button>
            <label className={`cursor-pointer text-xs transition-colors ${uploading ? 'text-[#9a9a9a]' : 'text-[#6b6b6b] hover:text-[#262626]'}`}>
              {uploading ? 'Uploading…' : '+ Add photo / video'}
              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>
        {draft.visual_brief && media.length === 0 && (
          <div className="mb-3 border border-[#e6e6e6] rounded bg-[#fafafa] px-3 py-2.5">
            <p className="text-[10px] text-[#6b6b6b] uppercase tracking-widest mb-1">
              💡 Visual idea — no photo yet
            </p>
            <p className="text-xs text-[#3c3c3c] leading-relaxed">{draft.visual_brief}</p>
          </div>
        )}
        {uploadErr && <p className="text-xs text-[#6b6b6b] mb-2">{uploadErr}</p>}
        {matchErr && <p className="text-xs text-[#6b6b6b] mb-2">{matchErr}</p>}
        {matches.length > 0 && (
          <div className="mb-3 border border-[#EDE9FE] rounded bg-[#F5F3FF] p-2.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#1800ad] font-semibold uppercase tracking-widest">
                {matches.length} match{matches.length !== 1 ? 'es' : ''} — the AI looked at each photo
              </p>
              <button onClick={() => setMatches([])} className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">✕</button>
            </div>
            <div className="space-y-2">
              {matches.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 p-1.5 bg-white rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.display_url ?? m.public_url}
                    alt={m.filename}
                    onClick={() => setLightboxUrl(m.display_url ?? m.public_url)}
                    className="w-12 h-12 object-cover rounded shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#1800ad] font-semibold">{i === 0 ? 'Best fit' : `#${i + 1}`}</p>
                    <p className="text-xs text-[#3c3c3c] leading-snug line-clamp-2">{m.reason}</p>
                  </div>
                  <button
                    onClick={() => { attachUrl(m.public_url); setMatches(ms => ms.filter(x => x.id !== m.id)) }}
                    className="text-xs text-[#1800ad] font-semibold hover:text-[#2f1ac9] transition-colors shrink-0">
                    Attach
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {media.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {media.map((url, i) => (
              <div key={i} className="relative group w-20 h-20 shrink-0">
                {/\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(url) ? (
                  <button
                    onClick={() => setLightboxUrl(url)}
                    title="Click to play"
                    className="w-full h-full bg-[#1a2129] flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-[#262e38] transition-colors group/vid">
                    {/* play glyph */}
                    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/90 group-hover/vid:scale-110 transition-transform">
                      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
                      <path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" />
                    </svg>
                    <span className="text-[9px] text-white/60 px-1 truncate w-full text-center">
                      {decodeURIComponent(url.split('/').pop() ?? '').slice(0, 12)}
                    </span>
                  </button>
                ) : (
                  <img
                    src={url}
                    alt=""
                    onClick={() => setLightboxUrl(url)}
                    className="w-full h-full object-cover cursor-zoom-in hover:opacity-80 transition-opacity"
                  />
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
          <p className="text-xs text-[#CCCCCC]">No media attached — add photos or videos to pair with this post</p>
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
                className="text-xs border border-[#e6e6e6] px-2 py-1 focus:outline-none focus:border-[#1800ad] bg-white rounded"
                autoFocus
              />
              <button
                onClick={saveDate}
                className="text-xs text-[#1800ad] font-semibold hover:text-[#2f1ac9] transition-colors">
                Save
              </button>
              <button
                onClick={() => { setEditingDate(false); setDateVal(toDatetimeLocal(draft.scheduled_for!)) }}
                className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="flex items-center gap-1.5 group"
              title="Click to change date">
              <span className="text-xs text-[#9a9a9a] group-hover:text-[#262626] transition-colors">
                {dateSaved ? '✓ Saved' : `Scheduled ${fmtScheduleTime(draft.scheduled_for, { withZone: true })}`}
              </span>
              <span className="text-xs text-[#e6e6e6] group-hover:text-[#6b6b6b] transition-colors">✎</span>
            </button>
          )}
        </div>
      )}

      {/* actions */}
      {isActionable && !actionDone && (
        <div className="border-t border-[#f7f7f7] px-5 py-3 flex flex-wrap gap-2">
          <button
            onClick={() => act('approve')}
            disabled={loading || regenerating}
            className="px-4 py-1.5 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
            Approve
          </button>
          {draft.status === 'needs_edit' ? (
            <button
              onClick={() => regenerate()}
              disabled={loading || regenerating}
              className="px-4 py-1.5 text-sm border border-[#e6e6e6] rounded text-[#3c3c3c] hover:border-[#1800ad] hover:text-[#262626] disabled:opacity-40 transition-colors">
              {regenerating ? 'Rewriting…' : 'Regenerate'}
            </button>
          ) : (
            <button
              onClick={() => setShowEdit(e => !e)}
              disabled={loading || regenerating}
              className="px-4 py-1.5 text-sm border border-[#e6e6e6] rounded text-[#3c3c3c] hover:border-[#1800ad] hover:text-[#262626] disabled:opacity-40 transition-colors">
              Request edit
            </button>
          )}
          <button
            onClick={() => act('reject')}
            disabled={loading || regenerating}
            className="px-4 py-1.5 text-sm border border-[#FCA5A5] rounded text-[#DC2626] hover:bg-[#FEF2F2] hover:border-[#DC2626] disabled:opacity-40 transition-colors">
            Reject
          </button>
        </div>
      )}

      {/* approved — ready to post yourself, no auto-posting is configured */}
      {draft.status === 'approved' && (
        <div className="border-t border-[#f7f7f7] px-5 py-3">
          {draft.posted_at ? (
            <p className="text-xs text-[#22c55e]">
              ✓ Posted {new Date(draft.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-[#9a9a9a]">
                Copy this and post it on {draft.channel} yourself, then:
              </p>
              <input
                type="number" min={0} placeholder="Likes"
                value={likesVal} onChange={e => setLikesVal(e.target.value)}
                className="w-20 text-xs border border-[#e6e6e6] rounded px-2 py-1 focus:outline-none focus:border-[#1800ad]"
              />
              <input
                type="number" min={0} placeholder="Comments"
                value={commentsVal} onChange={e => setCommentsVal(e.target.value)}
                className="w-24 text-xs border border-[#e6e6e6] rounded px-2 py-1 focus:outline-none focus:border-[#1800ad]"
              />
              <button
                onClick={markPosted}
                disabled={marking}
                className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40 transition-colors">
                {marking ? 'Saving…' : 'Mark as posted'}
              </button>
            </div>
          )}
          {markErr && <p className="text-xs text-[#dc2626] mt-1">{markErr}</p>}
        </div>
      )}

      {regenErr && (
        <div className="border-t border-[#f7f7f7] px-5 py-3">
          <p className="text-xs text-[#6b6b6b]">{regenErr}</p>
        </div>
      )}

      {actionDone && (
        <div className="border-t border-[#f7f7f7] px-5 py-3">
          <p className="text-xs text-[#6b6b6b]">{actionDone}</p>
        </div>
      )}

      {showEdit && !actionDone && (
        <div className="border-t border-[#e6e6e6] px-5 py-4 bg-[#f7f7f7]">
          <p className="text-sm font-semibold text-[#262626] mb-2">What needs to change?</p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Be specific — the AI will apply these changes immediately."
            rows={3}
            className="w-full text-sm border border-[#e6e6e6] px-3 py-2 resize-none focus:outline-none focus:border-[#1800ad] bg-white leading-relaxed rounded"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => regenerate(feedback)}
              disabled={!feedback.trim() || regenerating}
              className="px-4 py-1.5 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
              {regenerating ? 'Rewriting…' : 'Regenerate now'}
            </button>
            <button
              onClick={() => { act('needs-edit', { feedback }); setShowEdit(false) }}
              disabled={!feedback.trim() || loading}
              className="px-4 py-1.5 text-sm border border-[#e6e6e6] rounded text-[#3c3c3c] hover:border-[#1800ad] hover:text-[#262626] disabled:opacity-40 transition-colors">
              Save for manual edit
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="px-4 py-1.5 text-sm text-[#6b6b6b] hover:text-[#262626] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <PhotoPickerModal
          attached={media}
          onPick={url => { attachUrl(url); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-[#262626] mb-1">
        No {filter === 'all' ? '' : filter.replace('_', ' ')} drafts
      </p>
      <p className="text-sm text-[#6b6b6b]">
        {filter === 'pending'
          ? 'Run the Generate pipeline to create new drafts.'
          : 'Nothing here yet.'}
      </p>
    </div>
  )
}

// ── drafts grouped by day ─────────────────────────────────────────────────────

function dayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
  if (dateStr === today)     return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function DraftsByDay({ drafts, onAction, selectMode, selectedIds, onToggleSelect }: {
  drafts: Draft[]; onAction: () => void
  selectMode?: boolean; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void
}) {
  // group by created_at date
  const groups: { date: string; items: Draft[] }[] = []
  for (const d of drafts) {
    const date = (d.created_at ?? '').slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.date === date) {
      last.items.push(d)
    } else {
      groups.push({ date, items: [d] })
    }
  }

  return (
    <div className="space-y-8">
      {groups.map(g => (
        <div key={g.date}>
          <p className="text-xs font-semibold text-[#9a9a9a] uppercase tracking-widest mb-3">
            {dayLabel(g.date)}
            <span className="font-normal ml-2">{g.items.length} draft{g.items.length !== 1 ? 's' : ''}</span>
          </p>
          <div className="space-y-3">
            {g.items.map(d => (
              <DraftCard
                key={d.id} draft={d} onAction={onAction}
                selectable={selectMode}
                selected={selectedIds?.has(d.id)}
                onToggleSelect={() => onToggleSelect?.(d.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DraftsPage() {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>(getInitialFilter)
  const [channel, setChannel] = useState<string>(getInitialChannel)

  // start-over / delete-&-replace
  const [selectMode, setSelectMode]   = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<null | { mode: 'startover' | 'replace'; ids: string[] }>(null)
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const unpostedCount = drafts.filter(d => !d.posted_at).length
  const postedCount   = drafts.length - unpostedCount

  const load = useCallback(async () => {
    const pid = await resolveActiveProjectClient()
    const { data } = await scoped(supabase.from('generated_drafts').select('*'), pid)
      .order('created_at', { ascending: false })
    setDrafts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // status counts — computed within the currently selected channel
  const byChannel = channel === 'all' ? drafts : drafts.filter(d => d.channel === channel)
  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === 'all'
      ? byChannel.length
      : byChannel.filter(d => d.status === f.key).length
    return acc
  }, {})

  // channel counts — computed within the currently selected status
  const byStatus = filter === 'all' ? drafts : drafts.filter(d => d.status === filter)
  const channelCounts = CHANNEL_FILTERS.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = c.id === 'all'
      ? byStatus.length
      : byStatus.filter(d => d.channel === c.id).length
    return acc
  }, {})

  const visible = drafts.filter(d =>
    (filter === 'all' || d.status === filter) && (channel === 'all' || d.channel === channel)
  )

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-6xl w-full mx-auto">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#e6e6e6]">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Drafts</h1>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">Review and approve generated content</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()) }}
            className={`text-xs transition-colors ${selectMode ? 'text-[#1800ad] font-semibold' : 'text-[#6b6b6b] hover:text-[#262626]'}`}>
            {selectMode ? 'Done selecting' : 'Select'}
          </button>
          <button
            onClick={() => setModal({ mode: 'startover', ids: [] })}
            title="Delete all unposted drafts (if any) and generate a fresh batch with your current rules"
            className="text-xs text-[#DC2626] hover:text-[#B91C1C] transition-colors">
            ⟲ Start over
          </button>
          <button
            onClick={() => { setLoading(true); load() }}
            className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">
            ↻
          </button>
        </div>
      </div>

      {/* status filter tabs */}
      <div className="flex gap-0 border-b border-[#e6e6e6] mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              filter === f.key
                ? 'border-[#1800ad] text-[#1800ad] font-semibold'
                : 'border-transparent text-[#6b6b6b] hover:text-[#262626]'
            }`}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`text-xs ${
                filter === f.key ? 'text-[#1800ad]' : 'text-[#9a9a9a]'
              }`}>{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* channel filter tabs — secondary row, filters within the status tab above */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {CHANNEL_FILTERS.map(c => {
          const active = channel === c.id
          const color  = c.id === 'all' ? null : CH_COLOR[c.id]
          return (
            <button
              key={c.id}
              onClick={() => setChannel(c.id)}
              style={active && color ? { backgroundColor: color.bg, color: color.text } : {}}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                active
                  ? color ? 'border-transparent font-semibold' : 'border-[#262626] bg-[#262626] text-white font-semibold'
                  : 'border-[#e6e6e6] text-[#6b6b6b] hover:border-[#9a9a9a] hover:text-[#262626]'
              }`}>
              {c.label}{channelCounts[c.id] > 0 ? ` · ${channelCounts[c.id]}` : ''}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-xs text-[#9a9a9a]">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <DraftsByDay
          drafts={visible} onAction={load}
          selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
        />
      )}

      {/* selection action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#262626] text-white rounded-full shadow-lg px-5 py-2.5 flex items-center gap-4">
          <span className="text-sm">{selectedIds.size} selected</span>
          <button
            onClick={() => setModal({ mode: 'replace', ids: Array.from(selectedIds) })}
            className="text-sm font-semibold text-white hover:text-[#8ab6f5] transition-colors">
            ✦ Delete & replace
          </button>
          <button
            onClick={async () => {
              await fetch('/api/drafts/bulk-delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
              })
              setSelectedIds(new Set()); setSelectMode(false); load()
            }}
            className="text-sm text-[#f87171] hover:text-[#fca5a5] transition-colors">
            Delete only
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-[#9a9a9a] hover:text-white transition-colors">
            Clear
          </button>
        </div>
      )}

      {modal && (
        <StartOverModal
          mode={modal.mode}
          ids={modal.ids}
          unpostedCount={unpostedCount}
          postedCount={postedCount}
          onClose={() => setModal(null)}
          onDone={() => { setSelectedIds(new Set()); setSelectMode(false); setLoading(true); load() }}
        />
      )}

    </div>
  )
}
