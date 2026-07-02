import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const pid = await getActiveProject()
  const query = db.from('brand_files').select('id, file_name, file_type, created_at')
  const { data } = await scoped(query, pid).order('created_at', { ascending: true })
  return NextResponse.json({ files: data ?? [] })
}
