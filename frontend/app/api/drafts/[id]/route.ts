import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Hard delete — distinct from /reject, which only sets status: 'rejected'
// and keeps the row. This permanently removes the draft.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // The approve route writes a published_posts bookkeeping row referencing the
  // draft (FK draft_id) — it blocks deletion of any approved draft. The user
  // is explicitly and permanently removing this draft, so its bookkeeping row
  // (and the topic-avoidance memory it carries) goes with it.
  const { error: childError } = await supabase
    .from('published_posts')
    .delete()
    .eq('draft_id', params.id)
  if (childError) return NextResponse.json({ error: childError.message }, { status: 500 })

  const { error } = await supabase
    .from('generated_drafts')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
