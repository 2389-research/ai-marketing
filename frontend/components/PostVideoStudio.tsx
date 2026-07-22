'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LibVideo {
  id: string
  filename: string
  public_url: string
  storage_path: string
}

interface GenVideo {
  id: string
  public_url: string
  storage_path: string
}

// A focused studio for making a video FOR a specific post. Opened from a post's
// "Generate video" button via /videos?forDraft=<id>. The AI drafts an editable
// visual prompt from the post; the user tweaks it, optionally folds in existing
// library videos, generates, previews, deletes/regenerates, then attaches the
// result back to the post's media.
export default function PostVideoStudio({
  draftId, videos, onClose, onLibraryChanged,
}: {
  draftId: string
  videos: LibVideo[]
  onClose: () => void
  onLibraryChanged: () => void
}) {
  const [loadingBrief, setLoadingBrief] = useState(true)
  const [briefErr, setBriefErr]   = useState('')
  const [prompt, setPrompt]       = useState('')
  const [topic, setTopic]         = useState('')
  const [channelLabel, setChannel] = useState('')

  const [includeIds, setIncludeIds] = useState<Set<string>>(new Set())

  const [generating, setGenerating] = useState(false)
  const [genErr, setGenErr]         = useState('')
  const [elapsed, setElapsed]       = useState(0)
  const [result, setResult]         = useState<GenVideo | null>(null)

  const [attaching, setAttaching]   = useState(false)
  const [attached, setAttached]     = useState(false)
  const [deleting, setDeleting]     = useState(false)

  // Draft the editable prompt from the post.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingBrief(true); setBriefErr('')
      try {
        const res = await fetch('/api/videos/draft-brief', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_id: draftId }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) { setBriefErr(data.error ?? 'Could not draft a prompt'); return }
        setPrompt(data.brief ?? '')
        setTopic(data.topic ?? '')
        setChannel(data.channelLabel ?? '')
      } catch (err: any) {
        if (!cancelled) setBriefErr(err?.message ?? 'Could not draft a prompt')
      } finally {
        if (!cancelled) setLoadingBrief(false)
      }
    })()
    return () => { cancelled = true }
  }, [draftId])

  // Elapsed timer while generating (renders take a few minutes).
  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [generating])

  const toggleInclude = (id: string) => {
    setIncludeIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const runGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true); setGenErr(''); setAttached(false)
    try {
      const includeVideoUrls = videos.filter(v => includeIds.has(v.id)).map(v => v.public_url)
      const res = await fetch('/api/videos/generate-render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt.trim(), includeVideoUrls }),
      })
      const data = await res.json()
      if (!res.ok) { setGenErr(data.error ?? 'Generation failed'); return }
      setResult(data.video)
      onLibraryChanged()
    } catch (err: any) {
      setGenErr(err?.message ?? 'Unexpected error')
    } finally {
      setGenerating(false)
    }
  }

  const deleteResult = async (): Promise<boolean> => {
    if (!result) return true
    setDeleting(true)
    try {
      await fetch('/api/videos', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, storage_path: result.storage_path }),
      })
      setResult(null); setAttached(false)
      onLibraryChanged()
      return true
    } finally {
      setDeleting(false)
    }
  }

  const regenerate = async () => {
    await deleteResult()
    runGenerate()
  }

  const attachToPost = async () => {
    if (!result) return
    setAttaching(true)
    try {
      const { data } = await supabase.from('generated_drafts').select('media').eq('id', draftId).single()
      const media: string[] = (data?.media as string[] | null) ?? []
      if (!media.includes(result.public_url)) {
        await supabase.from('generated_drafts').update({ media: [...media, result.public_url] }).eq('id', draftId)
      }
      setAttached(true)
    } finally {
      setAttaching(false)
    }
  }

  const fmtEl = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="mb-8 border border-[#1c69d4] rounded bg-[#f7f9fd] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#dbe6f6] bg-[#eef4fd]">
        <div className="min-w-0">
          <p className="text-xs text-[#1c69d4] font-semibold uppercase tracking-widest">🎬 Video for this post</p>
          {topic && <p className="text-sm text-[#262626] font-semibold truncate mt-0.5">{channelLabel ? `${channelLabel} · ` : ''}{topic}</p>}
        </div>
        <button onClick={onClose} className="text-[#6b6b6b] hover:text-[#262626] text-sm transition-colors shrink-0 ml-4">✕ Close</button>
      </div>

      <div className="p-5">
        {/* editable prompt */}
        <label className="text-xs text-[#6b6b6b] uppercase tracking-widest">Visual prompt — the AI drafted this from your post; edit it however you like</label>
        {loadingBrief ? (
          <div className="mt-2 h-28 rounded border border-[#e6e6e6] bg-white flex items-center justify-center">
            <p className="text-xs text-[#9a9a9a]">Drafting a prompt from your post…</p>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the video you want…"
            className="mt-2 w-full text-sm border border-[#cccccc] rounded px-3 py-2 outline-none focus:border-[#1c69d4] bg-white leading-relaxed resize-y"
          />
        )}
        {briefErr && <p className="text-xs text-[#DC2626] mt-1">{briefErr} — you can still write the prompt yourself.</p>}

        {/* include existing library videos */}
        {videos.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-2">Optionally build on videos you already uploaded</p>
            <div className="flex flex-wrap gap-2">
              {videos.map(v => {
                const on = includeIds.has(v.id)
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleInclude(v.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors max-w-[220px] truncate ${
                      on ? 'bg-[#1c69d4] text-white border-[#1c69d4]' : 'bg-white text-[#3c3c3c] border-[#d6d6d6] hover:border-[#1c69d4]'
                    }`}
                    title={v.filename}>
                    {on ? '✓ ' : '+ '}{v.filename}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* generate */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {!result && (
            <button
              onClick={runGenerate}
              disabled={generating || loadingBrief || !prompt.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white rounded hover:bg-[#0653b6] disabled:opacity-40 transition-colors">
              {generating ? 'Generating…' : '✦ Generate video'}
            </button>
          )}
          {generating && (
            <p className="text-xs text-[#1c69d4]">
              Rendering your video — this takes about 4–5 minutes. Elapsed {fmtEl(elapsed)}. You can leave this open.
            </p>
          )}
          {genErr && <p className="text-xs text-[#DC2626]">{genErr}</p>}
        </div>

        {/* result */}
        {result && (
          <div className="mt-5 border-t border-[#dbe6f6] pt-4">
            <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-2">Result</p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={result.public_url} controls className="w-full max-w-[280px] rounded border border-[#e6e6e6] bg-black" />
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                onClick={attachToPost}
                disabled={attaching || attached}
                className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white rounded hover:bg-[#0653b6] disabled:opacity-40 transition-colors">
                {attached ? '✓ Attached to post' : attaching ? 'Attaching…' : 'Attach to this post'}
              </button>
              <button
                onClick={regenerate}
                disabled={generating || deleting}
                className="text-sm text-[#1c69d4] font-semibold hover:text-[#0653b6] disabled:opacity-40 transition-colors">
                ↻ Delete & regenerate
              </button>
              <button
                onClick={deleteResult}
                disabled={deleting || generating}
                className="text-sm text-[#9a9a9a] hover:text-[#DC2626] disabled:opacity-40 transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            {attached && (
              <p className="text-xs text-[#22c55e] mt-2">Added to the post — you’ll see it on the draft and calendar. Generate another if you want options.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
