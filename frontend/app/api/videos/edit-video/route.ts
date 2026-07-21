export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getActiveProject } from '@/lib/project-server'
import { editAndRenderVideo } from '@/lib/video-generate'

const execFileP = promisify(execFile)

// Probe a remote video's dimensions + duration with ffprobe (installed in the
// image for the ffmpeg-based clip pipeline). The model needs these to match
// the composition length and decide how to fit the footage into the vertical
// canvas.
async function probeVideo(url: string): Promise<{ width: number; height: number; duration: number }> {
  const { stdout } = await execFileP(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', url],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  )
  const data = JSON.parse(stdout)
  const v = (data.streams ?? []).find((s: any) => s.codec_type === 'video')
  if (!v) throw new Error('No video stream found in that file')
  const width = Number(v.width) || 1080
  const height = Number(v.height) || 1920
  const duration = Number(data.format?.duration) || Number(v.duration) || 15
  return { width, height, duration }
}

export async function POST(req: NextRequest) {
  const { sourceVideoUrl, description } = (await req.json().catch(() => ({}))) as {
    sourceVideoUrl?: string
    description?: string
  }
  if (!sourceVideoUrl || !sourceVideoUrl.trim()) {
    return NextResponse.json({ error: 'sourceVideoUrl is required' }, { status: 400 })
  }
  if (!description || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  let meta: { width: number; height: number; duration: number }
  try {
    meta = await probeVideo(sourceVideoUrl.trim())
  } catch (err: any) {
    return NextResponse.json(
      { error: `Couldn't read that video: ${err?.message ?? 'probe failed'}` },
      { status: 502 },
    )
  }

  const projectId = await getActiveProject()
  const result = await editAndRenderVideo(description.trim(), sourceVideoUrl.trim(), meta, projectId)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ video: result.video, attempts: result.attempts })
}
