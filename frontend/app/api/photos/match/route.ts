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

const BUCKET = 'photo-library'
// Cap how many images we send to the vision model per match. Larger libraries
// are shortlisted by description text first (cheap) so cost/latency stay bounded.
const MAX_IMAGES = 10

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
function mediaType(name: string): MediaType {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png')  return 'image/png'
  if (ext === 'gif')  return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export async function POST(req: NextRequest) {
  const { draft_text, topic } = await req.json()
  if (!draft_text) return NextResponse.json({ error: 'draft_text is required' }, { status: 400 })

  const pid = await getActiveProject()
  const { data: photos, error } = await scoped(
    supabase.from('photo_library').select('id, storage_path, description, filename'), pid,
  ).order('created_at', { ascending: false })

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 })
  if (!photos || photos.length === 0) return NextResponse.json({ matches: [] })

  // Shortlist to MAX_IMAGES by description relevance when the library is large,
  // so the vision pass only looks at plausible candidates.
  let candidates = photos
  if (photos.length > MAX_IMAGES) {
    const listing = photos
      .map((p, i) => `[${i}] ${p.filename}: ${p.description ?? 'no description'}`)
      .join('\n')
    try {
      const pick = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Post: ${topic ?? ''} — ${draft_text.slice(0, 300)}\n\nPhotos:\n${listing}\n\nReturn the indices of the ${MAX_IMAGES} most relevant photos as a JSON array of numbers, best first. Only the array.`,
        }],
      })
      const raw = (pick.content.find(b => b.type === 'text') as any)?.text ?? '[]'
      const idxs: number[] = JSON.parse(raw.slice(raw.indexOf('['), raw.indexOf(']') + 1))
      candidates = idxs.map(i => photos[i]).filter(Boolean).slice(0, MAX_IMAGES)
    } catch {
      candidates = photos.slice(0, MAX_IMAGES)
    }
  }

  // Download each candidate's bytes (works even when the bucket is private) and
  // send the actual pixels to the vision model — it ranks what it can SEE, not
  // a description written about the photo at upload time.
  const content: Anthropic.MessageParam['content'] = [{
    type: 'text',
    text: `You are a social-media art director choosing images for a post.

Post topic: ${topic ?? ''}
Post text: ${draft_text.slice(0, 500)}

You are shown ${candidates.length} candidate images, each preceded by its index label [0], [1], … Rank the up-to-3 images that best fit this post's message and mood. Judge what you actually see in each image (subject, text, style). If none fit well, return an empty list.

Reply ONLY as JSON: {"ranked":[{"i":0,"reason":"one short sentence"}]}`,
  }]

  const usable: typeof candidates = []
  for (const p of candidates) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(p.storage_path)
    if (dlErr || !blob) continue
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
    content.push({ type: 'text', text: `[${usable.length}]:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType(p.filename), data: b64 } })
    usable.push(p)
  }

  if (usable.length === 0) return NextResponse.json({ matches: [] })

  let ranked: { i: number; reason: string }[] = []
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content }],
    })
    const raw = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    ranked = (JSON.parse(json).ranked ?? []).slice(0, 3)
  } catch (err) {
    console.error('[photos/match] vision ranking failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Matching failed — check server logs' }, { status: 500 })
  }

  // Resolve to photos + a signed URL so the UI can display them even when the
  // bucket is private.
  const matches = []
  for (const r of ranked) {
    const p = usable[r.i]
    if (!p) continue
    const { data: signed }    = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600)
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(p.storage_path)
    matches.push({
      id: p.id,
      filename: p.filename,
      storage_path: p.storage_path,
      display_url: signed?.signedUrl ?? null,     // short-lived, for preview
      public_url:  publicData.publicUrl,          // stable, stored in draft media
      reason: r.reason ?? '',
    })
  }

  return NextResponse.json({ matches })
}
