'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { CHANNELS } from '@/lib/channels'

const CHANNEL_FILTERS = [{ id: 'all', label: 'All' }, ...CHANNELS]

// ── types ─────────────────────────────────────────────────────────────────────

type LogLine = { id: number; text: string; isError: boolean }

interface StrategyItem {
  topic:            string
  channels:         string[]
  format:           string
  why_it_fits:      string
  hook:             string
  key_points:       string[]
  source_title?:    string
  source_category?: string
  source_summary?:  string
  source_url?:      string
  _unmatched?:      boolean  // true if GPT couldn't find a matching research candidate
}

type Mode = 'config' | 'previewing' | 'reviewing' | 'generating' | 'done'

// ── constants ─────────────────────────────────────────────────────────────────

let nextId = 0

const CH: Record<string, { bg: string; fg: string }> = {
  linkedin:          { bg: '#DBEAFE', fg: '#1D4ED8' },
  instagram:         { bg: '#FCE7F3', fg: '#BE185D' },
  email:             { bg: '#FEF3C7', fg: '#B45309' },
  tiktok:            { bg: '#CCFBF1', fg: '#0F766E' },
  youtube:           { bg: '#FEE2E2', fg: '#DC2626' },
  x:                 { bg: '#f7f7f7', fg: '#1c69d4' },
  instagram_stories: { bg: '#CFFAFE', fg: '#0E7490' },
  pinterest:         { bg: '#F3E8FF', fg: '#7E22CE' },
  reddit:            { bg: '#F1F5F9', fg: '#334155' },
  threads:           { bg: '#DBEAFE', fg: '#1D4ED8' },
  youtube_shorts:    { bg: '#FCE7F3', fg: '#9D174D' },
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function streamLines(
  response: Response,
  onLog: (line: string, isError: boolean) => void,
  onStrategy?: (data: StrategyItem[]) => void,
): Promise<number> {
  if (!response.body) return 1
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  let exitCode  = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'log')      onLog(data.line, data.isError ?? false)
        if (data.type === 'done')     exitCode = data.code ?? 0
        if (data.type === 'strategy') onStrategy?.(data.data)
      } catch { /* skip malformed */ }
    }
  }
  return exitCode
}

// ── sub-components ────────────────────────────────────────────────────────────

function ChannelPill({ channel }: { channel: string }) {
  const c = CH[channel] ?? { bg: '#F5F4F1', fg: '#6b6b6b' }
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {channel}
    </span>
  )
}

