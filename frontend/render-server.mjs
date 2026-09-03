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
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'

const PORT = Number(process.env.RENDER_PORT || 3002)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENTRY = path.join(__dirname, 'remotion', 'index.tsx')
const GENERATED_FILE = path.join(__dirname, 'remotion', 'generated', 'GeneratedVideo.tsx')

// Locate the Chrome Headless Shell that `npx remotion browser ensure` baked
// into the image. Remotion otherwise guesses `node_modules/.remotion/...`,
// but the build installs it to the project-root `.remotion/` folder — on a
// fresh cold-start of the scale-to-zero renderer those don't match and every
// render fails with `ENOENT: .../chrome-headless-shell/VERSION`. Resolving the
// real binary once and passing it as `browserExecutable` makes renders reliable
// regardless of where Remotion would look.
function findBrowserExecutable() {
  const roots = [
    path.join(__dirname, '.remotion', 'chrome-headless-shell'),
    path.join(__dirname, 'node_modules', '.remotion', 'chrome-headless-shell'),
  ]
  const targets = new Set(['chrome-headless-shell', 'chrome-headless-shell.exe'])
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop()
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) stack.push(full)
        else if (targets.has(e.name)) return full
      }
    }
  }
  return null
}

const BROWSER_EXECUTABLE = findBrowserExecutable()
console.log(BROWSER_EXECUTABLE
  ? `[render] using browser executable: ${BROWSER_EXECUTABLE}`
  : '[render] no baked browser found — Remotion will fall back to its default lookup/download')

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
    const composition = await selectComposition({
      serveUrl, id: 'GeneratedVideo', inputProps: {},
      ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
    })
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps: {},
      chromiumOptions: { enableMultiProcessOnLinux: true },
      ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
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
// declared port), so /render is a code-execution endpoint on the public net.
// It MUST be authenticated in production (issue #5). RENDER_TOKEN gates it;
// prefer a dedicated secret, fall back to AUTH_TOKEN for now (see issue #6).
const RENDER_TOKEN = process.env.RENDER_TOKEN || process.env.AUTH_TOKEN
const IS_PROD = process.env.NODE_ENV === 'production'

// Fail-closed at boot: never run an unauthenticated code-execution endpoint in
// production. Locally (NODE_ENV !== production) an unset token is allowed.
if (IS_PROD && !RENDER_TOKEN) {
  console.error('[render] FATAL: RENDER_TOKEN/AUTH_TOKEN is not set — refusing to start an unauthenticated /render in production')
  process.exit(1)
}

// A render may only write into a project whose id the WEB TIER signed (HMAC,
// short-lived). The renderer trusts that signature, never a body field, so a
// caller cannot write into an arbitrary tenant's namespace.
function verifySignedProject(header) {
  if (!header || !RENDER_TOKEN) return null
  const [projectId, expStr, sig] = String(header).split('.')
  if (!projectId || !expStr || !sig) return null
  if (Number(expStr) < Date.now()) return null // expired
  const expected = crypto.createHmac('sha256', RENDER_TOKEN).update(`${projectId}.${expStr}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return projectId
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

  // Unconditional in production (RENDER_TOKEN is guaranteed set there). The only
  // skip is local dev with no token configured.
  const devUnsecured = !RENDER_TOKEN && !IS_PROD
  if (!devUnsecured && req.headers['x-render-token'] !== RENDER_TOKEN) {
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
      // The tenant a render writes to comes ONLY from the web-tier-signed
      // header, never the request body (issue #5).
      const verifiedProjectId = verifySignedProject(req.headers['x-render-project'])
      console.log(`[render] start: ${payload.code.length} chars of generated code (project ${verifiedProjectId ?? 'none'})`)
      const data = await renderGenerated({ code: payload.code, projectId: verifiedProjectId })
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
