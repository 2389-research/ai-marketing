export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const ROOT   = path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

export async function POST(req: NextRequest) {
  const { video_url, segments, aspect_ratio, transcript_segments, captions, options } = await req.json()

  if (!video_url || !segments?.length) {
    return NextResponse.json({ error: 'video_url and segments are required' }, { status: 400 })
  }

  const captions_arg = captions && transcript_segments?.length
    ? JSON.stringify(transcript_segments)
    : 'false'

  const options_arg = options ? JSON.stringify(options) : '{}'

  return new Promise<NextResponse>(resolve => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(
      PYTHON,
      [
        path.join(ROOT, 'video_process.py'), 'batch_clip',
        video_url,
        JSON.stringify(segments),
        aspect_ratio,
        captions_arg,
        options_arg,
      ],
      { cwd: ROOT }
    )

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString()
      stderr += line
      // stream progress to server log
      process.stdout.write(line)
    })

    proc.on('close', (code: number) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: stderr.slice(-1500) }, { status: 500 }))
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        resolve(NextResponse.json(result))
      } catch {
        resolve(NextResponse.json({ error: 'Failed to parse batch clip output', raw: stdout }, { status: 500 }))
      }
    })
  })
}