function TopicCard({
  item,
  index,
  checked,
  onChange,
}: {
  item: StrategyItem
  index: number
  checked: boolean
  onChange: (i: number, v: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="border transition-colors cursor-pointer"
      style={{ borderColor: checked ? '#262626' : '#E2E1DE' }}
      onClick={() => onChange(index, !checked)}
    >
      {/* header row */}
      <div className="flex items-start gap-3 px-5 py-4">
        {/* checkbox */}
        <button
          className="mt-0.5 w-4 h-4 border shrink-0 flex items-center justify-center transition-colors"
          style={{
            borderColor:     checked ? '#262626' : '#9a9a9a',
            backgroundColor: checked ? '#262626' : 'transparent',
          }}
          onClick={e => { e.stopPropagation(); onChange(index, !checked) }}
          aria-label={checked ? 'Deselect' : 'Select'}
        >
          {checked && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {(item.channels ?? []).map(ch => (
              <ChannelPill key={ch} channel={ch} />
            ))}
            {item.format && (
              <span className="text-[10px] text-[#9a9a9a] uppercase tracking-wider">
                {item.format}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-[#262626] leading-snug">
            {item.topic}
          </p>

          {item._unmatched && (
            <p className="text-[10px] mt-1.5 uppercase tracking-wider"
               style={{ color: '#B45309' }}>
              ⚠ No source found — may be invented, not from research pool
            </p>
          )}

          {item.hook && (
            <p className="text-xs text-[#6b6b6b] mt-1.5 italic leading-relaxed">
              &ldquo;{item.hook}&rdquo;
            </p>
          )}
        </div>

        {/* expand toggle */}
        <button
          className="shrink-0 text-[10px] text-[#9a9a9a] hover:text-[#6b6b6b] mt-1 transition-colors"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* expanded details */}
      {expanded && (
        <div
          className="px-5 pb-4 border-t"
          style={{ borderColor: checked ? '#262626' : '#E2E1DE' }}
          onClick={e => e.stopPropagation()}
        >
          {item.key_points?.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-widest mb-1.5">
                Key points
              </p>
              <ul className="space-y-1">
                {item.key_points.map((pt, i) => (
                  <li key={i} className="text-xs text-[#3c3c3c] flex gap-2">
                    <span className="text-[#9a9a9a] shrink-0">·</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.why_it_fits && (
            <div className="mt-3">
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-widest mb-1">
                Why it fits
              </p>
              <p className="text-xs text-[#3c3c3c]">{item.why_it_fits}</p>
            </div>
          )}

          {item.source_title && (
            <div className="mt-3">
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-widest mb-1">
                Based on
              </p>
              <p className="text-xs text-[#6b6b6b]">
                {item.source_category && (
                  <span className="uppercase mr-1.5">[{item.source_category}]</span>
                )}
                {item.source_url
                  ? <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                       className="underline hover:text-[#262626]" onClick={e => e.stopPropagation()}>
                      {item.source_title}
                    </a>
                  : item.source_title
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LogTerminal({
  log,
  running,
  exitCode,
  onReset,
  label,
}: {
  log: LogLine[]
  running: boolean
  exitCode: number | null
  onReset?: () => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log])

  return (
    <div className="border border-[#e6e6e6] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e6e6e6] bg-[#f7f7f7]">
        <div className="flex items-center gap-2.5">
          {running
            ? <span className="w-1.5 h-1.5 rounded-full bg-[#6b6b6b] animate-pulse" />
            : <span className={`w-1.5 h-1.5 rounded-full ${exitCode === 0 ? 'bg-[#3c3c3c]' : 'bg-[#6b6b6b]'}`} />
          }
          <span className="text-xs text-[#6b6b6b] uppercase tracking-widest">
            {running ? `${label}…` : exitCode === 0 ? 'Done' : 'Finished with errors'}
          </span>
        </div>
        {!running && onReset && (
          <button onClick={onReset}
            className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
            ← Start over
          </button>
        )}
      </div>
      <div
        ref={ref}
        className="bg-[#1a2129] text-[#cccccc] text-xs leading-6 px-5 py-4 h-56 overflow-y-auto"
      >
        {log.map(l => (
          <div key={l.id} className={l.isError ? 'text-[#9a9a9a]' : ''}>
            {l.text}
          </div>
        ))}
        {running && <span className="text-[#3c3c3c] animate-pulse">▌</span>}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [topics,       setTopics]       = useState(5)
  const [channelCount, setChannelCount] = useState(6)
  const [mode,         setMode]         = useState<Mode>('config')
  const [log,          setLog]          = useState<LogLine[]>([])
  const [strategy,     setStrategy]     = useState<StrategyItem[]>([])
  const [selected,     setSelected]     = useState<boolean[]>([])
  const [exitCode,     setExitCode]     = useState<number | null>(null)
  const [channelFilter, setChannelFilter] = useState('all')

  useEffect(() => {
    fetch('/api/brand').then(r => r.json()).then(data => {
      const ch = data?.preferred_channels
      if (Array.isArray(ch) && ch.length > 0) setChannelCount(ch.length)
    }).catch(() => {})
  }, [])

  const addLine = (text: string, isError = false) =>
    setLog(prev => [...prev, { id: nextId++, text, isError }])

  const reset = () => {
    setMode('config')
    setLog([])
    setStrategy([])
    setSelected([])
    setExitCode(null)
    setChannelFilter('all')
  }

  const toggleSelected = (i: number, val: boolean) =>
    setSelected(prev => { const next = [...prev]; next[i] = val; return next })

  const selectedCount = selected.filter(Boolean).length
  const selectedItems = strategy.filter((_, i) => selected[i])

  // indices into `strategy` currently visible under the selected channel tab —
  // kept as original indices so `selected`/`toggleSelected` stay in sync
  const visibleIndices = strategy
    .map((_, i) => i)
    .filter(i => channelFilter === 'all' || strategy[i].channels?.includes(channelFilter))
  const visibleSelectedCount = visibleIndices.filter(i => selected[i]).length
  const channelCounts = CHANNEL_FILTERS.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = c.id === 'all'
      ? strategy.length
      : strategy.filter(s => s.channels?.includes(c.id)).length
    return acc
  }, {})

  // ── Run preview only ────────────────────────────────────────────────────────

  const runPreview = async () => {
    setLog([])
    setStrategy([])
    setSelected([])
    setExitCode(null)
    setChannelFilter('all')
    setMode('previewing')
    addLine(`Starting preview — ${topics} topic${topics !== 1 ? 's' : ''}`)
    addLine('─'.repeat(48))

    let strategyData: StrategyItem[] = []

    try {
      const res = await fetch('/api/pipeline/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topics }),
      })
      if (!res.ok || !res.body) {
        addLine(`Error ${res.status}: ${res.statusText}`, true)
        setMode('config')
        return
      }

      const code = await streamLines(
        res,
        addLine,
        (data) => { strategyData = data },
      )
      setExitCode(code)

      if (code === 0 && strategyData.length > 0) {
        setStrategy(strategyData)
        setSelected(strategyData.map(() => true)) // select all by default
        setMode('reviewing')
      } else {
        setMode('previewing') // stay on log if error
      }
    } catch (err) {
      addLine(`Stream error: ${err}`, true)
      setMode('config')
    }
  }

  // ── Generate from selected topics ──────────────────────────────────────────

  const runGenerate = async () => {
    if (selectedItems.length === 0) return
    setLog([])
    setExitCode(null)
    setMode('generating')
    addLine(`Writing content for ${selectedItems.length} topic${selectedItems.length !== 1 ? 's' : ''}`)
    addLine('─'.repeat(48))

    try {
      const res = await fetch('/api/pipeline/generate-selected', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: selectedItems }),
      })
      if (!res.ok || !res.body) {
        addLine(`Error ${res.status}: ${res.statusText}`, true)
        setMode('reviewing')
        return
      }

      const code = await streamLines(res, addLine)
      setExitCode(code)
      setMode('done')
    } catch (err) {
      addLine(`Stream error: ${err}`, true)
      setMode('reviewing')
    }
  }

  // ── Full run (skip preview) ─────────────────────────────────────────────────

  const runFull = async () => {
    setLog([])
    setExitCode(null)
    setMode('generating')
    addLine(`Full run — ${topics} topic${topics !== 1 ? 's' : ''}`)
    addLine('─'.repeat(48))

    try {
      const res = await fetch('/api/pipeline/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topics }),
      })
      if (!res.ok || !res.body) {
        addLine(`Error ${res.status}: ${res.statusText}`, true)
        setMode('config')
        return
      }

      const code = await streamLines(res, addLine)
      setExitCode(code)
      setMode('done')
    } catch (err) {
      addLine(`Stream error: ${err}`, true)
      setMode('config')
    }
  }

  const estimateLow  = topics
  const estimateHigh = topics * 2

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-2xl w-full mx-auto">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#e6e6e6]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Generate</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          Preview topics before committing, or run the full pipeline in one go.
        </p>
        <p className="text-sm text-[#9a9a9a] mt-1">
          Drafts are also written automatically on Monday and Thursday at 8am.
        </p>
      </div>

      {/* ── CONFIG ─────────────────────────────────────────────────────────── */}
      {mode === 'config' && (
        <div className="space-y-8">

          {/* topics slider */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-base font-semibold text-[#262626]">Topics</label>
              <span className="text-3xl font-semibold text-[#262626]">{topics}</span>
            </div>
            <input
              type="range" min={1} max={15} value={topics}
              onChange={e => setTopics(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[#9a9a9a] mt-2">
              <span>1</span>
              <span className="text-[#6b6b6b]">~{estimateLow}–{estimateHigh} posts total</span>
              <span>15</span>
            </div>
          </div>

          {/* how it works */}
          <div className="border border-[#e6e6e6] p-5 space-y-2">
            <p className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-3">
              How it works
            </p>
            {[
              ['Research',  'Already done — cron updates the pool every morning at 7am'],
              ['Strategy',  `Picks ${topics} topic${topics !== 1 ? 's' : ''} from the pool, assigns the best channel for each`],
              ['Write',     `Writes ~${estimateLow}–${estimateHigh} posts, one per topic per channel`],
              ['QA',        'Checks each post for quality, then saves to Drafts'],
            ].map(([step, desc]) => (
              <div key={step} className="flex gap-3 items-baseline">
                <span className="text-xs text-[#6b6b6b] uppercase tracking-wider w-16 shrink-0">{step}</span>
                <span className="text-sm text-[#3c3c3c]">{desc}</span>
              </div>
            ))}
          </div>

          {/* actions */}
          <div className="space-y-3">
            {/* primary: preview first */}
            <button
              onClick={runPreview}
              className="w-full py-4 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded transition-colors">
              Preview topics first →
            </button>

            {/* secondary: skip preview */}
            <button
              onClick={runFull}
              className="w-full py-3 border border-[#e6e6e6] text-[#6b6b6b] text-sm hover:border-[#9a9a9a] hover:text-[#3c3c3c] transition-colors">
              Skip preview — generate everything now
            </button>
          </div>

          <p className="text-xs text-[#9a9a9a] text-center -mt-4">
            Preview takes ~30s · Full run takes 1–3 min
          </p>
        </div>
      )}

      {/* ── PREVIEWING (log) ────────────────────────────────────────────────── */}
      {mode === 'previewing' && (
        <div className="space-y-5">
          <LogTerminal
            log={log}
            running={true}
            exitCode={exitCode}
            label="Selecting topics"
          />
          <p className="text-xs text-[#9a9a9a] text-center">
            Checking research pool and picking the best topics for your brand…
          </p>
        </div>
      )}

      {/* ── REVIEWING (strategy cards) ──────────────────────────────────────── */}
      {mode === 'reviewing' && (
        <div className="space-y-6">

          {/* section header */}
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#262626]">
                {strategy.length} topic{strategy.length !== 1 ? 's' : ''} selected by strategy
              </h2>
              <p className="text-sm text-[#6b6b6b] mt-0.5">
                Choose which ones to write content for.
              </p>
            </div>
            <button
              onClick={() => {
                const shouldSelect = visibleSelectedCount < visibleIndices.length
                setSelected(prev => {
                  const next = [...prev]
                  visibleIndices.forEach(i => { next[i] = shouldSelect })
                  return next
                })
              }}
              className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors shrink-0"
            >
              {visibleSelectedCount < visibleIndices.length ? 'Select all' : 'Clear all'}
            </button>
          </div>

          {/* channel filter tabs — a topic can appear under 2 tabs if it targets 2 channels */}
          <div className="flex flex-wrap gap-1.5 -mt-2">
            {CHANNEL_FILTERS.map(c => (
              <button
                key={c.id}
                onClick={() => setChannelFilter(c.id)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  channelFilter === c.id
                    ? 'border-[#262626] bg-[#262626] text-white font-semibold'
                    : 'border-[#e6e6e6] text-[#6b6b6b] hover:border-[#9a9a9a] hover:text-[#262626]'
                }`}>
                {c.label}{channelCounts[c.id] > 0 ? ` · ${channelCounts[c.id]}` : ''}
              </button>
            ))}
          </div>

          {/* cards */}
          <div className="space-y-2">
            {visibleIndices.map(i => (
              <TopicCard
                key={i}
                item={strategy[i]}
                index={i}
                checked={selected[i] ?? false}
                onChange={toggleSelected}
              />
            ))}
          </div>

          {/* log (collapsed) */}
          <details className="group">
            <summary className="text-xs text-[#9a9a9a] cursor-pointer hover:text-[#6b6b6b] transition-colors list-none">
              ▶ Show preview log
            </summary>
            <div className="mt-2 bg-[#1a2129] text-[#cccccc] text-xs leading-6 px-5 py-4 max-h-40 overflow-y-auto">
              {log.map(l => (
                <div key={l.id} className={l.isError ? 'text-[#9a9a9a]' : ''}>{l.text}</div>
              ))}
            </div>
          </details>

          {/* actions */}
          <div className="space-y-3 pt-2 border-t border-[#e6e6e6]">
            <button
              onClick={runGenerate}
              disabled={selectedCount === 0}
              className="w-full py-4 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              {selectedCount === 0
                ? 'Select at least one topic'
                : `Write content for ${selectedCount} topic${selectedCount !== 1 ? 's' : ''} →`}
            </button>
            <button
              onClick={reset}
              className="w-full py-3 border border-[#e6e6e6] text-[#6b6b6b] text-sm hover:border-[#9a9a9a] hover:text-[#3c3c3c] transition-colors">
              ← Start over
            </button>
          </div>
        </div>
      )}

      {/* ── GENERATING (log) ────────────────────────────────────────────────── */}
      {mode === 'generating' && (
        <div className="space-y-5">
          <LogTerminal
            log={log}
            running={true}
            exitCode={exitCode}
            label="Writing drafts"
          />
          <p className="text-xs text-[#9a9a9a] text-center">
            Generating posts and running QA checks…
          </p>
        </div>
      )}

      {/* ── DONE ────────────────────────────────────────────────────────────── */}
      {mode === 'done' && (
        <div className="space-y-5">
          <LogTerminal
            log={log}
            running={false}
            exitCode={exitCode}
            onReset={reset}
            label="Writing drafts"
          />

          {exitCode === 0 ? (
            <div className="border border-[#e6e6e6] px-6 py-5 flex items-center justify-between gap-4 bg-white">
              <div>
                <p className="text-sm font-semibold text-[#262626]">Drafts ready</p>
                <p className="text-sm text-[#6b6b6b] mt-0.5">
                  Review and approve them to schedule for publishing.
                </p>
              </div>
              <Link
                href="/drafts"
                className="shrink-0 px-5 py-2.5 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded transition-colors whitespace-nowrap">
                Review drafts →
              </Link>
            </div>
          ) : (
            <div className="border border-[#e6e6e6] px-6 py-5 bg-[#f7f7f7]">
              <p className="text-sm font-semibold text-[#262626] mb-1">Pipeline exited with errors</p>
              <p className="text-sm text-[#6b6b6b] mb-3">Check the log above. Common fixes:</p>
              <ul className="text-xs text-[#6b6b6b] space-y-1">
                <li>— Set BACKEND_PYTHON in frontend/.env.local to your venv Python path</li>
                <li>— Set OPENAI_API_KEY and Supabase keys in root .env</li>
              </ul>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
