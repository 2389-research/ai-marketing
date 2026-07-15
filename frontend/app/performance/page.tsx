'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, type AuditReport } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'

// Deliberately not /audit — that route already exists as "Presence Audit"
// (setup completeness). This is performance auditing: real engagement data.

type LogLine = { id: number; text: string; isError: boolean }
let nextId = 0

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function labelColor(label: string) {
  if (label === 'above typical') return '#0F766E'
  if (label === 'below typical') return '#B45309'
  return '#888880'
}

export default function PerformancePage() {
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
    addLine('Starting audit…')

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
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-3xl w-full">

      <div className="mb-8 pb-6 border-b border-[#EBEBEB] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#09090B] tracking-tight">Performance</h1>
          <p className="text-[13.5px] text-[#71717A] mt-1.5">
            Cadence, content mix, and relative engagement — computed from real published-post data.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={running}
          className="shrink-0 px-4 py-2.5 bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6D28D9] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {running ? 'Running…' : 'Run audit now'}
        </button>
      </div>

      {log.length > 0 && (
        <div className="mb-8 border border-[#EBEBEB] overflow-hidden rounded-xl">
          <div
            ref={logRef}
            className="bg-[#0D0D0F] text-[#E0DDD6] font-mono text-xs leading-6 px-5 py-4 h-40 overflow-y-auto"
          >
            {log.map(l => (
              <div key={l.id} className={l.isError ? 'text-[#999999]' : ''}>{l.text}</div>
            ))}
            {running && <span className="text-[#555555] animate-pulse">▌</span>}
          </div>
        </div>
      )}

      {loading && <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>}

      {!loading && !report && (
        <div className="border border-[#EBEBEB] rounded-xl px-5 py-8 text-center">
          <p className="text-sm font-semibold text-[#111111]">No audit yet</p>
          <p className="text-sm text-[#888880] mt-1">
            Run an audit once you have published posts with engagement data.
          </p>
        </div>
      )}

      {!loading && report && (
        <>
          <p className="font-mono text-xs text-[#BBBBBB] mb-6">
            {fmtDate(report.period_start)} – {fmtDate(report.period_end)} · generated {fmtDate(report.created_at)}
          </p>

          <div className="space-y-6 mb-10">
            {channels.map(([channel, f]) => (
              <section key={channel} className="border border-[#EBEBEB] rounded-xl px-5 py-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest">{channel}</h2>
                  <span className="font-mono text-xs" style={{ color: labelColor(f.engagement.label) }}>
                    {f.engagement.label}
                    {f.engagement.median_percentile_this_period != null &&
                      ` · p${Math.round(f.engagement.median_percentile_this_period)}`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880]">Cadence</p>
                    <p className="font-mono text-sm text-[#111111]">
                      {f.cadence_actual_per_week}/wk actual vs {f.cadence_target_per_week || '—'}/wk target
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880]">Posts this period</p>
                    <p className="font-mono text-sm text-[#111111]">{f.posts_in_period}</p>
                  </div>
                </div>

                {Object.keys(f.content_mix_by_format ?? {}).length > 0 && (
                  <div className="mb-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880] mb-1.5">Format mix</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(f.content_mix_by_format).map(([fmt, n]) => (
                        <span key={fmt} className="font-mono text-[10px] px-2 py-0.5 border border-[#EBEBEB] text-[#555555]">
                          {fmt} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {f.hook_patterns && (
                  <div className="mt-3 pt-3 border-t border-[#F3F4F6] space-y-1.5">
                    {f.hook_patterns.top_pattern && (
                      <p className="text-xs text-[#555555]"><span className="text-[#888880] font-mono mr-1.5">TOP:</span>{f.hook_patterns.top_pattern}</p>
                    )}
                    {f.hook_patterns.bottom_pattern && (
                      <p className="text-xs text-[#555555]"><span className="text-[#888880] font-mono mr-1.5">BOTTOM:</span>{f.hook_patterns.bottom_pattern}</p>
                    )}
                    {f.hook_patterns.hypothesis && (
                      <p className="text-xs text-[#888880] italic">{f.hook_patterns.hypothesis}</p>
                    )}
                    {f.hook_patterns.sample_note && (
                      <p className="font-mono text-[10px] text-[#BBBBBB]">{f.hook_patterns.sample_note}</p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>

          {findings && findings.recommendations?.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-4">Recommendations</h2>
              <div className="border border-[#EBEBEB] rounded-xl">
                {findings.recommendations.map((rec, i) => (
                  <div key={i} className={`px-5 py-3.5 ${i < findings.recommendations.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                    <p className="text-sm text-[#555555] leading-snug">
                      <span className="font-mono text-[#BBBBBB] mr-3">→</span>
                      {rec}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
