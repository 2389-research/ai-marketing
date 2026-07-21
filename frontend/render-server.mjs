// Internal render service — runs as its own Fly process group ("renderer")
// on a performance VM that scales to zero. The web process delegates every
// video render here via the app's flycast address (postique.flycast:3002),
// which Fly Proxy uses to auto-start this machine on demand and auto-stop it
// when idle — so the fast/expensive CPU is only billed during actual renders.
//
// Rendering used to happen inline in the Next.js route, but shared-cpu-1x is
// far too slow for headless-Chrome frame rendering (~5+ min). This keeps the
// web tier cheap and always-on while isolating the heavy work.
//
// Every render is of a single, LLM-generated composition (no fixed
// templates) — see remotion/index.ts + remotion/generated/GeneratedVideo.tsx.
// The Next.js orchestration route (/api/videos/generate-render) writes fresh
// code here on each request; this file's job is purely bundle-and-render.

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
const ENTRY = path.join(__dirname, 'remotion', 'index.tsx')
const GENERATED_FILE = path.join(__dirname, 'remotion', 'generated', 'GeneratedVideo.tsx')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// The composition's source changes on every request, so — unlike the old
// fixed-template setup — the webpack bundle can never be cached across
// renders; it's rebuilt fresh each time to pick up the newly written file.
async function renderGenerated({ code, projectId }) {
  fs.writeFileSync(GENERATED_FILE, code, 'utf8')

  const outPath = path.join(os.tmpdir(), `generated-${Date.now()}.mp4`)

  let serveUrl
  try {
    serveUrl = await bundle({ entryPoint: ENTRY })
  } catch (err) {
    throw Object.assign(new Error(err?.message || 'Bundle failed'), { stage: 'bundle' })
  }

  try {
    const composition = await selectComposition({ serveUrl, id: 'GeneratedVideo', inputProps: {} })
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps: {},
      chromiumOptions: { enableMultiProcessOnLinux: true },
    })
  } catch (err) {
    throw Object.assign(new Error(err?.message || 'Render failed'), { stage: 'render' })
  }

  try {
    const buffer = fs.readFileSync(outPath)
    const filename = `generated-${Date.now()}.mp4`
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

// The renderer's port is reachable on the app's public IPv6 (flycast needs a
// declared port), so gate /render behind the same shared secret that gates the
// app. /health stays open for Fly's checks. If AUTH_TOKEN isn't set (local
// dev), the check is skipped.
const RENDER_TOKEN = process.env.AUTH_TOKEN

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

  if (RENDER_TOKEN && req.headers['x-render-token'] !== RENDER_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
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

    if (!payload.code || !String(payload.code).trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'code is required' }))
      return
    }

    try {
      console.log(`[render] start: ${payload.code.length} chars of generated code`)
      const data = await renderGenerated(payload)
      console.log(`[render] done: ${data.filename}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    } catch (err) {
      console.error(`[render] failed (${err?.stage || 'unknown'}):`, err?.stack || err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err?.message || 'Render failed', stage: err?.stage || null }))
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`render-server listening on 0.0.0.0:${PORT}`)
})
