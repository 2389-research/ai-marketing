import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface Draft {
  id: string
  created_at: string
  topic: string
  channel: string
  draft_text: string
  qa_passed: boolean | null
  qa_issues: string[] | null
  status: string
  approved_at: string | null
  notes: string | null
  scheduled_for: string | null
}

export interface ResearchCandidate {
  id: string
  created_at: string
  title: string
  summary: string | null
  source: string
  source_url: string | null
  score: number
  score_reason: string | null
  selected: boolean
}
