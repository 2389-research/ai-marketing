export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('photo-library')
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('photo-library').getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  // AI description via OpenAI Vision
  let description = ''
  try {
    const vision = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in 2-3 sentences for the purpose of matching it with social media posts. Focus on the subject, mood, setting, and any text visible. Be concise.',
          },
          { type: 'image_url', image_url: { url: publicUrl, detail: 'low' } },
        ],
      }],
    })
    description = vision.choices[0].message.content ?? ''
  } catch {
    description = file.name.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '')
  }

  const { data, error: dbError } = await supabase
    .from('photo_library')
    .insert({ filename: file.name, storage_path: path, public_url: publicUrl, description })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
