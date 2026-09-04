export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const pid = await getActiveProject()
  const { data, error } = await scoped(supabase.from('video_library').select('*'), pid)
    .order('created_at', { ascending: false })
  if (error) {
    const msg = error.message.includes('does not exist')
      ? 'Table "video_library" not found — run sql/setup_video_library.sql in Supabase SQL editor'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { filename, storage_path, public_url } = body
  const pid = await getActiveProject()
  const { data, error } = await supabase
    .from('video_library')
    .insert(stampRow({ filename, storage_path, public_url }, pid))
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const pid = await getActiveProject()

  // Object-level authorization (issue #8): verify the video belongs to the
  // caller's active brand, and derive its storage_path from the ROW — never
  // trust a caller-supplied path (that let any tenant delete any object).
  const { data: row } = await scoped(
    supabase.from('video_library').select('id, storage_path'), pid,
  ).eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  if (row.storage_path) await supabase.storage.from('video-library').remove([row.storage_path])
  const { error } = await scoped(supabase.from('video_library').delete(), pid).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
