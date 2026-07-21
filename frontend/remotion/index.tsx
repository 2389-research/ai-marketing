import { Composition, registerRoot } from 'remotion'
import GeneratedVideo, { DURATION_IN_FRAMES } from './generated/GeneratedVideo'

// The only composition. Its component and duration come from
// remotion/generated/GeneratedVideo.tsx, which render-server.mjs overwrites
// with freshly LLM-generated code immediately before each render, then
// bundles from scratch (no bundle caching — the file's content changes
// per request, so a cached webpack bundle would serve stale code).
function Root() {
  return (
    <Composition
      id="GeneratedVideo"
      component={GeneratedVideo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
  )
}

registerRoot(Root)
