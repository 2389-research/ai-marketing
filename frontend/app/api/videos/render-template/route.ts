export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getActiveProject } from '@/lib/project-server'

// Rendering itself runs in the separate "renderer" process group (see
// frontend/render-server.mjs) on a scale-to-zero performance machine. This
// route just resolves the active project from the request cookie and forwards
// the job there via the app's flycast address. RENDERER_URL defaults to the
// local render-server for `npm run dev`.
const RENDERER_URL = process.env.RENDERER_URL ?? 'http://localhost:3002'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { headline, brandColor } = body as { headline?: string; brandColor?: string }

  if (!headline || !headline.trim()) {
    return NextResponse.json({ error: 'headline is required' }, { status: 400 })
  }

  const projectId = await getActiveProject()

  try {
    // No fetch timeout: a cold-start of the scale-to-zero renderer plus the
    // render can take a couple of minutes. The held-open connection is also
    // what keeps Fly from auto-stopping the renderer mid-job.
    const res = await fetch(`${RENDERER_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: headline.trim(), brandColor, projectId }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Render failed' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not reach the render service' },
      { status: 502 }
    )
  }
}
