import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const body = await req.json().catch(() => ({}))
  const feedback: string = body.feedback ?? ''

  const backendPath = process.env.BACKEND_PATH ?? path.join(process.cwd(), '..')
  const python      = process.env.BACKEND_PYTHON ?? 'python3'

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(
      python,
      ['regenerate_draft.py'],
      { cwd: backendPath, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    // Pass draft_id + feedback via stdin so user content is never shell-injected
    proc.stdin.write(JSON.stringify({ draft_id: id, feedback }))
    proc.stdin.end()

    let stdout = '', stderr = ''
    proc.stdout.on('data', (b: Buffer) => { stdout += b.toString() })
    proc.stderr.on('data', (b: Buffer) => { stderr += b.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, log: stdout.trim() }))
      } else {
        resolve(NextResponse.json(
          { error: stderr.trim() || `Process exited with code ${code}` },
          { status: 500 }
        ))
      }
    })

    proc.on('error', (err) => {
      resolve(NextResponse.json({ error: err.message }, { status: 500 }))
    })
  })
}
