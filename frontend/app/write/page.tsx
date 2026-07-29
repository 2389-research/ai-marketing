'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CHANNELS, CH_COLOR } from '@/lib/channels'

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

  const [stage,         setStage]         = useState<'brief' | 'questions'>('brief')
  const [checkingBrief, setCheckingBrief]  = useState(false)
  const [questions,     setQuestions]     = useState<string[]>([])
  const [answers,       setAnswers]       = useState<string[]>([])

  const toggle = (id: string) =>
    setChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const startGenerate = async () => {
    if (!brief.trim())    { setError('Write something first.'); return }
    if (!channels.length) { setError('Pick at least one channel.'); return }
    setError('')
    setCheckingBrief(true)

    try {
      const res = await fetch('/api/drafts/check-brief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic: brief.trim(), context: context.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({ sufficient: true }))
      setCheckingBrief(false)

      if (data.sufficient === false && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions)
        setAnswers(data.questions.map(() => ''))
        setStage('questions')
        return
      }
    } catch {
      setCheckingBrief(false)
      // fail open — a broken triage call shouldn't block generation
    }

    generate()
  }

  const continueWithAnswers = () => {
    const answered = questions
      .map((q, i) => answers[i]?.trim() ? `${q}: ${answers[i].trim()}` : null)
      .filter(Boolean)
      .join('\n')
    const mergedContext = [context.trim(), answered].filter(Boolean).join('\n')
    setContext(mergedContext)
    setStage('brief')
    generate(mergedContext)
  }

  const skipQuestions = () => {
    setStage('brief')
    generate()
  }

  const generate = async (contextOverride?: string) => {
    if (!brief.trim())    { setError('Write something first.'); return }
    if (!channels.length) { setError('Pick at least one channel.'); return }
    const ctx = contextOverride ?? context
    setError('')
    setLoading(true)
    setProgress([])

    const results: { channel: string; text: string }[] = []

    for (const channel of channels) {
      setProgress(p => [...p, `Generating ${channel}…`])
      const res = await fetch('/api/drafts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic: brief.trim(), channel, context: ctx.trim() || undefined }),
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
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-xl lg:max-w-4xl w-full mx-auto">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#e6e6e6]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Write</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          Tell the AI what to write about. It generates a post for each selected channel and saves them to Drafts.
        </p>
      </div>

      {/* brief */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-[#262626] mb-2">
          What do you want to post about?
        </label>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="We're hosting an open lab day on July 5 — researchers can come see our CV pipeline demo in action."
          rows={4}
          className="w-full text-sm border border-[#e6e6e6] rounded px-4 py-3 resize-none focus:outline-none focus:border-[#1800ad] bg-white leading-relaxed"
        />
        <p className="text-xs text-[#6b6b6b] mt-1.5">
          Event, announcement, thought, company news, milestone — anything works.
        </p>
      </div>

      {/* extra context */}
      <div className="mb-6">
        <button onClick={() => setShowCtx(v => !v)}
          className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors underline underline-offset-2">
          {showCtx ? 'Hide extra context' : 'Add extra context (optional)'}
        </button>
        {showCtx && (
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Dates, speakers, links, key stats — anything the AI should include"
            rows={3}
            className="mt-2 w-full text-sm border border-[#e6e6e6] rounded px-4 py-2.5 resize-none focus:outline-none focus:border-[#1800ad] bg-white leading-relaxed"
          />
        )}
      </div>

      {/* channel selector */}
      <div className="mb-8">
        <p className="text-sm font-semibold text-[#262626] mb-3">Generate for</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(ch => {
            const active  = channels.includes(ch.id)
            const colors  = CH_COLOR[ch.id]
            return (
              <button
                key={ch.id}
                onClick={() => toggle(ch.id)}
                style={active && colors ? { backgroundColor: colors.bg, color: colors.text, borderColor: colors.bg } : {}}
                className={`px-4 py-2 text-sm font-semibold border rounded transition-colors ${
                  active
                    ? 'border-transparent'
                    : 'border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1800ad]'
                }`}
              >
                {ch.label}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-[#6b6b6b] mt-2">One draft per channel, saved for your review in Drafts.</p>
      </div>

      {/* progress */}
      {progress.length > 0 && (
        <div className="mb-5 border border-[#e6e6e6] rounded px-4 py-3 space-y-1 bg-[#f7f7f7]">
          {progress.map((line, i) => (
            <p key={i} className="text-xs text-[#6b6b6b]">{line}</p>
          ))}
        </div>
      )}

      {/* error */}
      {error && (
        <div className="mb-5 border border-[#FCA5A5] bg-[#FEF2F2] rounded px-4 py-3">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      )}

      {/* clarifying questions */}
      {stage === 'questions' && (
        <div className="mb-6 border border-[#e6e6e6] rounded px-4 py-4 bg-[#f7f7f7]">
          <p className="text-sm font-semibold text-[#262626] mb-1">A few quick details first</p>
          <p className="text-xs text-[#6b6b6b] mb-4">
            The brief is a little thin — answer any of these to get a more specific post, or skip and generate as-is.
          </p>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i}>
                <label className="block text-xs font-medium text-[#3c3c3c] mb-1">{q}</label>
                <input
                  value={answers[i] ?? ''}
                  onChange={e => setAnswers(a => a.map((v, idx) => idx === i ? e.target.value : v))}
                  className="w-full text-sm border border-[#e6e6e6] rounded px-3 py-2 focus:outline-none focus:border-[#1800ad] bg-white"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={continueWithAnswers} disabled={loading}
              className="flex-1 py-2.5 bg-[#1800ad] hover:bg-[#2f1ac9] text-white text-sm font-semibold rounded disabled:opacity-50 transition-colors">
              Continue
            </button>
            <button onClick={skipQuestions} disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-[#6b6b6b] hover:text-[#262626] transition-colors">
              Skip — just generate
            </button>
          </div>
        </div>
      )}

      {/* submit */}
      {done ? (
        <div className="flex items-center gap-3 border border-[#BBF7D0] bg-[#ECFDF5] rounded px-5 py-4">
          <span className="text-[#065F46] text-base">✓</span>
          <div>
            <p className="text-sm font-semibold text-[#262626]">Drafts saved</p>
            <p className="text-sm text-[#6b6b6b]">Taking you to Drafts…</p>
          </div>
        </div>
      ) : stage === 'brief' ? (
        <button onClick={startGenerate} disabled={loading || checkingBrief}
          className="w-full py-4 bg-[#1800ad] hover:bg-[#2f1ac9] text-white text-sm font-semibold rounded disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Generating…</>
            : checkingBrief
            ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Checking brief…</>
            : 'Generate with AI'}
        </button>
      ) : null}

    </div>
  )
}
