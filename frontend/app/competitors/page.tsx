'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, type Competitor, type CompetitorReport } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'

type LogLine = { id: number; text: string; isError: boolean }
let nextId = 0

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [report, setReport] = useState<CompetitorReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [newName, setNewName] = useState('')
  const [log, setLog] = useState<LogLine[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [competitorsRes, reportRes] = await Promise.all([
      fetch('/api/competitors').then(r => r.json()),
      (async () => {
        const pid = await resolveActiveProjectClient()
        const { data } = await scoped(
          supabase.from('competitor_reports').select('*').order('generated_at', { ascending: false }),
          pid
        ).limit(1).maybeSingle()
        return data
      })(),
    ])
    setCompetitors(Array.isArray(competitorsRes) ? competitorsRes : [])
    setReport(reportRes ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const addCompetitor = async () => {
    if (!newName.trim()) return
    await fetch('/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    setNewName('')
    load()
  }

  const removeCompetitor = async (id: string) => {
    await fetch('/api/competitors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const runScan = async () => {
    setLog([])
    setRunning(true)
    const addLine = (text: string, isError = false) =>
      setLog(prev => [...prev, { id: nextId++, text, isError }])
    addLine('Starting competitor scan…')

    try {
      const res = await fetch('/api/competitors/run', { method: 'POST' })
      if (!res.body) { addLine('No response stream', true); setRunning(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
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
            if (data.type === 'log') addLine(data.line, data.isError ?? false)
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setLog(prev => [...prev, { id: nextId++, text: `Stream error: ${err}`, isError: true }])
    }

    setRunning(false)
    await load()
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-6xl w-full mx-auto">

      <div className="mb-8 pb-6 border-b border-[#e6e6e6] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Competitors</h1>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
            Positioning synthesized from recent news &amp; Reddit mentions — not a live profile scan.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={running}
          className="shrink-0 px-4 py-2.5 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {running ? 'Scanning…' : 'Run competitor scan now'}
        </button>
      </div>

      {log.length > 0 && (
        <div className="mb-8 border border-[#e6e6e6] overflow-hidden rounded">
          <div
            ref={logRef}
            className="bg-[#1a2129] text-[#cccccc] text-xs leading-6 px-5 py-4 h-40 overflow-y-auto"
          >
            {log.map(l => (
              <div key={l.id} className={l.isError ? 'text-[#9a9a9a]' : ''}>{l.text}</div>
            ))}
            {running && <span className="text-[#3c3c3c] animate-pulse">▌</span>}
          </div>
        </div>
      )}

      {/* ── Tracked competitors ── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-4">Tracked Competitors</h2>

        <div className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCompetitor() }}
            placeholder="Add a competitor by name…"
            className="flex-1 px-3 py-2 text-sm border border-[#e6e6e6] rounded focus:outline-none focus:border-[#1c69d4]"
          />
          <button
            onClick={addCompetitor}
            className="px-4 py-2 text-sm font-semibold border border-[#e6e6e6] rounded hover:border-[#9a9a9a] transition-colors"
          >
            Add
          </button>
        </div>

        {!loading && competitors.length === 0 && (
          <p className="text-xs text-[#9a9a9a]">
            None yet — add one above, or run a scan and 2-4 will be inferred from your brand context.
          </p>
        )}

        {competitors.length > 0 && (
          <div className="border border-[#e6e6e6] rounded">
            {competitors.map((c, i) => (
              <div key={c.id} className={`flex items-center justify-between px-5 py-3 ${i < competitors.length - 1 ? 'border-b border-[#f7f7f7]' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm text-[#262626]">{c.name}</span>
                  {c.source === 'inferred' && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-[#e6e6e6] text-[#6b6b6b]">
                      inferred
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeCompetitor(c.id)}
                  className="text-xs text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Latest report ── */}
      {report && (
        <>
          <p className="text-xs text-[#9a9a9a] mb-6">
            Last scanned {fmtDate(report.generated_at)}
          </p>

          <section className="mb-10 space-y-4">
            {report.findings.competitors.map((c, i) => (
              <div key={i} className="border border-[#e6e6e6] rounded px-5 py-4">
                <h3 className="text-sm font-semibold text-[#262626] mb-2">{c.name}</h3>
                <p className="text-sm text-[#3c3c3c] leading-relaxed">{c.positioning_summary}</p>
                {c.notable_moves?.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {c.notable_moves.map((m, j) => (
                      <li key={j} className="text-xs text-[#3c3c3c] flex gap-2">
                        <span className="text-[#9a9a9a] shrink-0">·</span>{m}
                      </li>
                    ))}
                  </ul>
                )}
                {c.audience_reaction && (
                  <p className="text-xs text-[#6b6b6b] italic mt-2">{c.audience_reaction}</p>
                )}
              </div>
            ))}
          </section>

          {(report.findings.gaps?.length > 0 || report.findings.whitespace_angles?.length > 0) && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-4">Whitespace</h2>
              <div className="border border-[#e6e6e6] rounded px-5 py-4 space-y-4">
                {report.findings.whitespace_angles?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1.5">Angles to own</p>
                    <ul className="space-y-1">
                      {report.findings.whitespace_angles.map((a, i) => (
                        <li key={i} className="text-sm text-[#3c3c3c] flex gap-2">
                          <span className="text-[#9a9a9a] shrink-0">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.findings.gaps?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1.5">Gaps</p>
                    <ul className="space-y-1">
                      {report.findings.gaps.map((g, i) => (
                        <li key={i} className="text-sm text-[#3c3c3c] flex gap-2">
                          <span className="text-[#9a9a9a] shrink-0">·</span>{g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !report && (
        <div className="border border-[#e6e6e6] rounded px-5 py-8 text-center">
          <p className="text-sm font-semibold text-[#262626]">No scan yet</p>
          <p className="text-sm text-[#6b6b6b] mt-1">Run a scan to see competitor positioning and whitespace.</p>
        </div>
      )}

    </div>
  )
}
