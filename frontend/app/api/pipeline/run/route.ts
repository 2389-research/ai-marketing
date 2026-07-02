import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getActiveProject } from '@/lib/project-server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { topics = 5 } = await req.json()

  const backendPath = process.env.BACKEND_PATH ?? path.join(process.cwd(), '..')
  const python      = process.env.BACKEND_PYTHON ?? 'python3'
  const encoder     = new TextEncoder()
  const pid         = await getActiveProject()
  const args        = ['run.py', '--auto', '--topics', String(topics)]
  if (pid) args.push('--project-id', pid)

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const proc = spawn(
        python,
        args,
        { cwd: backendPath, env: { ...process.env } }
      )

      const pipe = (buf: Buffer, isError = false) =>
        buf.toString().split('\n').forEach(line => {
          if (line.trim()) send({ type: 'log', line: line.trim(), isError })
        })

      proc.stdout.on('data', d => pipe(d))
      proc.stderr.on('data', d => pipe(d, true))

      proc.on('error', err => {
        send({ type: 'log', line: `Failed to start Python: ${err.message}`, isError: true })
        send({ type: 'log', line: `Check BACKEND_PYTHON in .env.local (current: ${python})`, isError: true })
        send({ type: 'done', code: 1 })
        controller.close()
      })

      proc.on('close', code => {
        send({ type: 'done', code: code ?? 1 })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
    },
  })
}
