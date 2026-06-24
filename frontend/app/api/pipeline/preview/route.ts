import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { topics = 5 } = await req.json()

  const backendPath = process.env.BACKEND_PATH ?? path.join(process.cwd(), '..')
  const python      = process.env.BACKEND_PYTHON ?? 'python3'
  const encoder     = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const proc = spawn(
        python,
        ['preview.py', '--topics', String(topics)],
        { cwd: backendPath, env: { ...process.env } }
      )

      proc.stdout.on('data', (buf: Buffer) => {
        buf.toString().split('\n').forEach(raw => {
          const line = raw.trim()
          if (!line) return

          if (line.startsWith('STRATEGY_JSON:')) {
            // Parse the structured strategy data and send as a special event
            try {
              const data = JSON.parse(line.slice('STRATEGY_JSON:'.length))
              send({ type: 'strategy', data })
            } catch {
              send({ type: 'log', line: '[preview] Failed to parse strategy output', isError: true })
            }
          } else {
            send({ type: 'log', line, isError: false })
          }
        })
      })

      proc.stderr.on('data', (buf: Buffer) => {
        buf.toString().split('\n').forEach(line => {
          if (line.trim()) send({ type: 'log', line: line.trim(), isError: true })
        })
      })

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
