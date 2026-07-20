import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, SceneProps } from './shared'

export type QuoteSceneProps = SceneProps & {
  quote: string
  attribution?: string
}

export function QuoteScene({ quote, attribution, brandColor }: QuoteSceneProps) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()

  const mark = spring({ frame, fps, config: { damping: 14, mass: 0.5 } })
  const textIn = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const attrIn = interpolate(frame, [35, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 100 }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 140,
          color: brandColor,
          lineHeight: 0.5,
          transform: `scale(${mark})`,
          marginBottom: 28,
        }}
      >
        &ldquo;
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: width * 0.075,
          lineHeight: 1.3,
          color: '#ffffff',
          textAlign: 'center',
          maxWidth: '90%',
          opacity: textIn,
          transform: `translateY(${interpolate(textIn, [0, 1], [16, 0])}px)`,
        }}
      >
        {quote}
      </div>
      {attribution && (
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: 34,
            color: brandColor,
            marginTop: 40,
            opacity: attrIn,
          }}
        >
          — {attribution}
        </div>
      )}
    </AbsoluteFill>
  )
}
