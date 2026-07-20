import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, SceneProps } from './shared'

export type PhotoSceneProps = SceneProps & {
  imageUrl: string
  caption?: string
  /** 'in' zooms toward the subject, 'out' starts close and pulls back. */
  direction?: 'in' | 'out'
}

// Ken Burns: a slow continuous scale + drift across the scene's full
// duration. Img (not a plain <img>) so headless Chrome waits for the asset
// to decode before the frame is captured — otherwise renders can catch a
// blank frame.
export function PhotoScene({ imageUrl, caption, direction = 'in', brandColor }: PhotoSceneProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const t = Math.min(1, frame / durationInFrames)
  const [scaleFrom, scaleTo] = direction === 'in' ? [1, 1.15] : [1.15, 1]
  const scale = interpolate(t, [0, 1], [scaleFrom, scaleTo])
  const drift = interpolate(t, [0, 1], [-14, 14])

  const captionIn = interpolate(frame, [durationInFrames - 60, durationInFrames - 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#10151c', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale}) translateX(${drift}px)`,
        }}
      >
        <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {caption && (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 35%)',
          }}
        >
          <div
            style={{
              padding: '0 90px 96px',
              opacity: captionIn,
              transform: `translateY(${interpolate(captionIn, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                display: 'inline-block',
                width: 48,
                height: 5,
                backgroundColor: brandColor,
                marginBottom: 20,
                borderRadius: 3,
              }}
            />
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 48, lineHeight: 1.3, color: '#ffffff' }}>
              {caption}
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
