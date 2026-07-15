export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const pid = await getActiveProject()
  const { data, error } = await scoped(supabase.from('competitors').select('*'), pid)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { name, notes } = await req.json()
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const pid = await getActiveProject()
  const { data, error } = await supabase
    .from('competitors')
    .insert(stampRow({ name: name.trim(), notes: notes ?? null, source: 'manual' }, pid))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  const { error } = await supabase.from('competitors').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
