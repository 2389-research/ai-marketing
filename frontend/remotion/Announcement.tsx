import { AbsoluteFill, Sequence } from 'remotion'
import { z } from 'zod'
import { Backdrop, FadeScene } from './scenes/shared'
import { TitleScene } from './scenes/TitleScene'
import { FeaturesScene } from './scenes/FeaturesScene'
import { OutroScene } from './scenes/OutroScene'

export const announcementSchema = z.object({
  kicker: z.string().default('NEW'),
  headline: z.string(),
  features: z.array(z.string()).default([]),
  cta: z.string().default('postique.app'),
  brandColor: z.string().default('#1c69d4'),
})

type Props = z.infer<typeof announcementSchema>

// Scene layout (30 fps): title 0–110, features 95–255, end card 240–360.
// Scenes overlap by 15 frames and crossfade inside FadeScene.
const TITLE_START = 0
const TITLE_DUR = 110
const FEATURES_START = 95
const FEATURES_DUR = 160
const END_START = 240
const END_DUR = 120
export const ANNOUNCEMENT_DURATION = END_START + END_DUR

export function Announcement(props: Props) {
  return (
    <AbsoluteFill>
      <Backdrop brandColor={props.brandColor} />
      <Sequence from={TITLE_START} durationInFrames={TITLE_DUR}>
        <FadeScene duration={TITLE_DUR}>
          <TitleScene kicker={props.kicker} headline={props.headline} brandColor={props.brandColor} />
        </FadeScene>
      </Sequence>
      <Sequence from={FEATURES_START} durationInFrames={FEATURES_DUR}>
        <FadeScene duration={FEATURES_DUR}>
          <FeaturesScene features={props.features} brandColor={props.brandColor} />
        </FadeScene>
      </Sequence>
      <Sequence from={END_START} durationInFrames={END_DUR}>
        <FadeScene duration={END_DUR}>
          <OutroScene cta={props.cta} brandColor={props.brandColor} />
        </FadeScene>
      </Sequence>
    </AbsoluteFill>
  )
}
