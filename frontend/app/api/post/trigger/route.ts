export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const ROOT = path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

export async function POST() {
  return new Promise<NextResponse>(resolve => {
    const proc = spawn(PYTHON, [path.join(ROOT, 'cron_post.py')], { cwd: ROOT })
    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', (code: number) => {
      if (code === 0) resolve(NextResponse.json({ ok: true, log: output }))
      else resolve(NextResponse.json({ error: output.slice(-500) }, { status: 500 }))
    })
  })
}
