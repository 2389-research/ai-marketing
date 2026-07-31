import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { checkAiSlop } from '@/lib/style-rules'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { topic, draft_text, channels } = await req.json()

  if (!topic || !draft_text || !channels?.length) {
    return NextResponse.json({ error: 'topic, draft_text, and channels are required' }, { status: 400 })
  }

  // Write-page drafts used to save with qa_passed: null — no QA state at all.
  // Run the same deterministic anti-AI-slop lint the pipeline's QA enforces,
  // so these cards show a real QA verdict and "✦ Fix issues" has something
  // to work with. (The pipeline's LLM tone/credibility checks stay
  // pipeline-only; this covers the mechanical style rules.)
  const lint = checkAiSlop(draft_text)
  const qaIssues = [...lint.issues, ...lint.warnings.map(w => `[WARNING] ${w}`)]

  const pid = await getActiveProject()
  const inserts = channels.map((channel: string) => stampRow({
    topic,
    channel,
    draft_text,
    qa_passed: lint.issues.length === 0,
    qa_issues: qaIssues,
    status: 'pending',
    notes: 'Manually written via dashboard',
  }, pid))

  const { data, error } = await supabase.from('generated_drafts').insert(inserts).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The slop lint above gives instant feedback; the FULL QA suite (custom
  // per-channel rules, LLM tone/credibility/clarity, char limits, duplicate
  // detection) runs detached and updates qa_passed/qa_issues when done — the
  // same treatment pipeline drafts get.
  try {
    const backendPath = process.env.BACKEND_PATH ?? path.join(process.cwd(), '..')
    const python      = process.env.BACKEND_PYTHON ?? 'python3'
    const ids = (data ?? []).map(d => d.id)
    if (ids.length > 0) {
      const proc = spawn(python, ['qa_draft.py', ...ids], {
        cwd: backendPath, env: { ...process.env }, detached: true, stdio: 'ignore',
      })
      proc.unref()
    }
  } catch { /* QA is best-effort here — never block the save */ }

  return NextResponse.json({ drafts: data })
}
