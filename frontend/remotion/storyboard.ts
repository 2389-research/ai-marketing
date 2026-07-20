import { z } from 'zod'

// Each scene type's content schema. Duration is NOT part of this — pacing is
// fixed per scene type (see sceneDuration) so an LLM-authored storyboard
// can't produce a degenerate (too-short / absurdly long) render.
export const titleSceneSchema = z.object({
  type: z.literal('title'),
  kicker: z.string().max(20).optional(),
  headline: z.string().min(1).max(90),
})

export const featuresSceneSchema = z.object({
  type: z.literal('features'),
  features: z.array(z.string().min(1).max(70)).min(1).max(4),
})

export const photoSceneSchema = z.object({
  type: z.literal('photo'),
  imageUrl: z.string().min(1),
  caption: z.string().max(90).optional(),
  direction: z.enum(['in', 'out']).default('in'),
})

export const statSceneSchema = z.object({
  type: z.literal('stat'),
  value: z.number(),
  prefix: z.string().max(6).optional(),
  suffix: z.string().max(6).optional(),
  label: z.string().min(1).max(70),
})

export const quoteSceneSchema = z.object({
  type: z.literal('quote'),
  quote: z.string().min(1).max(180),
  attribution: z.string().max(60).optional(),
})

export const outroSceneSchema = z.object({
  type: z.literal('outro'),
  cta: z.string().min(1).max(60).default('postique.app'),
})

export const sceneSchema = z.discriminatedUnion('type', [
  titleSceneSchema,
  featuresSceneSchema,
  photoSceneSchema,
  statSceneSchema,
  quoteSceneSchema,
  outroSceneSchema,
])

export const storyboardSchema = z.object({
  brandColor: z.string().default('#1c69d4'),
  scenes: z.array(sceneSchema).min(1).max(8),
})

export type Scene = z.infer<typeof sceneSchema>
export type Storyboard = z.infer<typeof storyboardSchema>

// "Authoring" variant of the photo scene — used only while a storyboard is
// being generated from a prompt. The model can't be trusted to invent a real
// image URL, so it picks an index into a photo list we hand it; the server
// resolves that to a real (signed) URL before the storyboard is considered
// renderable. Every other scene type is identical between authoring and
// render form.
export const authoringPhotoSceneSchema = z.object({
  type: z.literal('photo'),
  photoIndex: z.number().int().min(0),
  caption: z.string().max(90).optional(),
  direction: z.enum(['in', 'out']).default('in'),
})

export const authoringSceneSchema = z.discriminatedUnion('type', [
  titleSceneSchema,
  featuresSceneSchema,
  authoringPhotoSceneSchema,
  statSceneSchema,
  quoteSceneSchema,
  outroSceneSchema,
])

export const authoringStoryboardSchema = z.object({
  brandColor: z.string().default('#1c69d4'),
  scenes: z.array(authoringSceneSchema).min(1).max(8),
})

export type AuthoringScene = z.infer<typeof authoringSceneSchema>
export type AuthoringStoryboard = z.infer<typeof authoringStoryboardSchema>

const FPS = 30

export function sceneDuration(scene: Scene): number {
  switch (scene.type) {
    case 'title':
      return Math.round(3.5 * FPS)
    case 'features':
      return Math.round((1.2 + scene.features.length * 0.7) * FPS)
    case 'photo':
      return Math.round(4 * FPS)
    case 'stat':
      return Math.round(3.5 * FPS)
    case 'quote':
      return Math.round(4 * FPS)
    case 'outro':
      return Math.round(4 * FPS)
  }
}

export function storyboardDuration(storyboard: Storyboard): number {
  return storyboard.scenes.reduce((sum, s) => sum + sceneDuration(s), 0)
}
