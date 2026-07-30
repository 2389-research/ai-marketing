'use client'

import { useState } from 'react'
import { supabase, type Draft } from '@/lib/supabase'
import { resolveActiveProjectClient } from '@/lib/project'
import { CH_COLOR } from '@/lib/channels'
import ChannelIcon from '@/components/ChannelIcon'
import PhotoPickerModal from '@/components/PhotoPickerModal'
import { logFeedback } from '@/lib/feedback'

interface PhotoMatch {
  id: string
  filename: string
  display_url: string | null
  public_url: string
  reason: string
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function PostEditModal({
  draft, onClose, onSaved,
}: {
  draft: Draft
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText]                 = useState(draft.draft_text)
  const [savingText, setSavingText]     = useState(false)
  const [textSaved, setTextSaved]       = useState(false)

  const [feedback, setFeedback]         = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr, setRegenErr]         = useState('')

  const [media, setMedia]               = useState<string[]>(draft.media ?? [])
  const [uploading, setUploading]       = useState(false)
  const [uploadErr, setUploadErr]       = useState('')
  const [matching, setMatching]         = useState(false)
  const [matches, setMatches]           = useState<PhotoMatch[]>([])
  const [matchErr, setMatchErr]         = useState('')
  const [showPicker, setShowPicker]     = useState(false)

  const [dateVal, setDateVal]           = useState(draft.scheduled_for ? toDatetimeLocal(draft.scheduled_for) : '')
  const [dateSaving, setDateSaving]     = useState(false)
  const [dateSaved, setDateSaved]       = useState(false)

  const [actLoading, setActLoading]     = useState(false)
  const [actionDone, setActionDone]     = useState('')

  const [deleteStep, setDeleteStep]     = useState<0 | 1>(0)
  const [deleting, setDeleting]         = useState(false)
  const [deleteErr, setDeleteErr]       = useState('')

