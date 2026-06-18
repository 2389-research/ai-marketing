import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data } = await db
    .from('brand_files')
    .select('id, file_name, file_type, created_at')
    .order('created_at', { ascending: true })
  return NextResponse.json({ files: data ?? [] })
}
