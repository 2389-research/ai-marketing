'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, type AuditReport } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'

// Performance analysis — formerly its own /performance page, now a section of
// the Audit page (the two answered halves of the same question: Audit = what's
// the current state, this = how is it performing and what should change).
// Reads the AI audit agent's reports (audit_reports) built from real
// published-post engagement the user logs via "Mark as posted".

type LogLine = { id: number; text: string; isError: boolean }
let nextId = 0

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function labelColor(label: string) {
  if (label === 'above typical') return '#0F766E'
  if (label === 'below typical') return '#B45309'
  return '#6b6b6b'
}

export default function PerformanceSection() {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const loadLatest = async () => {
    const pid = await resolveActiveProjectClient()
    const { data } = await scoped(
      supabase.from('audit_reports').select('*').order('created_at', { ascending: false }),
      pid
    ).limit(1).maybeSingle()
    setReport(data ?? null)
    setLoading(false)
  }

  useEffect(() => { loadLatest() }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const runAudit = async () => {
    setLog([])
    setRunning(true)
    const addLine = (text: string, isError = false) =>
      setLog(prev => [...prev, { id: nextId++, text, isError }])
    addLine('Starting analysis…')

    try {
      const res = await fetch('/api/performance/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      })
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
    await loadLatest()
  }

  const findings = report?.findings
  const channels = findings ? Object.entries(findings.channels ?? {}) : []

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-1.5">
        <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest">Performance</h2>
        <button
          onClick={runAudit}
          disabled={running}
          className="shrink-0 px-3 py-1.5 bg-[#1800ad] text-[#d5d5d5] text-xs font-semibold hover:bg-[#2f1ac9] rounded transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {running ? 'Running…' : 'Run analysis'}
        </button>
      </div>
      <p className="text-xs text-[#9a9a9a] mb-4">
        Cadence, content mix, and relative engagement — computed from the posts you logged with likes/comments.
      </p>

      {log.length > 0 && (
        <div className="mb-6 border border-[#b3b3b3] overflow-hidden rounded">
          <div
            ref={logRef}
            className="bg-[#1a2129] text-[#a6a6a6] text-xs leading-6 px-5 py-4 h-40 overflow-y-auto"
          >
            {log.map(l => (
              <div key={l.id} className={l.isError ? 'text-[#9a9a9a]' : ''}>{l.text}</div>
            ))}
            {running && <span className="text-[#3c3c3c] animate-pulse">▌</span>}
          </div>
        </div>
      )}

      {loading && <p className="text-xs text-[#9a9a9a]">Loading…</p>}

      {!loading && !report && (
        <div className="border border-[#b3b3b3] rounded px-5 py-8 text-center">
          <p className="text-sm font-semibold text-[#262626]">No analysis yet</p>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Run one once you have posted content with logged engagement (likes/comments on &ldquo;Mark as posted&rdquo;).
          </p>
        </div>
      )}

      {!loading && report && (
        <>
          <p className="text-xs text-[#9a9a9a] mb-4">
            {fmtDate(report.period_start)} – {fmtDate(report.period_end)} · generated {fmtDate(report.created_at)}
          </p>

          <div className="space-y-4 mb-6">
            {channels.map(([channel, f]) => (
              <div key={channel} className="border border-[#b3b3b3] rounded px-5 py-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#262626] uppercase tracking-widest">{channel}</h3>
                  <span className="text-xs" style={{ color: labelColor(f.engagement.label) }}>
                    {f.engagement.label}
                    {f.engagement.median_percentile_this_period != null &&
                      ` · p${Math.round(f.engagement.median_percentile_this_period)}`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b]">Cadence</p>
                    <p className="text-sm text-[#262626]">
                      {f.cadence_actual_per_week}/wk actual vs {f.cadence_target_per_week || '—'}/wk target
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b]">Posts this period</p>
                    <p className="text-sm text-[#262626]">{f.posts_in_period}</p>
                  </div>
                </div>

                {Object.keys(f.content_mix_by_format ?? {}).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1.5">Format mix</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(f.content_mix_by_format).map(([fmt, n]) => (
                        <span key={fmt} className="text-[10px] px-2 py-0.5 border border-[#b3b3b3] text-[#3c3c3c]">
                          {fmt} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {f.hook_patterns && (
                  <div className="mt-3 pt-3 border-t border-[#c9c9c9] space-y-1.5">
                    {f.hook_patterns.top_pattern && (
                      <p className="text-xs text-[#3c3c3c]"><span className="text-[#6b6b6b] mr-1.5">TOP:</span>{f.hook_patterns.top_pattern}</p>
                    )}
                    {f.hook_patterns.bottom_pattern && (
                      <p className="text-xs text-[#3c3c3c]"><span className="text-[#6b6b6b] mr-1.5">BOTTOM:</span>{f.hook_patterns.bottom_pattern}</p>
                    )}
                    {f.hook_patterns.hypothesis && (
                      <p className="text-xs text-[#6b6b6b] italic">{f.hook_patterns.hypothesis}</p>
                    )}
                    {f.hook_patterns.sample_note && (
                      <p className="text-[10px] text-[#9a9a9a]">{f.hook_patterns.sample_note}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {findings && findings.recommendations?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-2">Recommendations — these feed straight back into generation</p>
              <div className="border border-[#b3b3b3] rounded">
                {findings.recommendations.map((rec, i) => (
                  <div key={i} className={`px-5 py-3.5 ${i < findings.recommendations.length - 1 ? 'border-b border-[#c9c9c9]' : ''}`}>
                    <p className="text-sm text-[#3c3c3c] leading-snug">
                      <span className="text-[#9a9a9a] mr-3">→</span>
                      {rec}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
