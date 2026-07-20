import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, SceneProps } from './shared'

export type TitleSceneProps = SceneProps & {
  kicker?: string
  headline: string
}

// Kicker badge pops in, headline types on at ~1.5 chars/frame with a
// blinking block cursor — the "Cursor announcement video" typewriter look.
export function TitleScene({ kicker, headline, brandColor }: TitleSceneProps) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()

  const badge = spring({ frame: frame - 5, fps, config: { damping: 14, mass: 0.5 } })

  const typeStart = kicker ? 18 : 6
  const charsShown = Math.max(0, Math.floor((frame - typeStart) * 1.5))
  const visible = headline.slice(0, charsShown)
  const doneTyping = charsShown >= headline.length
  const cursorOn = Math.floor(frame / 12) % 2 === 0
  const showCursor = frame >= typeStart - 6 && (!doneTyping || frame < typeStart + headline.length / 1.5 + 45)

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 90 }}>
      {kicker && (
        <div
          style={{
            transform: `scale(${badge})`,
            backgroundColor: brandColor,
            color: '#ffffff',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 6,
            padding: '12px 32px',
            borderRadius: 999,
            marginBottom: 56,
          }}
        >
          {kicker}
        </div>
      )}
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: width * 0.085,
          lineHeight: 1.2,
          color: '#ffffff',
          textAlign: 'center',
          maxWidth: '92%',
          minHeight: width * 0.085 * 2.4,
        }}
      >
        {visible}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: '0.55em',
              height: '1em',
              marginLeft: 6,
              verticalAlign: 'text-bottom',
              backgroundColor: brandColor,
              opacity: cursorOn ? 1 : 0,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  )
}
