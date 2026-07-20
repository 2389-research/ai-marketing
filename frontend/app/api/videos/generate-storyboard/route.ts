export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { authoringStoryboardSchema, storyboardSchema, AuthoringScene, Scene } from '@/remotion/storyboard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PHOTO_BUCKET = 'photo-library'
const MAX_PHOTOS_OFFERED = 24

const STORYBOARD_TOOL: Anthropic.Tool = {
  name: 'build_storyboard',
  description:
    'Produce a storyboard (an ordered list of scenes) for a short vertical branded video, built entirely from the given scene vocabulary.',
  input_schema: {
    type: 'object',
    properties: {
      brandColor: {
        type: 'string',
        description: 'Hex brand color, e.g. #1c69d4. Keep the default unless the request calls for a different mood/palette.',
      },
      scenes: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['title', 'features', 'photo', 'stat', 'quote', 'outro'] },
            kicker: { type: 'string', description: '[title] short badge label above the headline, e.g. "NEW". Omit if not needed.' },
            headline: { type: 'string', description: '[title] the big typewriter headline. Keep under ~60 characters.' },
            features: {
              type: 'array', items: { type: 'string' },
              description: '[features] 1-4 short benefit/checklist lines, each under ~65 characters.',
            },
            photoIndex: { type: 'number', description: '[photo] index into the numbered photo list provided below.' },
            caption: { type: 'string', description: '[photo] optional short caption overlaid on the image.' },
            direction: { type: 'string', enum: ['in', 'out'], description: '[photo] Ken Burns zoom direction, default "in".' },
            value: { type: 'number', description: '[stat] the number the counter animates up to.' },
            prefix: { type: 'string', description: '[stat] text before the number, e.g. "$".' },
            suffix: { type: 'string', description: '[stat] text after the number, e.g. "+" or "%".' },
            label: { type: 'string', description: '[stat] short caption under the number.' },
            quote: { type: 'string', description: '[quote] the quoted text, under ~150 characters.' },
            attribution: { type: 'string', description: '[quote] who said it, e.g. "Alex, Founder". Omit if unknown.' },
            cta: { type: 'string', description: '[outro] closing call to action, e.g. a URL. Defaults to "postique.app".' },
          },
          required: ['type'],
        },
      },
    },
    required: ['scenes'],
  },
}

const SCENE_GUIDE = `Scene vocabulary (use only these types):
- title: opening scene, badge + typewriter headline. Almost every video should open with one.
- features: a staggered checklist of 1-4 short benefit lines.
- photo: a real photo with a slow Ken Burns zoom, optional caption. Only use this if photos are available below — never invent an image.
- stat: a single number that counts up, with a label underneath. Good for "we hit X users" type claims.
- quote: a large pull-quote with optional attribution.
- outro: closing logo card with a CTA. Almost every video should end with one.

General rules:
- This is a vertical (1080x1920) video for Stories/Reels/Shorts. Keep every line of text short — this is glanced at on a phone, not read.
- 3-6 scenes is the sweet spot for most requests. Only go up to 8 for genuinely content-rich asks.
- Open with "title" and close with "outro" unless the request clearly calls for something else.
- Pick brandColor thoughtfully — default to the brand blue (#1c69d4) unless the prompt implies a different mood (e.g. "energetic" could stay blue, "warm/cozy" could shift warmer), but never sacrifice legibility (white text sits on top of every scene).`

type PhotoRow = { id: string; storage_path: string; description: string | null; filename: string }

async function fetchPhotos(projectId: string | null): Promise<PhotoRow[]> {
  const { data, error } = await scoped(
    supabase.from('photo_library').select('id, storage_path, description, filename'), projectId,
  ).order('created_at', { ascending: false }).limit(MAX_PHOTOS_OFFERED)
  if (error) return []
  return data ?? []
}

function buildSystemPrompt(photos: PhotoRow[]): string {
  const photoList = photos.length
    ? photos.map((p, i) => `[${i}] ${p.filename}${p.description ? `: ${p.description}` : ''}`).join('\n')
    : '(none available — do not use the "photo" scene type)'

  return `You are a motion-graphics director for Postique, a social media marketing app. Turn the user's request into a storyboard using the build_storyboard tool.

${SCENE_GUIDE}

Available photos (reference by index only, never invent a URL):
${photoList}

Call build_storyboard exactly once with your final answer.`
}

async function resolvePhoto(photos: PhotoRow[], index: number): Promise<string | null> {
  const photo = photos[index]
  if (!photo) return null
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 3600)
  if (error || !data) return null
  return data.signedUrl
}

async function toRenderScenes(authoringScenes: AuthoringScene[], photos: PhotoRow[]): Promise<Scene[]> {
  const scenes: Scene[] = []
  for (const s of authoringScenes) {
    if (s.type !== 'photo') {
      scenes.push(s)
      continue
    }
    const imageUrl = await resolvePhoto(photos, s.photoIndex)
    if (!imageUrl) continue // drop scenes referencing a photo we couldn't resolve
    scenes.push({ type: 'photo', imageUrl, caption: s.caption, direction: s.direction })
  }
  return scenes
}

async function generate(prompt: string, photos: PhotoRow[], retryNote?: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: buildSystemPrompt(photos),
    tools: [STORYBOARD_TOOL],
    tool_choice: { type: 'tool', name: 'build_storyboard' },
    messages: [{ role: 'user', content: retryNote ? `${prompt}\n\n${retryNote}` : prompt }],
  })

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolUse) throw new Error('Model did not return a storyboard')

  return authoringStoryboardSchema.safeParse(toolUse.input)
}

export async function POST(req: NextRequest) {
  const { prompt } = (await req.json().catch(() => ({}))) as { prompt?: string }
  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const projectId = await getActiveProject()
  const photos = await fetchPhotos(projectId)

  try {
    let result = await generate(prompt.trim(), photos)
    if (!result.success) {
      result = await generate(
        prompt.trim(), photos,
        `Your previous storyboard was invalid: ${result.error.message}. Fix it and call build_storyboard again.`,
      )
    }
    if (!result.success) {
      return NextResponse.json({ error: 'Could not generate a valid storyboard — try rephrasing' }, { status: 502 })
    }

    const renderScenes = await toRenderScenes(result.data.scenes, photos)
    const storyboard = storyboardSchema.parse({ brandColor: result.data.brandColor, scenes: renderScenes })

    return NextResponse.json({ storyboard })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Storyboard generation failed' }, { status: 500 })
  }
}
