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
  media: string[] | null
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
  source_category: string | null
  metadata: {
    video_id?: string
    view_count?: number
    like_count?: number
    comment_count?: number
    channel?: string
    thumbnail?: string
    published_at?: string
    term?: string
    related_to?: string
    value?: number
    type?: string
    trend_topic?: string
    hook?: string
  } | null
}

export interface BrandProfile {
  id: string
  company_name: string | null
  website_url: string | null
  linkedin_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  x_url: string | null
  additional_links: string[] | null
  manual_notes: string | null
  strategy: string | null
  strategy_updated_at: string | null
  last_website_scraped: string | null
  preferred_channels: string[] | null
  created_at: string
  updated_at: string
}

export interface BrandFile {
  id: string
  file_name: string
  file_type: string
  extracted_text: string | null
  storage_path: string | null
  created_at: string
}
