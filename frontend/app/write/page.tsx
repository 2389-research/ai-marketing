'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ── constants ─────────────────────────────────────────────────────────────────

const POST_TYPES = [
  { label: 'Company update',    placeholder: "We just shipped / launched / hit a milestone..." },
  { label: 'Holiday / wish',    placeholder: "Happy [holiday] from the 2389 Research team..." },
  { label: 'Behind the scenes', placeholder: "A look at what we've been working on lately..." },
  { label: 'Announcement',      placeholder: "We are excited to share..." },
  { label: 'Other',             placeholder: "Write your post here..." },
]

const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  active: 'bg-blue-100 border-blue-400 text-blue-800',  inactive: 'border-gray-200 text-gray-400' },
  { id: 'instagram', label: 'Instagram', active: 'bg-pink-100 border-pink-400 text-pink-800',  inactive: 'border-gray-200 text-gray-400' },
  { id: 'email',     label: 'Email',     active: 'bg-amber-100 border-amber-400 text-amber-800', inactive: 'border-gray-200 text-gray-400' },
  { id: 'tiktok',    label: 'TikTok',   active: 'bg-cyan-100 border-cyan-400 text-cyan-800',   inactive: 'border-gray-200 text-gray-400' },
]

const GEN_TABS = CHANNELS.map(c => ({ id: c.id, label: c.label.slice(0, 2).toUpperCase() }))

// ── page ──────────────────────────────────────────────────────────────────────

export default function WritePage() {
  const router = useRouter()

  // form state
  const [postType, setPostType]     = useState(POST_TYPES[0])
  const [topic, setTopic]           = useState('')
  const [text, setText]             = useState('')
  const [selected, setSelected]     = useState(['linkedin', 'instagram'])
  const [genFor, setGenFor]         = useState('linkedin')
  const [context, setContext]       = useState('')
  const [showCtx, setShowCtx]       = useState(false)
  const [generatedFor, setGeneratedFor] = useState<string | null>(null)

  // async state
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  const toggleChannel = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  // ── AI generate ──────────────────────────────────────────────────────────────

  const generate = async () => {
    if (!topic.trim()) { setError('Enter a topic first.'); return }
    setError('')
    setGenerating(true)
    setGeneratedFor(null)

    const res = await fetch('/api/drafts/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic: topic.trim(), channel: genFor, context: context.trim() || undefined }),
    })

    setGenerating(false)

    if (res.ok) {
      const { text: generated } = await res.json()
      setText(generated)
      setGeneratedFor(genFor)
    } else {
      const { error: msg } = await res.json().catch(() => ({}))
      setError(msg ?? 'AI generation failed. Check that OPENAI_API_KEY is set.')
    }
  }

  // ── submit ───────────────────────────────────────────────────────────────────

  const submit = async () => {
    if (!topic.trim())        { setError('Topic is required.'); return }
    if (!text.trim())         { setError('Content is required.'); return }
    if (!selected.length)     { setError('Select at least one channel.'); return }

    setError('')
    setSubmitting(true)

    const res = await fetch('/api/drafts/compose', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic: topic.trim(), draft_text: text.trim(), channels: selected }),
    })

    setSubmitting(false)

    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push('/drafts'), 1200)
    } else {
      const { error: msg } = await res.json().catch(() => ({}))
      setError(msg ?? 'Something went wrong.')
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8 max-w-2xl">

      {/* header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Write</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Compose a post manually or let AI draft it for you — then send it to Drafts for approval.
        </p>
      </div>

      {/* post type */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Type</p>
        <div className="flex flex-wrap gap-2">
          {POST_TYPES.map(pt => (
            <button key={pt.label} onClick={() => setPostType(pt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                postType.label === pt.label
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'
              }`}>
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      {/* topic */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Topic / Event
        </label>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. 2389 Research open lab day on July 5"
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
      </div>

      {/* AI generation panel */}
      <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-semibold text-indigo-800">✨ AI Generation</p>
            <p className="text-xs text-indigo-500 mt-0.5">
              Writes a channel-optimised post based on your topic
            </p>
          </div>
          {/* generate-for tabs */}
          <div className="flex bg-white rounded-lg border border-indigo-200 overflow-hidden shrink-0">
            {GEN_TABS.map(t => (
              <button key={t.id} onClick={() => setGenFor(t.id)}
                className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                  genFor === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-500 hover:bg-indigo-100'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* optional context */}
        <button
          onClick={() => setShowCtx(v => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-700 underline mb-3">
          {showCtx ? '↑ Hide context' : '+ Add event details / extra context'}
        </button>

        {showCtx && (
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Date, location, speakers, key messages, links — anything the AI should know"
            rows={3}
            className="w-full text-sm border border-indigo-200 rounded-xl px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
        )}

        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {generating
            ? <><span className="animate-spin inline-block">⟳</span> Generating…</>
            : <>✨ Generate with AI</>}
        </button>

        {generatedFor && !generating && (
          <p className="text-xs text-indigo-400 mt-2">
            Generated for <span className="font-semibold capitalize">{generatedFor}</span> — edit below or re-generate for a different channel
          </p>
        )}
      </div>

      {/* content */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Content{generatedFor ? ` — AI draft for ${generatedFor}` : ''}
          </label>
          <span className="text-xs text-gray-400">{text.length} chars</span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={postType.placeholder}
          rows={9}
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white leading-relaxed"
        />
      </div>

      {/* channel selector */}
      <div className="mb-7">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Post to</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => toggleChannel(ch.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl border-2 transition-colors ${
                selected.includes(ch.id) ? ch.active : ch.inactive
              }`}>
              {ch.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Creates one draft per selected channel</p>
      </div>

      {/* error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* submit */}
      {success ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <span className="text-green-600 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Saved to Drafts</p>
            <p className="text-xs text-green-600">Redirecting you to review it…</p>
          </div>
        </div>
      ) : (
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : 'Submit for Approval'}
        </button>
      )}

    </div>
  )
}
