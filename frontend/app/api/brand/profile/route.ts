import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data } = await db
    .from('brand_profile')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return NextResponse.json({ profile: data ?? null })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data: existing } = await db
    .from('brand_profile')
    .select('id, website_url')
    .limit(1)
    .maybeSingle()

  if (existing) {
    // If the website URL changed, reset the scrape cooldown so research picks it up immediately
    const websiteChanged = body.website_url !== undefined && body.website_url !== existing.website_url
    const update = {
      ...body,
      updated_at: new Date().toISOString(),
      ...(websiteChanged ? { last_website_scraped: null } : {}),
    }

    const { data, error } = await db
      .from('brand_profile')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ profile: data, website_reset: websiteChanged })
  }

  const { data, error } = await db
    .from('brand_profile')
    .insert(body)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
