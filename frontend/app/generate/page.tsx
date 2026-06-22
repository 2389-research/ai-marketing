'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

const CHANNEL_TAGS = ['LinkedIn', 'Instagram', 'Email', 'TikTok', 'YouTube', 'X']

type LogLine = { id: number; text: string; isError: boolean }

let nextId = 0

export default function GeneratePage() {
  const [topics, setTopics]     = useState(5)
  const [running, setRunning]   = useState(false)
  const [done, setDone]         = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [log, setLog]           = useState<LogLine[]>([])
  const logRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const addLine = (text: string, isError = false) =>
    setLog(prev => [...prev, { id: nextId++, text, isError }])

  const reset = () => { setDone(false); setLog([]); setExitCode(null) }

  const run = async () => {
    reset()
    setRunning(true)
    addLine(`⚡ Starting pipeline — ${topics} topic${topics !== 1 ? 's' : ''}, all channels`)
    addLine('─'.repeat(52))

    try {
      const res = await fetch('/api/pipeline/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topics }),
      })

      if (!res.ok || !res.body) {
        addLine(`HTTP error ${res.status}: ${res.statusText}`, true)
        setRunning(false)
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'log')  addLine(data.line, data.isError)
            if (data.type === 'done') { setExitCode(data.code); setDone(true) }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      addLine(`Stream error: ${err}`, true)
    } finally {
      setRunning(false)
    }
  }

  const estimate = topics * 5

  return (
    <div className="px-8 py-8 max-w-3xl">

      {/* header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Generate</h1>
        <p className="text-sm text-gray-500 mt-1">
          Research trending topics, write posts for every channel, run QA, and schedule — all automatically.
        </p>
      </div>

      {/* config panel — hidden while running or done */}
      {!running && !done && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-6">Configuration</p>

          {/* topics slider */}
          <div className="mb-7">
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-sm font-semibold text-gray-800">Topics to research</label>
              <span className="text-2xl font-bold text-blue-600">{topics}</span>
            </div>
            <input
              type="range" min={1} max={15} value={topics}
              onChange={e => setTopics(Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>1 topic</span>
              <span className="text-gray-500 font-medium">~{estimate} posts total</span>
              <span>15 topics</span>
            </div>
          </div>

          {/* channels info */}
          <div className="mb-7">
            <p className="text-sm font-semibold text-gray-800 mb-3">Channels</p>
            <div className="flex gap-2">
              {CHANNEL_TAGS.map(ch => (
                <span key={ch}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                  {ch}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              AI adapts tone and format for each channel automatically.
            </p>
          </div>

          {/* schedule info */}
          <div className="mb-7 p-4 bg-blue-50 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1">How scheduling works</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Each post gets assigned an optimal time slot for its channel — LinkedIn Tue–Thu mornings,
              Instagram midday and evenings, Email Tuesday/Thursday, TikTok evenings.
              Posts are spaced so no two go out on the same day for the same channel.
              YouTube gets a full video script. The AI picks the right channels per topic based on your brand.
            </p>
          </div>

          {/* run button */}
          <button
            onClick={run}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors">
            <span className="text-lg">⚡</span>
            Generate content for next month
          </button>
          <p className="text-xs text-gray-400 text-center mt-2.5">
            Researches trends · writes {estimate} posts · runs QA · schedules automatically.
            Takes 1–3 minutes.
          </p>
        </div>
      )}

      {/* live log */}
      {(running || done) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5">

          {/* log header bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2.5">
              {running
                ? <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                : <span className={`w-2 h-2 rounded-full ${exitCode === 0 ? 'bg-green-500' : 'bg-red-500'}`} />
              }
              <span className="text-xs font-semibold text-gray-600">
                {running
                  ? 'Pipeline running…'
                  : exitCode === 0 ? 'Completed successfully' : 'Finished with errors'}
              </span>
            </div>
            {done && (
              <button onClick={reset}
                className="text-xs text-gray-400 hover:text-gray-700 font-medium">
                ← Run again
              </button>
            )}
          </div>

          {/* terminal output */}
          <div
            ref={logRef}
            className="bg-[#0d1117] text-[#e6edf3] font-mono text-xs leading-6 px-5 py-4 h-80 overflow-y-auto">
            {log.map(l => (
              <div key={l.id}
                className={l.isError ? 'text-red-400' : 'text-[#e6edf3]'}>
                {l.text}
              </div>
            ))}
            {running && <span className="text-gray-500 animate-pulse">▌</span>}
          </div>
        </div>
      )}

      {/* completion banner */}
      {done && exitCode === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-green-800">Pipeline finished ✓</p>
            <p className="text-xs text-green-600 mt-0.5">
              New drafts are waiting for your review — approve them here or in Slack.
            </p>
          </div>
          <Link href="/drafts"
            className="shrink-0 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors whitespace-nowrap">
            Review drafts →
          </Link>
        </div>
      )}

      {done && exitCode !== 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-4">
          <p className="text-sm font-bold text-red-800">Pipeline exited with errors</p>
          <p className="text-xs text-red-600 mt-1">
            Check the log above. Common fixes:
          </p>
          <ul className="text-xs text-red-500 mt-1 space-y-0.5 list-disc list-inside">
            <li>Set <code className="bg-red-100 px-1 rounded">BACKEND_PYTHON</code> in <code className="bg-red-100 px-1 rounded">frontend/.env.local</code> to your venv Python path</li>
            <li>Make sure <code className="bg-red-100 px-1 rounded">OPENAI_API_KEY</code> and Supabase keys are set in the root <code className="bg-red-100 px-1 rounded">.env</code></li>
          </ul>
        </div>
      )}

    </div>
  )
}
