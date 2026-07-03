export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const pid = await getActiveProject()
  const { data, error } = await scoped(supabase.from('photo_library').select('*'), pid)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach a short-lived signed URL so thumbnails render even when the bucket
  // is private. public_url stays as the stable value stored in draft media.
  const withUrls = await Promise.all((data ?? []).map(async p => {
    const { data: signed } = await supabase.storage
      .from('photo-library').createSignedUrl(p.storage_path, 3600)
    return { ...p, display_url: signed?.signedUrl ?? p.public_url }
  }))
  return NextResponse.json(withUrls)
}

export async function DELETE(req: Request) {
  const { id, storage_path } = await req.json()

  await supabase.storage.from('photo-library').remove([storage_path])
  const { error } = await supabase.from('photo_library').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
