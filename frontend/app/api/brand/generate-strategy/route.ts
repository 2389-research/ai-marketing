export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const db       = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function scrapeUrl(url: string): Promise<string> {
  try {
    const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8_000) })
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8_000)
  } catch {
    return ''
  }
}

const CHANNEL_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', email: 'Email',
  tiktok: 'TikTok', youtube: 'YouTube', x: 'X (Twitter)',
  instagram_stories: 'Instagram Stories', youtube_shorts: 'YouTube Shorts',
  pinterest: 'Pinterest', reddit: 'Reddit', threads: 'Threads',
}

export async function POST() {
  const pid = await getActiveProject()

  // fetch profile
  const { data: profile } = await scoped(db.from('brand_profile').select('*'), pid)
    .limit(1)
    .maybeSingle()

  // If this project shares real social channels with another one (see
  // getChannelGroupIds), tell the model to write that project's product as
  // exactly one bounded Content Pillar rather than let it organically
  // dominate — the linked project already runs its own dedicated campaign
  // for it. Fails open (empty instruction) pre-migration or on any error.
  let linkedPillarInstruction = ''
  try {
    const { data: projectRow } = await db.from('projects').select('linked_project_id').eq('id', pid).maybeSingle()
    const linkedId = (projectRow as any)?.linked_project_id
    if (linkedId) {
      const { data: linkedProfile } = await db.from('brand_profile').select('company_name').eq('project_id', linkedId).maybeSingle()
      const linkedName = linkedProfile?.company_name || 'the linked project'
      linkedPillarInstruction = `\n\nOne more thing: this company shares its real social channels with ${linkedName}, which runs its own dedicated, ongoing marketing campaign. In the Content Pillars section, include ${linkedName} as exactly ONE bounded pillar — not the dominant theme — and note in that pillar's description that ${linkedName} already has its own dedicated campaign, so this pillar should stay a supporting, occasional mention rather than the main focus.`
    }
  } catch {
    // pre-migration (linked_project_id column doesn't exist yet) — proceed with no instruction
  }

  if (!profile) return NextResponse.json({ error: 'No brand profile found. Save your profile first.' }, { status: 404 })

  // fetch files (extracted text only)
  const { data: files } = await scoped(db.from('brand_files').select('file_name, file_type, extracted_text'), pid)
    .order('created_at', { ascending: true })

  // scrape website
  let websiteContent = ''
  if (profile.website_url) {
    websiteContent = await scrapeUrl(profile.website_url)
  }

  // resolve active channels
  const activeChannels: string[] = (profile as any).preferred_channels?.length
    ? (profile as any).preferred_channels
    : ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x']
  const activeChannelNames = activeChannels.map(c => CHANNEL_NAMES[c] ?? c).join(', ')

  // build context block
  const profileBlock = [
    `Company: ${profile.company_name ?? 'Unknown'}`,
    profile.website_url     && `Website: ${profile.website_url}`,
    profile.linkedin_url    && `LinkedIn: ${profile.linkedin_url}`,
    profile.instagram_url   && `Instagram: ${profile.instagram_url}`,
    profile.tiktok_url      && `TikTok: ${profile.tiktok_url}`,
    profile.youtube_url     && `YouTube: ${profile.youtube_url}`,
    (profile as any).x_url  && `X: ${(profile as any).x_url}`,
    (profile as any).pinterest_url && `Pinterest: ${(profile as any).pinterest_url}`,
    (profile as any).reddit_url    && `Reddit: ${(profile as any).reddit_url}`,
    (profile as any).threads_url   && `Threads: ${(profile as any).threads_url}`,
    profile.manual_notes    && `\nManual notes:\n${profile.manual_notes}`,
    `\nActive channels: ${activeChannelNames}`,
  ].filter(Boolean).join('\n')

  const websiteBlock = websiteContent
    ? `\n--- Website content (${profile.website_url}) ---\n${websiteContent}`
    : ''

  const filesBlock = (files ?? [])
    .filter(f => f.extracted_text)
    .map(f => `\n--- ${f.file_name} (${f.file_type}) ---\n${f.extracted_text!.slice(0, 4_000)}`)
    .join('\n')

  const fullContext = [profileBlock, websiteBlock, filesBlock].filter(Boolean).join('\n\n')

  const strategyMsg = await anthropic.messages.create({
    model:      'claude-sonnet-5',
    max_tokens: 4_500,
    system: `You are a senior marketing strategist and brand consultant. Analyze the company information and write a comprehensive, honest, and actionable marketing strategy.

Be specific. Name the actual company, reference real things you found on their website or in their notes. Generic advice is useless — every recommendation must be grounded in what this company actually does.

Use these exact markdown sections in this order:

## Brand Overview
What this company is, what they make or do, their mission, and what makes them distinct from competitors. 2–3 focused paragraphs.

## Target Audience
**Primary audience:** who they are, what they care about, what problem they're solving.
**Secondary audience:** who else benefits.
For each: include demographics, motivations, and the specific question they need answered before they'll trust this brand.

## Strengths ✦
What this brand already has going for it — real advantages in content, product, positioning, or audience. Be specific.
Format: bullet list, each point starting with a ✦ symbol. Minimum 4 points. Reference actual things from their profile/website.

## Gaps & Weaknesses ✗
Honest assessment of what's missing, unclear, or working against them right now in their marketing. Don't soften it.
Format: bullet list, each point starting with a ✗ symbol. Minimum 4 points. Be direct — a gap they can't see is more damaging than one they can.

## Turning Gaps into Opportunities →
For each gap identified above, a concrete reframe: how that specific weakness becomes a competitive advantage if addressed.
Format: **Gap:** [restate the gap] → **Opportunity:** [specific action that flips it]. One per gap.

## Content Pillars
3–5 core themes this brand should own consistently. For each pillar:
- **Name** — one-line description
- Why it works for this brand specifically
- 3 example post topics

## Channel Strategy
Only cover the active channels listed in the company profile. For each channel:
**[Channel name]**
- Goal: what this channel should achieve
- Best format: what type of content performs here for this brand
- Tone: how to write/speak here
- Avoid: one thing that kills engagement on this channel for this type of brand

## Voice & Tone
- **5 adjectives** that define the voice
- **Sounds like:** 2 example sentences in the right tone
- **Never say:** 3 phrases that would feel off-brand

## Posting Frequency
Table format — channel, posts per week, best day(s), best time(s). Only include active channels.

## 90-Day Action Plan
The 3 highest-leverage moves for the next 90 days. For each:
- What to do
- Why it matters right now (not eventually)
- The single first action to take this week${linkedPillarInstruction}`,
    messages: [
      {
        role: 'user',
        content: `Here is everything I know about this company:\n\n${fullContext}\n\nWrite the full marketing strategy now. Be honest, specific, and useful.`,
      },
    ],
  })

  const strategy = (strategyMsg.content.find(b => b.type === 'text') as any)?.text ?? ''

  // extract recommended posting cadence from the strategy
  let posting_cadence: Record<string, number> = {}
  try {
    const cadenceMsg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Based on the marketing strategy below, recommend a weekly posting cadence for each of these channels: ${activeChannels.join(', ')}.
Be realistic — typical range is 1–7 posts/week per channel. Set to 0 if a channel is not recommended for this brand.
Respond ONLY with valid JSON, no markdown fences: {"linkedin": 3, "instagram": 5, ...}`,
      messages: [{ role: 'user', content: strategy }],
    })
    const raw = ((cadenceMsg.content.find(b => b.type === 'text') as any)?.text ?? '{}').trim()
    posting_cadence = JSON.parse(raw.startsWith('```') ? raw.split('```')[1].replace(/^json/, '') : raw)
  } catch {
    // cadence extraction is best-effort — don't fail the whole request
  }

  // save to profile
  const { data: updated, error } = await db
    .from('brand_profile')
    .update({
      strategy,
      strategy_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(Object.keys(posting_cadence).length > 0 ? { posting_cadence } : {}),
    })
    .eq('id', profile.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategy, posting_cadence, profile: updated })
}
