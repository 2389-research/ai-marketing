export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await db
    .from('projects')
    .select('id, name, created_at')
    .order('created_at')
  if (error) {
    // Pre-migration: table missing — report empty so the UI hides the switcher
    return NextResponse.json([])
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: project, error } = await db
    .from('projects')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Every project owns exactly one brand profile row — create it empty so the
  // Brand page has something to edit immediately after switching.
  await db.from('brand_profile').insert({ company_name: name.trim(), project_id: project.id })

  return NextResponse.json(project)
}
