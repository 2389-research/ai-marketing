'use client'

import { useEffect, useRef, useState } from 'react'

type Mode = 'startover' | 'replace'

// Confirmation + live-progress dialog for "Start over" (wipe all unposted
// drafts, regenerate a fresh batch) and "Delete & replace" (delete selected
// drafts, generate that many new topics). Deleting the rows first is what makes
// the regeneration free to re-explore those topics — the strategy agent's
// avoid-list is built from the surviving pending/approved drafts + posted
// history, so a hard delete genuinely resets its memory of the bad batch.
export default function StartOverModal({
  mode, unpostedCount, postedCount, ids, onClose, onDone,
}: {
  mode: Mode
  unpostedCount: number      // startover: drafts that will be wiped
  postedCount: number        // shown as "survives"
  ids: string[]              // replace: the selected draft ids
  onClose: () => void
  onDone: () => void
}) {
  const [topics, setTopics]   = useState(mode === 'replace' ? Math.max(1, Math.min(ids.length, 8)) : 4)
  const [phase, setPhase]     = useState<'confirm' | 'running' | 'done' | 'error'>('confirm')
  const [log, setLog]         = useState<{ line: string; isError: boolean }[]>([])
  const [deleted, setDeleted] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  const addLine = (line: string, isError = false) =>
    setLog(l => [...l.slice(-400), { line, isError }])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  const run = async () => {
    setPhase('running')
    try {
      // 1. delete
      const delRes = await fetch('/api/drafts/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'startover' ? { scope: 'all_unposted' } : { ids }),
      })
      const delData = await delRes.json().catch(() => ({}))
      if (!delRes.ok) { addLine(delData.error ?? 'Delete failed', true); setPhase('error'); return }
      setDeleted(delData.deleted ?? 0)
      addLine(`✓ Deleted ${delData.deleted} draft${delData.deleted !== 1 ? 's' : ''} — the AI is now free to re-explore their topics`)
      addLine(`Generating ${topics} fresh topic${topics !== 1 ? 's' : ''} with your current rules…`)
      addLine('─'.repeat(46))

      // 2. regenerate (same pipeline as the Generate page's Full run — picks up
      //    current QA rules, brand profile, and strategy live)
      const res = await fetch('/api/pipeline/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics }),
      })
      if (!res.ok || !res.body) { addLine(`Error ${res.status}: ${res.statusText}`, true); setPhase('error'); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let exitCode = 0
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
            if (data.type === 'log')  addLine(data.line, data.isError ?? false)
            if (data.type === 'done') exitCode = data.code ?? 0
          } catch { /* skip malformed */ }
        }
      }
      addLine('─'.repeat(46))
      if (exitCode === 0) {
        addLine('✓ Fresh batch ready')
        setPhase('done')
      } else {
        addLine(`Run exited with code ${exitCode} — check the log above`, true)
        setPhase('error')
      }
    } catch (err: any) {
      addLine(err?.message ?? 'Unexpected error', true)
      setPhase('error')
    }
  }

  const title = mode === 'startover' ? 'Start over' : `Replace ${ids.length} draft${ids.length !== 1 ? 's' : ''}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={phase === 'running' ? undefined : onClose}>
      <div className="bg-white rounded border border-[#e6e6e6] w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f7f7f7]">
          <p className="text-base font-bold text-[#262626]">{title}</p>
          {phase !== 'running' && (
            <button onClick={onClose} className="text-[#9a9a9a] hover:text-[#262626] text-lg leading-none">×</button>
          )}
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {phase === 'confirm' && (
            <>
              {mode === 'startover' ? (
                <div className="text-sm text-[#3c3c3c] leading-relaxed mb-4">
                  <p>
                    This permanently deletes <strong>{unpostedCount} unposted draft{unpostedCount !== 1 ? 's' : ''}</strong> (pending,
                    needs-edit, rejected and approved-but-unposted) and generates a fresh batch using your <strong>current</strong> QA
                    rules, brand profile and strategy.
                  </p>
                  <p className="mt-2 text-[#6b6b6b] text-[13px]">
                    {postedCount > 0
                      ? `Your ${postedCount} posted draft${postedCount !== 1 ? 's' : ''} survive — the AI keeps avoiding topics you actually posted, but is free to redo everything it's deleting.`
                      : 'Nothing has been posted yet, so the AI starts with a completely clean slate.'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#3c3c3c] leading-relaxed mb-4">
                  Deletes the {ids.length} selected draft{ids.length !== 1 ? 's' : ''} and generates fresh topics to
                  replace them. The drafts you kept (and posted content) still steer the AI away from their topics —
                  the replacements will be different from what you kept, but free to re-explore what you deleted.
                </p>
              )}

              <label className="text-xs text-[#6b6b6b] uppercase tracking-widest">New topics to generate: {topics}</label>
              <input
                type="range" min={1} max={10} value={topics}
                onChange={e => setTopics(Number(e.target.value))}
                className="w-full mt-2 accent-[#1c69d4]"
              />
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={run}
                  className="px-4 py-2 text-sm font-semibold bg-[#DC2626] text-white rounded hover:bg-[#B91C1C] transition-colors">
                  {mode === 'startover' ? `Delete ${unpostedCount} & start over` : `Delete ${ids.length} & replace`}
                </button>
                <button onClick={onClose} className="text-sm text-[#6b6b6b] hover:text-[#262626] transition-colors">Cancel</button>
              </div>
            </>
          )}

          {phase !== 'confirm' && (
            <>
              <div ref={logRef}
                className="bg-[#101418] rounded p-3 h-72 overflow-y-auto font-mono text-[11.5px] leading-relaxed">
                {log.map((l, i) => (
                  <div key={i} className={l.isError ? 'text-[#f87171]' : 'text-[#d1d5db]'}>{l.line}</div>
                ))}
                {phase === 'running' && <div className="text-[#60a5fa] animate-pulse">▋</div>}
              </div>
              <div className="mt-4 flex items-center gap-3">
                {phase === 'running' && (
                  <p className="text-xs text-[#6b6b6b]">
                    Deleted {deleted} · generating — this takes a few minutes. Keep this open.
                  </p>
                )}
                {(phase === 'done' || phase === 'error') && (
                  <button
                    onClick={() => { onDone(); onClose() }}
                    className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white rounded hover:bg-[#0653b6] transition-colors">
                    {phase === 'done' ? 'See the new drafts' : 'Close'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