  const [marking, setMarking]           = useState(false)
  const [markErr, setMarkErr]           = useState('')
  const [likesVal, setLikesVal]         = useState('')
  const [commentsVal, setCommentsVal]   = useState('')

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
      onSaved()
      setTimeout(onClose, 700)
    } else {
      const j = await res.json().catch(() => ({}))
      setMarkErr(j.error ?? 'Could not save — try again')
    }
  }

  const saveText = async () => {
    setSavingText(true)
    // Learning capture: a human hand-editing the AI's text is the strongest
    // taste signal there is — store the before/after for the lessons memo.
    if (text.trim() !== draft.draft_text.trim()) {
      logFeedback({
        draft_id: draft.id, event_type: 'edited', channel: draft.channel,
        topic: draft.topic, before_text: draft.draft_text, after_text: text,
      })
    }
    await supabase.from('generated_drafts').update({ draft_text: text }).eq('id', draft.id)
    setSavingText(false)
    setTextSaved(true)
    setTimeout(() => setTextSaved(false), 2000)
  }

  const regenerate = async () => {
    if (!feedback.trim()) return
    logFeedback({
      draft_id: draft.id, event_type: 'edit_requested', channel: draft.channel,
      topic: draft.topic, reason: feedback, before_text: draft.draft_text,
    })
    setRegenerating(true)
    setRegenErr('')
    const res = await fetch(`/api/drafts/${draft.id}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    })
    setRegenerating(false)
    if (res.ok) {
      setFeedback('')
      onSaved()
      onClose()
    } else {
      const j = await res.json().catch(() => ({}))
      setRegenErr(j.error ?? 'Regeneration failed — check backend logs')
    }
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

  const saveDate = async () => {
    if (!dateVal) return
    setDateSaving(true)
    await supabase.from('generated_drafts').update({ scheduled_for: new Date(dateVal).toISOString() }).eq('id', draft.id)
    setDateSaving(false)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
    onSaved()
  }

  const act = async (endpoint: 'approve' | 'reject') => {
    if (endpoint === 'reject') {
      logFeedback({
        draft_id: draft.id, event_type: 'rejected', channel: draft.channel,
        topic: draft.topic, before_text: draft.draft_text,
      })
    }
    setActLoading(true)
    const res = await fetch(`/api/drafts/${draft.id}/${endpoint}`, { method: 'POST' })
    setActLoading(false)
    if (res.ok) {
      setActionDone(endpoint === 'approve' ? 'Approved' : 'Rejected')
      onSaved()
      setTimeout(onClose, 700)
    }
  }

  const deleteDraft = async () => {
    setDeleting(true)
    setDeleteErr('')
    const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      const j = await res.json().catch(() => ({}))
      setDeleteErr(j.error ?? 'Delete failed — try again')
      setDeleteStep(0)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded border border-[#e6e6e6] w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f7f7f7]">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#f7f7f7',
                color: CH_COLOR[draft.channel]?.text ?? '#3c3c3c',
              }}>
              <ChannelIcon channel={draft.channel} className="w-3 h-3" />
              {draft.channel}
            </span>
            <span className="text-xs text-[#3c3c3c] uppercase tracking-widest">{draft.status}</span>
          </div>
          <button onClick={onClose} className="text-[#9a9a9a] hover:text-[#262626] text-lg leading-none transition-colors">×</button>
        </div>

        <div className="px-5 pt-4">
          <p className="text-base font-semibold text-[#262626] leading-snug mb-3">{draft.topic}</p>

          {/* manual text edit */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={7}
            className="w-full text-sm border border-[#e6e6e6] px-3 py-2 resize-none focus:outline-none focus:border-[#1800ad] bg-white leading-relaxed rounded"
          />
          <div className="flex items-center gap-2 mt-1.5 mb-4">
            <button
              onClick={saveText}
              disabled={savingText || text === draft.draft_text}
              className="text-xs text-[#1800ad] font-semibold hover:text-[#2f1ac9] disabled:opacity-40 transition-colors">
              {savingText ? 'Saving…' : textSaved ? '✓ Saved' : 'Save text'}
            </button>
          </div>

          {/* AI rewrite */}
          <div className="mb-4 pt-3 border-t border-[#f7f7f7]">
            <p className="text-xs text-[#3c3c3c] uppercase tracking-widest mb-1.5">Or let AI rewrite it</p>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Describe what to change — the AI will rewrite immediately."
              rows={2}
              className="w-full text-sm border border-[#e6e6e6] px-3 py-2 resize-none focus:outline-none focus:border-[#1800ad] bg-white leading-relaxed rounded"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={regenerate}
                disabled={!feedback.trim() || regenerating}
                className="px-3 py-1.5 text-xs font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
                {regenerating ? 'Rewriting…' : 'Regenerate now'}
              </button>
              {regenErr && <p className="text-xs text-[#3c3c3c]">{regenErr}</p>}
            </div>
          </div>

          {/* media */}
          <div className="pb-4 border-t border-[#f7f7f7] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#3c3c3c] uppercase tracking-widest">
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
                  className="text-xs text-[#3c3c3c] hover:text-[#262626] transition-colors">
                  ▤ Library
                </button>
                <label className={`cursor-pointer text-xs transition-colors ${uploading ? 'text-[#9a9a9a]' : 'text-[#3c3c3c] hover:text-[#262626]'}`}>
                  {uploading ? 'Uploading…' : '+ Add'}
                  <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            </div>
            {uploadErr && <p className="text-xs text-[#3c3c3c] mb-2">{uploadErr}</p>}
            {matchErr && <p className="text-xs text-[#3c3c3c] mb-2">{matchErr}</p>}
            {matches.length > 0 && (
              <div className="mb-3 border border-[#f7f7f7] rounded bg-[#f7f7f7] p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[#1800ad] font-semibold uppercase tracking-widest">
                    {matches.length} match{matches.length !== 1 ? 'es' : ''}
                  </p>
                  <button onClick={() => setMatches([])} className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">✕</button>
                </div>
                <div className="space-y-2">
                  {matches.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 p-1.5 bg-white rounded">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.display_url ?? m.public_url} alt={m.filename} className="w-12 h-12 object-cover rounded shrink-0" />
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
                    {/\.(mp4|mov|webm|avi)$/i.test(url) ? (
                      <button
                        onClick={() => window.open(url, '_blank', 'noopener')}
                        title="Open video"
                        className="w-full h-full bg-black/80 rounded flex flex-col items-center justify-center gap-1 hover:bg-black transition-colors">
                        <span className="text-white text-lg leading-none">▶</span>
                        <span className="text-[9px] text-white/80 uppercase tracking-wider">Video</span>
                      </button>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="w-full h-full object-cover rounded" />
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
              <p className="text-xs text-[#9a9a9a]">No media attached</p>
            )}
          </div>

          {/* schedule */}
          <div className="pb-4 border-t border-[#f7f7f7] pt-3">
            <span className="text-xs text-[#3c3c3c] uppercase tracking-widest block mb-2">Scheduled for</span>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={dateVal}
                onChange={e => setDateVal(e.target.value)}
                className="text-xs border border-[#e6e6e6] px-2 py-1.5 focus:outline-none focus:border-[#1800ad] bg-white rounded"
              />
              <button
                onClick={saveDate}
                disabled={dateSaving || !dateVal}
                className="text-xs text-[#1800ad] font-semibold hover:text-[#2f1ac9] disabled:opacity-40 transition-colors">
                {dateSaving ? 'Saving…' : dateSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* actions */}
        {isActionable && !actionDone && (
          <div className="border-t border-[#f7f7f7] px-5 py-3 flex flex-wrap gap-2">
            <button
              onClick={() => act('approve')}
              disabled={actLoading}
              className="px-4 py-1.5 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
              Approve
            </button>
            <button
              onClick={() => act('reject')}
              disabled={actLoading}
              className="px-4 py-1.5 text-sm border border-[#F3B4C7] rounded text-[#dc2626] hover:bg-[#FCE9F0] hover:border-[#dc2626] disabled:opacity-40 transition-colors">
              Reject
            </button>
          </div>
        )}
        {actionDone && (
          <div className="border-t border-[#f7f7f7] px-5 py-3">
            <p className="text-xs text-[#3c3c3c]">{actionDone}</p>
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

        {/* delete — permanent, separate from Reject (which only changes status) */}
        <div className="border-t border-[#f7f7f7] px-5 py-3 flex items-center gap-2">
          {deleteStep === 0 ? (
            <button
              onClick={() => setDeleteStep(1)}
              className="text-xs text-[#9a9a9a] hover:text-[#dc2626] transition-colors">
              Delete this post
            </button>
          ) : (
            <>
              <span className="text-xs text-[#3c3c3c]">Delete permanently?</span>
              <button
                onClick={deleteDraft}
                disabled={deleting}
                className="text-xs font-semibold text-white bg-[#dc2626] hover:bg-[#B0285A] px-3 py-1 rounded disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setDeleteStep(0)}
                className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">
                Cancel
              </button>
            </>
          )}
          {deleteErr && <p className="text-xs text-[#dc2626]">{deleteErr}</p>}
        </div>
      </div>

      {showPicker && (
        <PhotoPickerModal
          attached={media}
          onPick={url => { attachUrl(url); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
