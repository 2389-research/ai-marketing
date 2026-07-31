export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const pid = await getActiveProject()
  const { data, error } = await scoped(supabase.from('ideas').select('*'), pid)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) {
    const msg = error.message.includes('does not exist') || error.message.includes('schema cache')
      ? 'Table "ideas" not found — run sql/setup_ideas.sql in the Supabase SQL editor'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const pid = await getActiveProject()
  const { data, error } = await supabase
    .from('ideas')
    .insert(stampRow({ text: text.trim() }, pid))
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, status, board } = await req.json()
  if (!id || (!status && !board)) return NextResponse.json({ error: 'id and status/board required' }, { status: 400 })
  const update: Record<string, unknown> = {}
  if (status) update.status = status
  if (board) update.board = board
  const { error } = await supabase.from('ideas').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const { error } = await supabase.from('ideas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
