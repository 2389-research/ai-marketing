export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const ROOT   = path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

// POST /api/drafts/[id]/post — publish this draft to its platform right now.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  return new Promise<NextResponse>(resolve => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(PYTHON, [path.join(ROOT, 'post_draft.py'), id], { cwd: ROOT })

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); process.stdout.write(d) })

    proc.on('close', () => {
      try {
        // The script prints one JSON line; take the last non-empty line.
        const line = stdout.trim().split('\n').filter(Boolean).pop() ?? '{}'
        const result = JSON.parse(line)
        const ok = result.status === 'posted'
        resolve(NextResponse.json(result, { status: ok ? 200 : 400 }))
      } catch {
        resolve(NextResponse.json(
          { status: 'error', error: stderr.slice(-500) || 'Could not parse poster output' },
          { status: 500 },
        ))
      }
    })
  })
}
