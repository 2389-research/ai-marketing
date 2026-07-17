export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { getActiveProject, stampRow } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { headline, brandColor } = body as { headline?: string; brandColor?: string }

  if (!headline || !headline.trim()) {
    return NextResponse.json({ error: 'headline is required' }, { status: 400 })
  }

  const inputProps = { headline: headline.trim(), brandColor: brandColor || '#1c69d4' }
  const outPath = path.join(os.tmpdir(), `quote-${Date.now()}.mp4`)

  try {
    const bundleLocation = await bundle({
      entryPoint: path.join(process.cwd(), 'remotion', 'index.ts'),
    })

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'QuoteCard',
      inputProps,
    })

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      chromiumOptions: { enableMultiProcessOnLinux: true },
    })

    const buffer = fs.readFileSync(outPath)
    const pid = await getActiveProject()
    const filename = `quote-card-${Date.now()}.mp4`
    const storagePath = `${pid ? `${pid}/` : ''}${filename}`

    const { error: uploadError } = await supabase.storage
      .from('video-library')
      .upload(storagePath, buffer, { contentType: 'video/mp4' })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('video-library').getPublicUrl(storagePath)

    const { data, error } = await supabase
      .from('video_library')
      .insert(stampRow({ filename, storage_path: storagePath, public_url: urlData.publicUrl }, pid))
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Render failed' }, { status: 500 })
  } finally {
    fs.existsSync(outPath) && fs.unlinkSync(outPath)
  }
}
