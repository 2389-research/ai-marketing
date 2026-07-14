import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Hard delete — distinct from /reject, which only sets status: 'rejected'
// and keeps the row. This permanently removes the draft.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase
    .from('generated_drafts')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
