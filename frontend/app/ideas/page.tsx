'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CHANNELS } from '@/lib/channels'
import { supabase } from '@/lib/supabase'

interface Idea {
  id: string
  text: string
  enrichment: {
    angles?: string[]; channels?: string[]; hook?: string
    // inspiration clippings ("swipe file")
    why_it_works?: string[]; steal_these?: string[]; suggested_use?: string
  } | null
  status: 'new' | 'queued' | 'drafted' | 'archived'
  board: { x: number; y: number } | null
  created_at: string
  kind?: 'idea' | 'inspiration'
  source_url?: string | null
  content?: string | null
  image_url?: string | null
}

function domainOf(url?: string | null) {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

const CH_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map(c => [c.id, c.label]))

// sticky-note pastels — assigned deterministically from the idea's id so a
// note keeps its color forever without storing it
const NOTE_COLORS = ['#FEF3C7', '#FCE7F3', '#DBEAFE', '#D1FAE5', '#EDE9FE', '#FFEDD5']
const PIN_COLORS  = ['#D97706', '#DB2777', '#2563EB', '#059669', '#7C3AED', '#EA580C']

function hashIdx(id: string, mod: number) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % mod
}
function noteRotation(id: string) {
  return ((hashIdx(id, 100) / 100) * 6 - 3).toFixed(2) // -3°..+3°
}
// deterministic scatter for notes that were never dragged
function autoPos(id: string, index: number) {
  const col = index % 4
  const row = Math.floor(index / 4)
  const jx = (hashIdx(id + 'x', 60) / 10) - 3
  const jy = (hashIdx(id + 'y', 60) / 10) - 3
  return { x: 4 + col * 24 + jx, y: 6 + row * 32 + jy }
}

const STATUS_STICKER: Record<string, string> = { queued: '→ in pipeline', drafted: '✦ drafted' }

