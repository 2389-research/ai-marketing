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
  format: string | null
  pillar_id: string | null
  visual_brief: string | null
  posted_at: string | null
  project_id?: string | null
}

export interface QARule {
  id: string
  created_at: string
  label: string
  rule_text: string
  channels: string[] | null   // null/empty = applies to every channel
  active: boolean
  project_id?: string | null
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
  pinterest_url: string | null
  reddit_url: string | null
  threads_url: string | null
  additional_links: string[] | null
  manual_notes: string | null
  strategy: string | null
  strategy_updated_at: string | null
  last_website_scraped: string | null
  preferred_channels: string[] | null
  linked_topic_cap_ratio: number | null
  created_at: string
  updated_at: string
}

export interface ChannelAuditFindings {
  posts_in_period: number
  cadence_target_per_week: number
  cadence_actual_per_week: number
  content_mix_by_format: Record<string, number>
  content_mix_by_pillar: Record<string, number>
  engagement: {
    posts_analyzed: number
    median_percentile_this_period?: number
    label: string
  }
  hook_patterns: {
    top_pattern?: string
    bottom_pattern?: string
    hypothesis?: string
    sample_note?: string
  } | null
}

export interface AuditReport {
  id: string
  project_id: string | null
  period_start: string
  period_end: string
  findings: {
    channels: Record<string, ChannelAuditFindings>
    recommendations: string[]
  }
  created_at: string
}

export interface Competitor {
  id: string
  project_id: string | null
  name: string
  notes: string | null
  source: 'manual' | 'inferred'
  created_at: string
}

export interface CompetitorSummary {
  name: string
  positioning_summary: string
  notable_moves: string[]
  audience_reaction: string
  sources: string[]
}

export interface CompetitorReport {
  id: string
  project_id: string | null
  findings: {
    competitors: CompetitorSummary[]
    gaps: string[]
    whitespace_angles: string[]
    shared_themes: string[]
  }
  generated_at: string
}

export interface ContentPillar {
  id: string
  project_id: string | null
  brief_id: string | null
  name: string
  description: string | null
  pillar_type: 'theme' | 'product'
  target_ratio: number
  example_topics: string[]
  status: 'approved' | 'archived'
  created_at: string
  approved_at: string | null
}

export interface BrandFile {
  id: string
  file_name: string
  file_type: string
  extracted_text: string | null
  storage_path: string | null
  created_at: string
}
