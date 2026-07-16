import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/drafts/[id]/mark-posted — you posted this yourself somewhere;
// record it. Separate from `status` (still 'approved') since auto-posting
// is disabled and "approved" no longer implies "posted".
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase
    .from('generated_drafts')
    .update({ posted_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
