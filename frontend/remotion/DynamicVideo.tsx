import { AbsoluteFill, Sequence } from 'remotion'
import { Backdrop, FadeScene } from './scenes/shared'
import { TitleScene } from './scenes/TitleScene'
import { FeaturesScene } from './scenes/FeaturesScene'
import { PhotoScene } from './scenes/PhotoScene'
import { StatScene } from './scenes/StatScene'
import { QuoteScene } from './scenes/QuoteScene'
import { OutroScene } from './scenes/OutroScene'
import { Scene, Storyboard, sceneDuration, storyboardSchema } from './storyboard'

export const dynamicVideoSchema = storyboardSchema

function renderScene(scene: Scene, brandColor: string) {
  switch (scene.type) {
    case 'title':
      return <TitleScene kicker={scene.kicker} headline={scene.headline} brandColor={brandColor} />
    case 'features':
      return <FeaturesScene features={scene.features} brandColor={brandColor} />
    case 'photo':
      return (
        <PhotoScene
          imageUrl={scene.imageUrl}
          caption={scene.caption}
          direction={scene.direction}
          brandColor={brandColor}
        />
      )
    case 'stat':
      return (
        <StatScene
          value={scene.value}
          prefix={scene.prefix}
          suffix={scene.suffix}
          label={scene.label}
          brandColor={brandColor}
        />
      )
    case 'quote':
      return <QuoteScene quote={scene.quote} attribution={scene.attribution} brandColor={brandColor} />
    case 'outro':
      return <OutroScene cta={scene.cta} brandColor={brandColor} />
  }
}

// Generic composition for LLM-authored storyboards: lays scenes out
// back-to-back (each scene owns its own fixed duration — see
// storyboard.ts#sceneDuration) and dispatches each entry to its primitive.
export function DynamicVideo({ brandColor, scenes }: Storyboard) {
  let cursor = 0

  return (
    <AbsoluteFill>
      <Backdrop brandColor={brandColor} />
      {scenes.map((scene, i) => {
        const duration = sceneDuration(scene)
        const from = cursor
        cursor += duration
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <FadeScene duration={duration}>{renderScene(scene, brandColor)}</FadeScene>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
