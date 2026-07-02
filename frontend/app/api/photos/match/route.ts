export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { draft_text, topic } = await req.json()
  if (!draft_text) return NextResponse.json({ error: 'draft_text is required' }, { status: 400 })

  const pid = await getActiveProject()
  const { data: photos, error } = await scoped(supabase.from('photo_library').select('id, public_url, description, filename'), pid)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!photos || photos.length === 0) return NextResponse.json({ match: null })

  const photoList = photos
    .map((p, i) => `[${i + 1}] ID: ${p.id}\nFilename: ${p.filename}\nDescription: ${p.description ?? 'No description'}`)
    .join('\n\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `You are matching photos to social media posts.

Post topic: ${topic ?? ''}
Post text: ${draft_text.slice(0, 500)}

Available photos:
${photoList}

Which photo best matches this post's theme and message? Reply with ONLY the photo ID (uuid), nothing else. If none are a good match, reply with "none".`,
    }],
  })

  const answer = ((msg.content.find(b => b.type === 'text') as any)?.text ?? 'none').trim()
  if (answer === 'none') return NextResponse.json({ match: null })

  const match = photos.find(p => p.id === answer)
  return NextResponse.json({ match: match ?? null })
}
