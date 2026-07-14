'use client'

import { useState } from 'react'
import { supabase, type Draft } from '@/lib/supabase'
import { resolveActiveProjectClient } from '@/lib/project'
import { CH_COLOR } from '@/lib/channels'
import ChannelIcon from '@/components/ChannelIcon'
import PhotoPickerModal from '@/components/PhotoPickerModal'

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
  const [posting, setPosting]           = useState(false)
  const [postResult, setPostResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  const [deleteStep, setDeleteStep]     = useState<0 | 1>(0)
  const [deleting, setDeleting]         = useState(false)
  const [deleteErr, setDeleteErr]       = useState('')

  const isActionable = draft.status === 'pending' || draft.status === 'needs_edit'

  const saveText = async () => {
    setSavingText(true)
    await supabase.from('generated_drafts').update({ draft_text: text }).eq('id', draft.id)
    setSavingText(false)
    setTextSaved(true)
    setTimeout(() => setTextSaved(false), 2000)
  }

  const regenerate = async () => {
    if (!feedback.trim()) return
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

  const post = async () => {
    setPosting(true)
    setPostResult(null)
    try {
      const res = await fetch(`/api/drafts/${draft.id}/post`, { method: 'POST' })
      const j = await res.json()
      if (j.status === 'posted') {
        setPostResult({ ok: true, msg: `Posted to ${j.channel}${j.platform_post_id ? ` (${j.platform_post_id})` : ''}` })
        setTimeout(() => { onSaved(); onClose() }, 1200)
      } else {
        setPostResult({ ok: false, msg: j.reason || j.error || 'Posting failed' })
      }
    } catch {
      setPostResult({ ok: false, msg: 'Posting failed — try again' })
    } finally {
      setPosting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-[#E4E9F2] w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#EEF1F4]">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: CH_COLOR[draft.channel]?.bg ?? '#EEF1F4',
                color: CH_COLOR[draft.channel]?.text ?? '#64748B',
              }}>
              <ChannelIcon channel={draft.channel} className="w-3 h-3" />
              {draft.channel}
            </span>
            <span className="font-mono text-xs text-[#64748B] uppercase tracking-widest">{draft.status}</span>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1A2130] text-lg leading-none transition-colors">×</button>
        </div>

        <div className="px-5 pt-4">
          <p className="text-base font-semibold text-[#1A2130] leading-snug mb-3">{draft.topic}</p>

          {/* manual text edit */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={7}
            className="w-full text-sm border border-[#E4E9F2] px-3 py-2 resize-none focus:outline-none focus:border-[#3B5BFF] bg-white leading-relaxed rounded-xl"
          />
          <div className="flex items-center gap-2 mt-1.5 mb-4">
            <button
              onClick={saveText}
              disabled={savingText || text === draft.draft_text}
              className="font-mono text-xs text-[#3B5BFF] font-semibold hover:text-[#2F44D9] disabled:opacity-40 transition-colors">
              {savingText ? 'Saving…' : textSaved ? '✓ Saved' : 'Save text'}
            </button>
          </div>

          {/* AI rewrite */}
          <div className="mb-4 pt-3 border-t border-[#EEF1F4]">
            <p className="font-mono text-xs text-[#64748B] uppercase tracking-widest mb-1.5">Or let AI rewrite it</p>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Describe what to change — the AI will rewrite immediately."
              rows={2}
              className="w-full text-sm border border-[#E4E9F2] px-3 py-2 resize-none focus:outline-none focus:border-[#3B5BFF] bg-white leading-relaxed rounded-xl"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={regenerate}
                disabled={!feedback.trim() || regenerating}
                className="px-3 py-1.5 text-xs font-semibold bg-[#3B5BFF] text-white hover:bg-[#2F44D9] rounded-xl disabled:opacity-40 transition-colors">
                {regenerating ? 'Rewriting…' : 'Regenerate now'}
              </button>
              {regenErr && <p className="font-mono text-xs text-[#64748B]">{regenErr}</p>}
            </div>
          </div>

          {/* media */}
          <div className="pb-4 border-t border-[#EEF1F4] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-[#64748B] uppercase tracking-widest">
                Media{media.length > 0 ? ` · ${media.length} file${media.length !== 1 ? 's' : ''}` : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={findMatchingPhoto}
                  disabled={matching}
                  className={`font-mono text-xs transition-colors ${matching ? 'text-[#94A3B8]' : 'text-[#3B5BFF] hover:text-[#2F44D9]'}`}>
                  {matching ? 'Matching…' : '✦ Match photo'}
                </button>
                <button
                  onClick={() => setShowPicker(true)}
                  className="font-mono text-xs text-[#64748B] hover:text-[#1A2130] transition-colors">
                  ▤ Library
                </button>
                <label className={`cursor-pointer font-mono text-xs transition-colors ${uploading ? 'text-[#94A3B8]' : 'text-[#64748B] hover:text-[#1A2130]'}`}>
                  {uploading ? 'Uploading…' : '+ Add'}
                  <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            </div>
            {uploadErr && <p className="font-mono text-xs text-[#64748B] mb-2">{uploadErr}</p>}
            {matchErr && <p className="font-mono text-xs text-[#64748B] mb-2">{matchErr}</p>}
            {matches.length > 0 && (
              <div className="mb-3 border border-[#EEF1FF] rounded-xl bg-[#EEF1FF] p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-xs text-[#3B5BFF] font-semibold uppercase tracking-widest">
                    {matches.length} match{matches.length !== 1 ? 'es' : ''}
                  </p>
                  <button onClick={() => setMatches([])} className="font-mono text-xs text-[#94A3B8] hover:text-[#1A2130] transition-colors">✕</button>
                </div>
                <div className="space-y-2">
                  {matches.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 p-1.5 bg-white rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.display_url ?? m.public_url} alt={m.filename} className="w-12 h-12 object-cover rounded shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[10px] text-[#3B5BFF] font-semibold">{i === 0 ? 'Best fit' : `#${i + 1}`}</p>
                        <p className="text-xs text-[#475467] leading-snug line-clamp-2">{m.reason}</p>
                      </div>
                      <button
                        onClick={() => { attachUrl(m.public_url); setMatches(ms => ms.filter(x => x.id !== m.id)) }}
                        className="font-mono text-xs text-[#3B5BFF] font-semibold hover:text-[#2F44D9] transition-colors shrink-0">
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
                      <div className="w-full h-full bg-[#EEF1F4] flex flex-col items-center justify-center gap-1">
                        <span className="font-mono text-[10px] text-[#64748B]">VIDEO</span>
                      </div>
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
              <p className="font-mono text-xs text-[#B4BECC]">No media attached</p>
            )}
          </div>

          {/* schedule */}
          <div className="pb-4 border-t border-[#EEF1F4] pt-3">
            <span className="font-mono text-xs text-[#64748B] uppercase tracking-widest block mb-2">Scheduled for</span>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={dateVal}
                onChange={e => setDateVal(e.target.value)}
                className="font-mono text-xs border border-[#E4E9F2] px-2 py-1.5 focus:outline-none focus:border-[#3B5BFF] bg-white rounded-xl"
              />
              <button
                onClick={saveDate}
                disabled={dateSaving || !dateVal}
                className="font-mono text-xs text-[#3B5BFF] font-semibold hover:text-[#2F44D9] disabled:opacity-40 transition-colors">
                {dateSaving ? 'Saving…' : dateSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* actions */}
        {isActionable && !actionDone && (
          <div className="border-t border-[#EEF1F4] px-5 py-3 flex flex-wrap gap-2">
            <button
              onClick={() => act('approve')}
              disabled={actLoading}
              className="px-4 py-1.5 text-sm font-semibold bg-[#3B5BFF] text-white hover:bg-[#2F44D9] rounded-xl disabled:opacity-40 transition-colors">
              Approve
            </button>
            <button
              onClick={() => act('reject')}
              disabled={actLoading}
              className="px-4 py-1.5 text-sm border border-[#F3B4C7] rounded-xl text-[#D6336C] hover:bg-[#FCE9F0] hover:border-[#D6336C] disabled:opacity-40 transition-colors">
              Reject
            </button>
          </div>
        )}
        {actionDone && (
          <div className="border-t border-[#EEF1F4] px-5 py-3">
            <p className="font-mono text-xs text-[#64748B]">{actionDone}</p>
          </div>
        )}

        {/* post now */}
        {draft.status === 'approved' && (
          <div className="border-t border-[#EEF1F4] px-5 py-3">
            <button
              onClick={post}
              disabled={posting}
              className="px-4 py-1.5 text-sm font-semibold bg-[#1A2130] text-white hover:bg-[#000000] rounded-xl disabled:opacity-40 transition-colors">
              {posting ? 'Posting…' : `Post to ${draft.channel} now`}
            </button>
            {postResult && (
              <p className={`font-mono text-xs mt-2 ${postResult.ok ? 'text-[#0EA5A0]' : 'text-[#D6336C]'}`}>
                {postResult.ok ? '✓ ' : '✗ '}{postResult.msg}
              </p>
            )}
          </div>
        )}

        {/* delete — permanent, separate from Reject (which only changes status) */}
        <div className="border-t border-[#EEF1F4] px-5 py-3 flex items-center gap-2">
          {deleteStep === 0 ? (
            <button
              onClick={() => setDeleteStep(1)}
              className="font-mono text-xs text-[#B4BECC] hover:text-[#D6336C] transition-colors">
              Delete this post
            </button>
          ) : (
            <>
              <span className="font-mono text-xs text-[#64748B]">Delete permanently?</span>
              <button
                onClick={deleteDraft}
                disabled={deleting}
                className="font-mono text-xs font-semibold text-white bg-[#D6336C] hover:bg-[#B0285A] px-3 py-1 rounded-xl disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setDeleteStep(0)}
                className="font-mono text-xs text-[#94A3B8] hover:text-[#1A2130] transition-colors">
                Cancel
              </button>
            </>
          )}
          {deleteErr && <p className="font-mono text-xs text-[#D6336C]">{deleteErr}</p>}
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
