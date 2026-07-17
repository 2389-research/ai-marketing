// Internal render service — runs as its own Fly process group ("renderer")
// on a performance VM that scales to zero. The web process delegates every
// video render here via the app's flycast address (postique.flycast:3002),
// which Fly Proxy uses to auto-start this machine on demand and auto-stop it
// when idle — so the fast/expensive CPU is only billed during actual renders.
//
// Rendering used to happen inline in the Next.js route, but shared-cpu-1x is
// far too slow for headless-Chrome frame rendering (~5+ min). This keeps the
// web tier cheap and always-on while isolating the heavy work.

import http from 'http'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'

const PORT = Number(process.env.RENDER_PORT || 3002)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENTRY = path.join(__dirname, 'remotion', 'index.ts')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// The Remotion bundle is identical across renders (only inputProps change),
// so bundle once and reuse — saves ~10s per request after the first.
let bundlePromise = null
function getBundle() {
  if (!bundlePromise) bundlePromise = bundle({ entryPoint: ENTRY })
  return bundlePromise
}

async function renderQuoteCard({ headline, brandColor, projectId }) {
  const inputProps = { headline: headline.trim(), brandColor: brandColor || '#1c69d4' }
  const outPath = path.join(os.tmpdir(), `quote-${Date.now()}.mp4`)

  try {
    const serveUrl = await getBundle()
    const composition = await selectComposition({ serveUrl, id: 'QuoteCard', inputProps })
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      chromiumOptions: { enableMultiProcessOnLinux: true },
    })

    const buffer = fs.readFileSync(outPath)
    const filename = `quote-card-${Date.now()}.mp4`
    const storagePath = `${projectId ? `${projectId}/` : ''}${filename}`

    const { error: uploadError } = await supabase.storage
      .from('video-library')
      .upload(storagePath, buffer, { contentType: 'video/mp4' })
    if (uploadError) throw new Error(uploadError.message)

    const { data: urlData } = supabase.storage.from('video-library').getPublicUrl(storagePath)

    const row = { filename, storage_path: storagePath, public_url: urlData.publicUrl }
    if (projectId) row.project_id = projectId

    const { data, error } = await supabase.from('video_library').insert(row).select().single()
    if (error) throw new Error(error.message)
    return data
  } finally {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', async () => {
    let payload
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
      return
    }

    if (!payload.headline || !String(payload.headline).trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'headline is required' }))
      return
    }

    try {
      console.log(`[render] start: "${payload.headline}"`)
      const data = await renderQuoteCard(payload)
      console.log(`[render] done: ${data.filename}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    } catch (err) {
      console.error('[render] failed:', err?.stack || err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err?.message || 'Render failed' }))
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`render-server listening on 0.0.0.0:${PORT}`)
})