export default function IdeasPage() {
  const router = useRouter()
  const boardRef = useRef<HTMLDivElement>(null)
  const [ideas, setIdeas]       = useState<Idea[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [composing, setComposing] = useState(false)
  const [draft, setDraft]       = useState('')
  const [saving, setSaving]     = useState(false)
  // inspiration clipping composer
  const [clipping, setClipping]         = useState(false)
  const [clipUrl, setClipUrl]           = useState('')
  const [clipText, setClipText]         = useState('')
  const [clipImage, setClipImage]       = useState<string | null>(null)
  const [clipUploading, setClipUploading] = useState(false)
  const [clipSaving, setClipSaving]     = useState(false)
  const [clipErr, setClipErr]           = useState('')
  const [openIdea, setOpenIdea] = useState<Idea | null>(null)
  const [busy, setBusy]         = useState(false)
  const drag = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const load = async () => {
    const res = await fetch('/api/ideas')
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to load'); setLoading(false); return }
    setIdeas(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const enrich = async (id: string) => {
    await fetch('/api/ideas/enrich', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const saveIdea = async () => {
    if (!draft.trim() || saving) return
    setSaving(true); setError('')
    const res = await fetch('/api/ideas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: draft }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    setDraft(''); setComposing(false)
    setIdeas(prev => [data, ...prev])
    enrich(data.id)
  }

  // ── inspiration clippings ("I liked this — steal the pattern") ──────────
  const uploadClipImage = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setClipUploading(true); setClipErr('')
    try {
      const path = `inspiration/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error } = await supabase.storage.from('draft-media').upload(path, file)
      if (error) { setClipErr(`Screenshot upload failed: ${error.message}`); return }
      const { data } = supabase.storage.from('draft-media').getPublicUrl(path)
      setClipImage(data.publicUrl)
    } catch (err: any) {
      setClipErr(err?.message ?? 'Screenshot upload failed')
    } finally {
      setClipUploading(false)
    }
  }

  const saveClipping = async () => {
    if (clipSaving || (!clipUrl.trim() && !clipText.trim() && !clipImage)) return
    setClipSaving(true); setClipErr('')
    try {
      const res = await fetch('/api/ideas/inspiration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: clipUrl.trim() || undefined,
          text: clipText.trim() || undefined,
          image_url: clipImage || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setClipErr(data.error ?? 'Save failed'); return }
      setClipUrl(''); setClipText(''); setClipImage(null); setClipping(false)
      setIdeas(prev => [data, ...prev])
    } catch (err: any) {
      setClipErr(err?.message ?? 'Save failed')
    } finally {
      setClipSaving(false)
    }
  }

  // ── freeform drag (desktop) ─────────────────────────────────────────────
  const posOf = (idea: Idea, index: number) => idea.board ?? autoPos(idea.id, index)

  const onPointerDown = (e: React.PointerEvent, idea: Idea, index: number) => {
    if (window.innerWidth < 768) return // mobile: tap only
    const p = posOf(idea, index)
    drag.current = { id: idea.id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const rect = boardRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true
    if (!d.moved) return
    setIdeas(prev => prev.map(i => i.id === d.id
      ? { ...i, board: { x: Math.min(88, Math.max(0, d.origX + dx)), y: Math.min(88, Math.max(0, d.origY + dy)) } }
      : i))
  }
  const onPointerUp = (idea: Idea) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== idea.id) return
    if (d.moved) {
      const moved = ideas.find(i => i.id === idea.id)
      const b = moved?.board
      if (b) {
        fetch('/api/ideas', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: idea.id, board: b }),
        })
      }
    } else {
      setOpenIdea(ideas.find(i => i.id === idea.id) ?? idea)
    }
  }

  // ── realize actions (from the open-note modal) ──────────────────────────
  const toPipeline = async (id: string) => {
    setBusy(true)
    await fetch('/api/ideas/to-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusy(false); setOpenIdea(null); load()
  }
  const draftIt = async (idea: Idea) => {
    await fetch('/api/ideas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idea.id, status: 'drafted' }),
    })
    router.push(`/write?ideaId=${idea.id}`)
  }
  const archive = async (id: string) => {
    setBusy(true)
    await fetch('/api/ideas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'archived' }),
    })
    setBusy(false); setOpenIdea(null); load()
  }
  const remove = async (id: string) => {
    setBusy(true)
    await fetch('/api/ideas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusy(false); setOpenIdea(null)
    setIdeas(prev => prev.filter(i => i.id !== id))
  }

  const marker = { fontFamily: 'var(--font-kalam), Kalam, cursive' }

  // Composer for inspiration clippings — link and/or pasted text and/or
  // screenshot. Rendered via plain function call (NOT <ClipComposer/>): a
  // nested component would get a new identity every render and remount its
  // inputs, dropping focus on each keystroke.
  const clipComposer = (floating: boolean) => (
    <div
      className={`${floating ? 'absolute right-[5%] top-[8%] w-[290px] z-30 rotate-[1.2deg]' : 'relative mb-4'} bg-white border border-[#e6e6e6] rounded-[2px] shadow-[3px_5px_14px_rgba(0,0,0,0.25)] p-4 pt-5`}
    >
      <span className="absolute -top-2.5 left-3 text-[20px] leading-none rotate-[12deg] drop-shadow-sm">📎</span>
      <p className="text-[13px] font-semibold text-[#262626] mb-2">Save something that inspired you</p>
      <input
        autoFocus
        value={clipUrl}
        onChange={e => setClipUrl(e.target.value)}
        placeholder="Link (post, video, article) — optional"
        className="w-full mb-2 px-2.5 py-1.5 text-[13px] border border-[#e6e6e6] rounded focus:outline-none focus:border-[#1800ad]"
      />
      <textarea
        value={clipText}
        onChange={e => setClipText(e.target.value)}
        placeholder="…or paste the post's text (best for X/LinkedIn/TikTok — they block fetching)"
        rows={3}
        className="w-full mb-2 px-2.5 py-1.5 text-[13px] border border-[#e6e6e6] rounded focus:outline-none focus:border-[#1800ad] resize-none"
      />
      <div className="flex items-center gap-2 mb-2">
        <label className={`text-[12px] font-semibold text-[#1800ad] hover:text-[#2f1ac9] cursor-pointer ${clipUploading ? 'opacity-40 pointer-events-none' : ''}`}>
          {clipUploading ? 'uploading…' : clipImage ? '↺ replace screenshot' : '+ screenshot'}
          <input type="file" accept="image/*" className="hidden" onChange={e => { uploadClipImage(e.target.files); e.target.value = '' }} />
        </label>
        {clipImage && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={clipImage} alt="" className="h-8 rounded border border-[#e6e6e6]" />
        )}
      </div>
      {clipErr && <p className="text-[11px] text-[#DC2626] mb-2">{clipErr}</p>}
      <div className="flex justify-between items-center">
        <button onClick={() => { setClipping(false); setClipErr('') }} className="text-[11px] text-[#78716c] hover:text-[#292524]">cancel</button>
        <button
          onClick={saveClipping}
          disabled={clipSaving || clipUploading || (!clipUrl.trim() && !clipText.trim() && !clipImage)}
          className="text-[13px] font-bold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40">
          {clipSaving ? '✦ reading it…' : '✂ clip it'}
        </button>
      </div>
    </div>
  )

  const Note = ({ idea, index, floating }: { idea: Idea; index: number; floating: boolean }) => {
    const isClip = idea.kind === 'inspiration'
    const color = isClip ? '#FFFFFF' : NOTE_COLORS[hashIdx(idea.id, NOTE_COLORS.length)]
    const pin   = PIN_COLORS[hashIdx(idea.id, PIN_COLORS.length)]
    const p = posOf(idea, index)
    const sticker = STATUS_STICKER[idea.status]

    // inspiration = a clipping you tore out and clipped to the wall
    if (isClip) {
      return (
        <div
          onPointerDown={e => floating && onPointerDown(e, idea, index)}
          onPointerMove={floating ? onPointerMove : undefined}
          onPointerUp={() => floating ? onPointerUp(idea) : setOpenIdea(idea)}
          style={{
            transform: `rotate(${noteRotation(idea.id)}deg)`,
            ...(floating ? { position: 'absolute' as const, left: `${p.x}%`, top: `${p.y}%`, width: '210px' } : {}),
          }}
          className={`${floating ? 'cursor-grab active:cursor-grabbing' : 'relative cursor-pointer w-full'} select-none bg-white border border-[#e6e6e6] rounded-[2px] shadow-[2px_3px_8px_rgba(0,0,0,0.15)] hover:shadow-[3px_5px_14px_rgba(0,0,0,0.22)] hover:z-20 transition-shadow touch-none`}
        >
          {/* paperclip */}
          <span className="absolute -top-2.5 left-3 z-10 text-[20px] leading-none rotate-[12deg] drop-shadow-sm">📎</span>
          {idea.image_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={idea.image_url} alt="" className="w-full h-20 object-cover border-b border-[#f0f0f0]" draggable={false} />
          )}
          <div className="p-3 pt-3.5">
            <p className="text-[13px] font-semibold leading-snug text-[#262626] break-words line-clamp-3">{idea.text}</p>
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-[10px] text-[#9a9a9a] truncate">
                {domainOf(idea.source_url) || 'saved inspiration'}
              </span>
              {sticker
                ? <span style={marker} className="text-[11px] font-bold text-[#1800ad] shrink-0">{sticker}</span>
                : <span className="text-[10px] text-[#1800ad] shrink-0">✂ inspiration</span>}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        onPointerDown={e => floating && onPointerDown(e, idea, index)}
        onPointerMove={floating ? onPointerMove : undefined}
        onPointerUp={() => floating ? onPointerUp(idea) : setOpenIdea(idea)}
        style={{
          backgroundColor: color,
          transform: `rotate(${noteRotation(idea.id)}deg)`,
          ...(floating ? { position: 'absolute' as const, left: `${p.x}%`, top: `${p.y}%`, width: '200px' } : {}),
        }}
        className={`${floating ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer w-full'} select-none rounded-sm shadow-[2px_3px_8px_rgba(0,0,0,0.18)] hover:shadow-[3px_5px_14px_rgba(0,0,0,0.25)] hover:z-20 transition-shadow p-3.5 pt-5 touch-none`}
      >
        {/* pin */}
        <span
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.35)] border border-black/10"
          style={{ backgroundColor: pin }}
        />
        <p style={marker} className="text-[15px] leading-snug text-[#292524] break-words line-clamp-6">
          {idea.text}
        </p>
        <div className="flex items-center justify-between mt-2.5">
          <span style={marker} className="text-[11px] text-[#78716c]">
            {new Date(idea.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
          {sticker
            ? <span style={marker} className="text-[11px] font-bold text-[#1800ad]">{sticker}</span>
            : !idea.enrichment && <span style={marker} className="text-[11px] text-[#78716c] animate-pulse">✦ developing…</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-[1400px] w-full mx-auto">
      <div className="mb-5 pb-5 border-b border-[#e6e6e6] flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Idea Board</h1>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
            Pin a thought or clip something that inspired you — the AI breaks down why it works so you can steal the pattern, never the words.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setClipping(true); setComposing(false) }}
            className="px-4 py-2 text-sm font-semibold border border-[#1800ad] text-[#1800ad] hover:bg-[#f7f7f7] rounded transition-colors">
            📎 Save inspiration
          </button>
          <button
            onClick={() => { setComposing(true); setClipping(false) }}
            className="px-4 py-2 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded transition-colors">
            + New sticky
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-[#DC2626] mb-4">{error}</p>}

      {/* the board (desktop: freeform wall; mobile: note grid) */}
      <div
        ref={boardRef}
        className="hidden md:block relative rounded border border-[#e6e6e6] min-h-[70vh] overflow-hidden"
        style={{
          background: '#FBFAF8',
          backgroundImage: 'radial-gradient(circle, #d8d4cd 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-[#9a9a9a]">Loading…</p>}
        {!loading && ideas.length === 0 && !composing && !clipping && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p style={marker} className="text-xl text-[#9a9a9a] rotate-[-2deg]">the wall is empty…</p>
            <p className="text-xs text-[#9a9a9a]">hit “+ New sticky” and pin your first thought</p>
          </div>
        )}
        {ideas.map((idea, i) => <Note key={idea.id} idea={idea} index={i} floating />)}

        {/* composer — a blank sticky you write on */}
        {composing && (
          <div
            className="absolute left-[6%] top-[8%] w-[230px] bg-[#FEF9C3] rounded-sm shadow-[3px_5px_14px_rgba(0,0,0,0.3)] p-3.5 pt-5 rotate-[-1.5deg] z-30"
          >
            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#D97706] shadow border border-black/10" />
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveIdea() }
                if (e.key === 'Escape') { setComposing(false); setDraft('') }
              }}
              placeholder="scribble the idea…"
              rows={4}
              style={marker}
              className="w-full bg-transparent text-[15px] leading-snug text-[#292524] outline-none resize-none placeholder:text-[#a8a29e]"
            />
            <div className="flex justify-between items-center">
              <button onClick={() => { setComposing(false); setDraft('') }} className="text-[11px] text-[#78716c] hover:text-[#292524]">esc</button>
              <button
                onClick={saveIdea}
                disabled={saving || !draft.trim()}
                style={marker}
                className="text-[13px] font-bold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40">
                {saving ? 'pinning…' : 'pin it ↵'}
              </button>
            </div>
          </div>
        )}

        {clipping && clipComposer(true)}
      </div>

      {/* mobile: simple note grid, tap to open */}
      <div className="md:hidden">
        {clipping && clipComposer(false)}
        {composing && (
          <div className="mb-4 bg-[#FEF9C3] rounded-sm shadow p-3.5">
            <textarea
              autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={3}
              placeholder="scribble the idea…" style={marker}
              className="w-full bg-transparent text-[15px] outline-none resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setComposing(false); setDraft('') }} className="text-xs text-[#78716c]">cancel</button>
              <button onClick={saveIdea} disabled={saving || !draft.trim()} className="text-xs font-bold text-[#1800ad]">pin it</button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {ideas.map((idea, i) => <Note key={idea.id} idea={idea} index={i} floating={false} />)}
        </div>
        {!loading && ideas.length === 0 && !composing && (
          <p className="text-sm text-[#9a9a9a] text-center py-16">No ideas yet — hit “+ New sticky”.</p>
        )}
      </div>

      {/* open clipping — source + the AI's breakdown of why it works */}
      {openIdea && openIdea.kind === 'inspiration' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpenIdea(null)}>
          <div
            className="w-full max-w-md bg-white border border-[#e6e6e6] rounded-[2px] shadow-2xl p-6 pt-7 relative rotate-[0.5deg] max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <span className="absolute -top-3 left-4 text-[24px] leading-none rotate-[12deg] drop-shadow-sm">📎</span>
            <button onClick={() => setOpenIdea(null)} className="absolute top-2.5 right-3 text-[#78716c] hover:text-[#292524] text-lg leading-none">×</button>

            <p className="text-[16px] font-bold leading-snug text-[#262626] mb-1">{openIdea.text}</p>
            {openIdea.source_url && (
              <a href={openIdea.source_url} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-[#1800ad] hover:text-[#2f1ac9] underline break-all">
                {domainOf(openIdea.source_url)} ↗
              </a>
            )}
            {openIdea.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={openIdea.image_url} alt="" className="w-full max-h-52 object-cover rounded border border-[#e6e6e6] mt-3" />
            )}

            {openIdea.enrichment ? (
              <div className="mt-4 space-y-3">
                {(openIdea.enrichment.why_it_works ?? []).length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-[#9a9a9a] mb-1">Why it works</p>
                    {(openIdea.enrichment.why_it_works ?? []).map((w, i) => (
                      <p key={i} className="text-[13px] text-[#3c3c3c] leading-relaxed">• {w}</p>
                    ))}
                  </div>
                )}
                {(openIdea.enrichment.steal_these ?? []).length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-[#9a9a9a] mb-1">Steal the pattern (never the words)</p>
                    {(openIdea.enrichment.steal_these ?? []).map((s, i) => (
                      <p key={i} className="text-[13px] text-[#1800ad] leading-relaxed">✂ {s}</p>
                    ))}
                  </div>
                )}
                {openIdea.enrichment.suggested_use && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-[#9a9a9a] mb-1">For us</p>
                    <p className="text-[13px] text-[#3c3c3c] leading-relaxed">{openIdea.enrichment.suggested_use}</p>
                  </div>
                )}
                {(openIdea.enrichment.channels ?? []).length > 0 && (
                  <p className="text-[12px] text-[#78716c]">
                    fits: {(openIdea.enrichment.channels ?? []).map(c => CH_LABEL[c] ?? c).join(' · ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-[#9a9a9a] mt-4">No breakdown saved for this clipping.</p>
            )}

            <div className="flex items-center gap-4 flex-wrap border-t border-[#f0f0f0] pt-3 mt-4">
              <button onClick={() => draftIt(openIdea)} className="text-sm font-bold text-[#1800ad] hover:text-[#2f1ac9]">✦ make ours</button>
              {openIdea.status !== 'queued' && (
                <button onClick={() => toPipeline(openIdea.id)} disabled={busy} className="text-sm font-bold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40">→ into the pipeline</button>
              )}
              <span className="ml-auto flex gap-3">
                <button onClick={() => archive(openIdea.id)} disabled={busy} className="text-xs text-[#78716c] hover:text-[#292524]">archive</button>
                <button onClick={() => remove(openIdea.id)} disabled={busy} className="text-xs text-[#78716c] hover:text-[#DC2626]">delete</button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* open note — the flip side with the AI's take + realize buttons */}
      {openIdea && openIdea.kind !== 'inspiration' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpenIdea(null)}>
          <div
            className="w-full max-w-md rounded-sm shadow-2xl p-6 pt-8 relative rotate-[-0.5deg]"
            style={{ backgroundColor: NOTE_COLORS[hashIdx(openIdea.id, NOTE_COLORS.length)] }}
            onClick={e => e.stopPropagation()}
          >
            <span
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow border border-black/10"
              style={{ backgroundColor: PIN_COLORS[hashIdx(openIdea.id, PIN_COLORS.length)] }}
            />
            <button onClick={() => setOpenIdea(null)} className="absolute top-2.5 right-3 text-[#78716c] hover:text-[#292524] text-lg leading-none">×</button>

            <p style={marker} className="text-[17px] leading-snug text-[#292524] whitespace-pre-wrap mb-4">{openIdea.text}</p>

            {openIdea.enrichment ? (
              <div className="border-t border-black/10 pt-3 mb-4">
                {openIdea.enrichment.hook && (
                  <p style={marker} className="text-[14px] text-[#44403c] italic mb-2">hook: “{openIdea.enrichment.hook}”</p>
                )}
                {(openIdea.enrichment.angles ?? []).map((a, i) => (
                  <p key={i} style={marker} className="text-[13px] text-[#57534e] mb-1">→ {a}</p>
                ))}
                {(openIdea.enrichment.channels ?? []).length > 0 && (
                  <p style={marker} className="text-[12px] text-[#78716c] mt-2">
                    fits: {(openIdea.enrichment.channels ?? []).map(c => CH_LABEL[c] ?? c).join(' · ')}
                  </p>
                )}
              </div>
            ) : (
              <p style={marker} className="text-[13px] text-[#78716c] animate-pulse mb-4">✦ the AI is developing this…</p>
            )}

            <div className="flex items-center gap-4 flex-wrap border-t border-black/10 pt-3">
              <button onClick={() => draftIt(openIdea)} className="text-sm font-bold text-[#1800ad] hover:text-[#2f1ac9]" style={marker}>✦ draft it</button>
              {openIdea.status !== 'queued' && (
                <button onClick={() => toPipeline(openIdea.id)} disabled={busy} className="text-sm font-bold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40" style={marker}>→ into the pipeline</button>
              )}
              <button
                onClick={() => router.push(`/videos?prompt=${encodeURIComponent(openIdea.enrichment?.hook ? `${openIdea.text} — hook: ${openIdea.enrichment.hook}` : openIdea.text)}`)}
                className="text-sm font-bold text-[#1800ad] hover:text-[#2f1ac9]" style={marker}>🎬 video</button>
              <span className="ml-auto flex gap-3">
                <button onClick={() => archive(openIdea.id)} disabled={busy} className="text-xs text-[#78716c] hover:text-[#292524]">archive</button>
                <button onClick={() => remove(openIdea.id)} disabled={busy} className="text-xs text-[#78716c] hover:text-[#DC2626]">delete</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
