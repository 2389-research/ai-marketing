import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { feedback } = await req.json()

  // Scope to the caller's active brand (issue #8) — another company's draft id
  // updates nothing and returns 404.
  const pid = await getActiveProject()
  const { data, error } = await supabase
    .from('generated_drafts')
    .update({
      status: 'needs_edit',
      notes: `Edit requested via dashboard: ${feedback}`,
    })
    .eq('id', params.id)
    .eq('project_id', pid)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
