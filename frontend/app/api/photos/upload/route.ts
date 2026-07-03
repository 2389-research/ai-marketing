export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject, stampRow } from '@/lib/project-server'

const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const pid = await getActiveProject()
  const ext = file.name.split('.').pop()
  const path = `${pid ? `${pid}/` : ''}${Date.now()}-${file.name.replace(/\s+/g, '-')}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('photo-library')
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('photo-library').getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  // AI description via Claude Vision — base64 from the buffer we already hold,
  // so this works even when the storage bucket is private
  let description = ''
  try {
    const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
      ? file.type : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    const vision = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in 2-3 sentences for the purpose of matching it with social media posts. Focus on the subject, mood, setting, and any text visible. Be concise.',
          },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        ],
      }],
    })
    description = (vision.content.find(b => b.type === 'text') as any)?.text ?? ''
  } catch (err) {
    console.error('[photos/upload] vision description failed:', err instanceof Error ? err.message : err)
    description = file.name.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '')
  }

  const { data, error: dbError } = await supabase
    .from('photo_library')
    .insert(stampRow({ filename: file.name, storage_path: path, public_url: publicUrl, description }, pid))
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
