export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const db     = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

export async function POST() {
  // fetch profile
  const { data: profile } = await db
    .from('brand_profile')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'No brand profile found. Save your profile first.' }, { status: 404 })

  // fetch files (extracted text only)
  const { data: files } = await db
    .from('brand_files')
    .select('file_name, file_type, extracted_text')
    .order('created_at', { ascending: true })

  // scrape website
  let websiteContent = ''
  if (profile.website_url) {
    websiteContent = await scrapeUrl(profile.website_url)
  }

  // build context block
  const profileBlock = [
    `Company: ${profile.company_name ?? 'Unknown'}`,
    profile.website_url    && `Website: ${profile.website_url}`,
    profile.linkedin_url   && `LinkedIn: ${profile.linkedin_url}`,
    profile.instagram_url  && `Instagram: ${profile.instagram_url}`,
    profile.tiktok_url     && `TikTok: ${profile.tiktok_url}`,
    profile.youtube_url    && `YouTube: ${profile.youtube_url}`,
    profile.manual_notes   && `\nManual notes:\n${profile.manual_notes}`,
  ].filter(Boolean).join('\n')

  const websiteBlock = websiteContent
    ? `\n--- Website content (${profile.website_url}) ---\n${websiteContent}`
    : ''

  const filesBlock = (files ?? [])
    .filter(f => f.extracted_text)
    .map(f => `\n--- ${f.file_name} (${f.file_type}) ---\n${f.extracted_text!.slice(0, 4_000)}`)
    .join('\n')

  const fullContext = [profileBlock, websiteBlock, filesBlock].filter(Boolean).join('\n\n')

  const completion = await openai.chat.completions.create({
    model:      'gpt-4o',
    max_tokens: 3_500,
    messages: [
      {
        role: 'system',
        content: `You are a senior marketing strategist. Analyze the company information provided and write a comprehensive, specific, actionable marketing strategy.

Use these exact markdown sections:

## Brand Overview
What the company is, its mission, and unique market position.

## Target Audience
Primary and secondary audiences — demographics, interests, pain points, what they care about.

## Content Pillars
3–5 core themes to own consistently across all channels. Each pillar: name + one-line description + example topics.

## Channel Strategy
For each relevant channel (LinkedIn, Instagram, TikTok, Email, YouTube):
- Primary goal on this channel
- Content format that works best
- Tone and style
- What NOT to post there

## Voice & Tone
How to write: 5 adjectives that describe the voice, 2 example lines showing the right tone, 3 phrases to never use.

## Posting Frequency
Exact recommended number of posts per channel per week, with best days/times.

## 90-Day Priorities
The 3 most important things to focus on in the next 90 days, with a concrete first action for each.

Be specific and opinionated. Reference the actual company, not generic advice.`,
      },
      {
        role: 'user',
        content: `Here is everything I know about this company:\n\n${fullContext}\n\nWrite the marketing strategy now.`,
      },
    ],
  })

  const strategy = completion.choices[0].message.content ?? ''

  // save to profile
  const { data: updated, error } = await db
    .from('brand_profile')
    .update({ strategy, strategy_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profile.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategy, profile: updated })
}
