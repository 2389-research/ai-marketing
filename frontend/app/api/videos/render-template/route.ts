export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getActiveProject } from '@/lib/project-server'
import { storyboardSchema } from '@/remotion/storyboard'

// Rendering itself runs in the separate "renderer" process group (see
// frontend/render-server.mjs) on a scale-to-zero performance machine. This
// route just resolves the active project from the request cookie and forwards
// the job there via the app's flycast address. RENDERER_URL defaults to the
// local render-server for `npm run dev`.
const RENDERER_URL = process.env.RENDERER_URL ?? 'http://localhost:3002'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { template, headline, kicker, features, cta, brandColor, storyboard } = body as {
    template?: 'quote' | 'announcement' | 'dynamic'
    headline?: string
    kicker?: string
    features?: string[]
    cta?: string
    brandColor?: string
    storyboard?: unknown
  }

  if (template === 'dynamic') {
    const parsed = storyboardSchema.safeParse(storyboard)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid storyboard' }, { status: 400 })
    }
  } else if (!headline || !headline.trim()) {
    return NextResponse.json({ error: 'headline is required' }, { status: 400 })
  }
  if (template && template !== 'quote' && template !== 'announcement' && template !== 'dynamic') {
    return NextResponse.json({ error: 'unknown template' }, { status: 400 })
  }

  const projectId = await getActiveProject()

  try {
    // No fetch timeout: a cold-start of the scale-to-zero renderer plus the
    // render can take a couple of minutes. The held-open connection is also
    // what keeps Fly from auto-stopping the renderer mid-job.
    const res = await fetch(`${RENDERER_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AUTH_TOKEN ? { 'x-render-token': process.env.AUTH_TOKEN } : {}),
      },
      body: JSON.stringify({
        template: template || 'quote',
        headline: headline?.trim(),
        kicker,
        features,
        cta,
        brandColor,
        storyboard,
        projectId,
      }),
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
