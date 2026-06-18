import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { scheduled_for } = await req.json()

  if (!scheduled_for) {
    return NextResponse.json({ error: 'scheduled_for is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('generated_drafts')
    .update({ scheduled_for: new Date(scheduled_for).toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
