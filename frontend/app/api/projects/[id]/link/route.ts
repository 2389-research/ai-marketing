export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Marks this project as sharing real social channels with another project
// (or clears the link when linked_project_id is null). See getChannelGroupIds
// in lib/project.ts for how this pairing is resolved from either side.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { linked_project_id } = await req.json()

  const { error } = await db
    .from('projects')
    .update({ linked_project_id: linked_project_id || null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
