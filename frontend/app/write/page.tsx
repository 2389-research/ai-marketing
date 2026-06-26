'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ── channel grayscale ─────────────────────────────────────────────────────────

const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  shade: '#111111' },
  { id: 'instagram', label: 'Instagram', shade: '#3C3C3C' },
  { id: 'email',     label: 'Email',     shade: '#525252' },
  { id: 'tiktok',    label: 'TikTok',    shade: '#686868' },
  { id: 'youtube',   label: 'YouTube',   shade: '#7D7D7D' },
  { id: 'x',         label: 'X',         shade: '#444444' },
]

export default function WritePage() {
  const router = useRouter()

  const [brief,    setBrief]    = useState('')
  const [context,  setContext]  = useState('')
  const [showCtx,  setShowCtx]  = useState(false)
  const [channels, setChannels] = useState(['linkedin', 'instagram'])
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')
  const [progress, setProgress] = useState<string[]>([])

  const toggle = (id: string) =>
    setChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const generate = async () => {
    if (!brief.trim())    { setError('Write something first.'); return }
    if (!channels.length) { setError('Pick at least one channel.'); return }
    setError('')
    setLoading(true)
    setProgress([])

    const results: { channel: string; text: string }[] = []

    for (const channel of channels) {
      setProgress(p => [...p, `Generating ${channel}…`])
      const res = await fetch('/api/drafts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic: brief.trim(), channel, context: context.trim() || undefined }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg ?? `Failed to generate for ${channel}`)
        setLoading(false)
        return
      }
      const { text } = await res.json()
      results.push({ channel, text })
      setProgress(p => [...p.slice(0, -1), `✓ ${channel}`])
    }

    setProgress(p => [...p, 'Saving to Drafts…'])
    const saveRes = await fetch('/api/drafts/compose', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        topic:      brief.trim(),
        draft_text: results[0].text,
        channels:   channels,
      }),
    })

    if (results.length > 1) {
      for (const r of results.slice(1)) {
        await fetch('/api/drafts/compose', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ topic: brief.trim(), draft_text: r.text, channels: [r.channel] }),
        })
      }
    }

    setLoading(false)

    if (!saveRes.ok) {
      const { error: msg } = await saveRes.json().catch(() => ({}))
      setError(msg ?? 'Failed to save drafts.')
      return
    }

    setDone(true)
    setTimeout(() => router.push('/drafts'), 1500)
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-8 lg:py-10 max-w-xl w-full">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#E2E1DE]">
        <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Write</h1>
        <p className="text-base text-[#888880] mt-1.5">
          Tell the AI what to write about. It generates a post for each selected channel and saves them to Drafts.
        </p>
      </div>

      {/* brief */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-[#111111] uppercase tracking-widest mb-2">
          What do you want to post about?
        </label>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="We're hosting an open lab day on July 5 — researchers can come see our CV pipeline demo in action."
          rows={4}
          className="w-full text-sm border border-[#E2E1DE] px-4 py-3 resize-none focus:outline-none focus:border-[#3A3A3A] bg-white leading-relaxed"
        />
        <p className="text-xs text-[#888880] mt-1.5">
          Event, announcement, thought, company news, milestone — anything works.
        </p>
      </div>

      {/* extra context */}
      <div className="mb-6">
        <button onClick={() => setShowCtx(v => !v)}
          className="text-xs text-[#888880] hover:text-[#111111] transition-colors underline underline-offset-2">
          {showCtx ? 'Hide extra context' : 'Add extra context (optional)'}
        </button>
        {showCtx && (
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Dates, speakers, links, key stats — anything the AI should include"
            rows={3}
            className="mt-2 w-full text-sm border border-[#E2E1DE] px-4 py-2.5 resize-none focus:outline-none focus:border-[#3A3A3A] bg-white leading-relaxed"
          />
        )}
      </div>

      {/* channel selector */}
      <div className="mb-8">
        <p className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-3">Generate for</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(ch => {
            const active = channels.includes(ch.id)
            return (
              <button key={ch.id} onClick={() => toggle(ch.id)}
                style={active ? { borderColor: ch.shade, color: '#FFFFFF', backgroundColor: ch.shade } : {}}
                className={`px-4 py-2 font-mono text-sm font-semibold border transition-colors ${
                  active ? '' : 'border-[#E2E1DE] text-[#888880] hover:border-[#3A3A3A] hover:text-[#111111]'
                }`}>
                {ch.label.toUpperCase()}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-[#888880] mt-2">One draft per channel, saved for your review in Drafts.</p>
      </div>

      {/* progress */}
      {progress.length > 0 && (
        <div className="mb-5 border border-[#E2E1DE] px-4 py-3 space-y-1 bg-[#FAFAF8]">
          {progress.map((line, i) => (
            <p key={i} className="font-mono text-xs text-[#888880]">{line}</p>
          ))}
        </div>
      )}

      {/* error */}
      {error && (
        <div className="mb-5 border border-[#E2E1DE] px-4 py-3">
          <p className="text-sm text-[#555555]">{error}</p>
        </div>
      )}

      {/* submit */}
      {done ? (
        <div className="flex items-center gap-3 border border-[#E2E1DE] px-5 py-4 bg-[#FAFAF8]">
          <span className="font-mono text-xs text-[#888880]">✓</span>
          <div>
            <p className="text-sm font-semibold text-[#111111]">Drafts saved</p>
            <p className="text-sm text-[#888880]">Taking you to Drafts…</p>
          </div>
        </div>
      ) : (
        <button onClick={generate} disabled={loading}
          className="w-full py-4 bg-[#111111] text-white text-sm font-semibold hover:bg-[#3A3A3A] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Generating…</>
            : 'Generate with AI'}
        </button>
      )}

    </div>
  )
}
