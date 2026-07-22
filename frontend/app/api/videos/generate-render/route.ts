export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getActiveProject } from '@/lib/project-server'
import { generateAndRenderVideo } from '@/lib/video-generate'

export async function POST(req: NextRequest) {
  const { description, includeVideoUrls } = (await req.json().catch(() => ({}))) as {
    description?: string; includeVideoUrls?: string[]
  }
  if (!description || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const projectId = await getActiveProject()
  const result = await generateAndRenderVideo(description.trim(), projectId, {
    includeVideoUrls: Array.isArray(includeVideoUrls) ? includeVideoUrls : [],
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ video: result.video, attempts: result.attempts })
}
