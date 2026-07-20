import { Composition } from 'remotion'
import { QuoteCard, quoteCardSchema } from './QuoteCard'
import { Announcement, announcementSchema, ANNOUNCEMENT_DURATION } from './Announcement'
import { DynamicVideo, dynamicVideoSchema } from './DynamicVideo'
import { storyboardDuration } from './storyboard'

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="QuoteCard"
        component={QuoteCard}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        schema={quoteCardSchema}
        defaultProps={{
          headline: 'Your headline here',
          brandColor: '#1c69d4',
        }}
      />
      <Composition
        id="Announcement"
        component={Announcement}
        durationInFrames={ANNOUNCEMENT_DURATION}
        fps={30}
        width={1080}
        height={1920}
        schema={announcementSchema}
        defaultProps={{
          kicker: 'NEW',
          headline: 'Schedule a week of posts in one sitting',
          features: [
            'AI drafts posts in your brand voice',
            'One-click scheduling across platforms',
            'Analytics that tell you what worked',
          ],
          cta: 'postique.app',
          brandColor: '#1c69d4',
        }}
      />
      <Composition
        id="DynamicVideo"
        component={DynamicVideo}
        fps={30}
        width={1080}
        height={1920}
        schema={dynamicVideoSchema}
        durationInFrames={150}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: storyboardDuration(props),
        })}
        defaultProps={{
          brandColor: '#1c69d4',
          scenes: [
            { type: 'title', kicker: 'NEW', headline: 'Any video, one prompt away' },
            { type: 'outro', cta: 'postique.app' },
          ],
        }}
      />
    </>
  )
}
