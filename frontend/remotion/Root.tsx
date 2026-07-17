import { Composition } from 'remotion'
import { QuoteCard, quoteCardSchema } from './QuoteCard'

export function RemotionRoot() {
  return (
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
  )
}
