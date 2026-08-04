// Server-side page fetcher shared by the inspiration clipper and the
// assistant's fetch_url tool. User-supplied URLs only ever hit public
// http(s) hosts (SSRF guard), and the big social networks are on a
// known-blocked list so callers can ask the user to paste instead.

// Social platforms that block server-side fetching — don't bother.
export const BLOCKED_HOSTS = /(?:^|\.)(?:x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|threads\.net)$/i

// Private/internal hosts a user-supplied URL must never make the server hit.
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i

export function safeHost(url?: string | null): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m =>
      ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }[m] ?? ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function metaTag(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? ''
}

export type FetchedPage = { text: string; ogImage: string }
export type FetchBlocked = { blocked: string }

export async function fetchPage(url: string): Promise<FetchedPage | FetchBlocked> {
  let parsed: URL
  try { parsed = new URL(url) } catch { return { blocked: 'That does not look like a valid link.' } }
  if (!/^https?:$/.test(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) {
    return { blocked: 'Only public http(s) links can be fetched.' }
  }
  const host = parsed.hostname.replace(/^www\./, '')
  if (BLOCKED_HOSTS.test(host)) {
    return { blocked: `${host} blocks automated fetching — paste the post's text instead (the link is still saved).` }
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    })
    if (!res.ok) return { blocked: `The site answered ${res.status} — paste the content instead.` }
    const html = (await res.text()).slice(0, 500_000)
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
    const ogTitle = metaTag(html, 'og:title')
    const ogDesc = metaTag(html, 'og:description') || metaTag(html, 'description')
    const ogImageRaw = metaTag(html, 'og:image')
    const ogImage = /^https?:\/\//i.test(ogImageRaw) ? ogImageRaw : ''
    const body = stripHtml(html)
    const text = [
      ogTitle || title ? `TITLE: ${ogTitle || title}` : '',
      ogDesc ? `DESCRIPTION: ${ogDesc}` : '',
      body ? `PAGE TEXT: ${body.slice(0, 5000)}` : '',
    ].filter(Boolean).join('\n')
    if (text.replace(/^TITLE:.*$/m, '').trim().length < 120 || /just a moment|access denied|log in to|sign in to continue/i.test(text.slice(0, 600))) {
      return { blocked: 'The page gave almost nothing back (likely bot-blocked) — paste the content instead.' }
    }
    return { text, ogImage }
  } catch {
    return { blocked: 'Could not reach that link — paste the content instead.' }
  }
}
