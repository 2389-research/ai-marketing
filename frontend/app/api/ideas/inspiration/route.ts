export const runtime = 'nodejs'
export const maxDuration = 90

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Swipe-file analysis: what makes this piece work, and which PATTERN is worth
// reusing. The hard rule everywhere downstream: imitate the pattern, never the
// wording — inspiration, not plagiarism.
const SYSTEM = `You analyze a piece of content someone saved because they liked it (a swipe file entry).
Break down WHY it works so the pattern can be reused for a different brand.

Respond ONLY with valid JSON:
{"title": "short label for the clipping (max 8 words, what it IS, e.g. 'Duolingo unhinged reply thread')",
 "why_it_works": ["2-4 one-line observations: the hook mechanic, structure, tone, format choices actually visible in the content"],
 "steal_these": ["2-3 reusable PATTERNS stated abstractly, e.g. 'opens with a hyper-specific number before naming the subject' — never quote the original wording"],
 "suggested_use": "one concrete way THIS brand could use the strongest pattern, one sentence",
 "channels": ["1-3 channel ids from: linkedin,instagram,email,tiktok,youtube,x,instagram_stories,youtube_shorts,pinterest,reddit,threads"]}
Base everything on what is actually in the content — no generic marketing advice.`

// Page fetching (SSRF guard, blocked-host list, og extraction) lives in the
// shared lib — the assistant's fetch_url tool uses the same code path.
import { fetchPage, safeHost } from '@/lib/fetch-page'

export async function POST(req: NextRequest) {
  const { url, text: pastedText, image_url } = await req.json()
  if (!url?.trim() && !pastedText?.trim() && !image_url) {
    return NextResponse.json({ error: 'Give a link, pasted text, or a screenshot.' }, { status: 400 })
  }
  const pid = await getActiveProject()

  // Gather source material: pasted text always wins; a link adds fetched context.
  let sourceText = (pastedText ?? '').trim()
  let ogImage = ''
  if (url?.trim()) {
    const fetched = await fetchPage(url.trim())
    if ('blocked' in fetched) {
      // A blocked link is only fatal when there's nothing else to analyze.
      if (!sourceText && !image_url) {
        return NextResponse.json({ needs_text: true, error: fetched.blocked }, { status: 422 })
      }
    } else {
      ogImage = fetched.ogImage
      sourceText = sourceText ? `${sourceText}\n\n(from the link)\n${fetched.text}` : fetched.text
    }
  }

  const { data: brand } = await scoped(supabase.from('brand_profile').select('*'), pid).limit(1).maybeSingle()
  const brandCtx = brand
    ? `Company: ${brand.company_name ?? ''}\nNotes: ${(brand.manual_notes ?? '').slice(0, 300)}`
    : '(no brand context)'

  try {
    const userContent: Anthropic.ContentBlockParam[] = []
    if (image_url) userContent.push({ type: 'image', source: { type: 'url', url: image_url } })
    userContent.push({
      type: 'text',
      text: `BRAND THIS WILL INSPIRE:\n${brandCtx}\n\nSAVED CONTENT${url ? ` (source: ${url})` : ''}:\n${sourceText.slice(0, 8000) || '(see the screenshot)'}\n\nReturn the swipe-file JSON.`,
    })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    })
    const raw = (msg.content.find(b => b.type === 'text') as any)?.text ?? ''
    const analysis = JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim())

    const { data, error } = await supabase
      .from('ideas')
      .insert(stampRow({
        kind: 'inspiration',
        text: analysis.title || safeHost(url) || 'Saved inspiration',
        source_url: url?.trim() || null,
        content: sourceText.slice(0, 4000) || null,
        image_url: image_url || ogImage || null,
        enrichment: analysis,
      }, pid))
      .select()
      .single()
    if (error) {
      const msg2 = error.message.includes('column') || error.message.includes('schema cache')
        ? 'Inspiration columns missing — run sql/setup_inspiration.sql in the Supabase SQL editor'
        : error.message
      return NextResponse.json({ error: msg2 }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Analysis failed' }, { status: 502 })
  }
}
