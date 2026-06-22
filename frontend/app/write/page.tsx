'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  cls: 'bg-blue-100 border-blue-400 text-blue-800'   },
  { id: 'instagram', label: 'Instagram', cls: 'bg-pink-100 border-pink-400 text-pink-800'   },
  { id: 'email',     label: 'Email',     cls: 'bg-amber-100 border-amber-400 text-amber-800' },
  { id: 'tiktok',    label: 'TikTok',   cls: 'bg-cyan-100 border-cyan-400 text-cyan-800'    },
  { id: 'youtube',   label: 'YouTube',  cls: 'bg-red-100 border-red-400 text-red-800'       },
  { id: 'x',         label: 'X',        cls: 'bg-gray-900 border-gray-900 text-white'        },
]

const INACTIVE = 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'

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

    // Save all generated drafts
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
    <div className="px-8 py-8 max-w-xl">

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Write</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Tell the AI what to write about — it generates a post for each channel and saves them to Drafts.
          To post on a specific date, go to the <a href="/" className="text-blue-500 hover:underline">Dashboard calendar</a>.
        </p>
      </div>

      {/* brief */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          What do you want to post about?
        </label>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="We're hosting an open lab day on July 5 — researchers can come see our CV pipeline demo in action."
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white leading-relaxed"
        />
        <p className="text-xs text-gray-400 mt-1">
          Anything works — event, announcement, thought, company news, milestone.
        </p>
      </div>

      {/* extra context */}
      <div className="mb-5">
        <button onClick={() => setShowCtx(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-700 underline">
          {showCtx ? '↑ Hide extra context' : '+ Add extra context (optional)'}
        </button>
        {showCtx && (
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Dates, speakers, links, key stats — anything extra the AI should include"
            rows={3}
            className="mt-2 w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        )}
      </div>

      {/* channel selector */}
      <div className="mb-7">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Generate for</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => toggle(ch.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl border-2 transition-colors ${
                channels.includes(ch.id) ? ch.cls : INACTIVE
              }`}>
              {ch.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">One draft per channel, saved for your review in Drafts.</p>
      </div>

      {/* progress log */}
      {progress.length > 0 && (
        <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1">
          {progress.map((line, i) => (
            <p key={i} className="text-xs font-mono text-gray-600">{line}</p>
          ))}
        </div>
      )}

      {/* error */}
      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* submit */}
      {done ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <span className="text-green-600 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Drafts saved</p>
            <p className="text-xs text-green-600">Taking you to Drafts to review…</p>
          </div>
        </div>
      ) : (
        <button onClick={generate} disabled={loading}
          className="w-full py-3.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Generating…</>
            : '✨ Generate with AI'}
        </button>
      )}

    </div>
  )
}
