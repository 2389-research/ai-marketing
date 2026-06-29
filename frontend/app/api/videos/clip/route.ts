export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const ROOT   = path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

export async function POST(req: NextRequest) {
  const { video_url, start, end, aspect_ratio, transcript_segments, captions } = await req.json()

  const captions_arg = captions && transcript_segments?.length
    ? JSON.stringify(transcript_segments)
    : 'false'

  return new Promise<NextResponse>(resolve => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(
      PYTHON,
      [
        path.join(ROOT, 'video_process.py'), 'clip',
        video_url,
        String(start),
        String(end),
        aspect_ratio,
        captions_arg,
      ],
      { cwd: ROOT }
    )

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: stderr.slice(-1000) }, { status: 500 }))
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        resolve(NextResponse.json(result))
      } catch {
        resolve(NextResponse.json({ error: 'Failed to parse clip output', raw: stdout }, { status: 500 }))
      }
    })
  })
}
