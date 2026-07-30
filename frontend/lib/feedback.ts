// Capture layer of the learning loop: every explicit judgment the user makes
// becomes a feedback_events row. cron_learn.py distills these (plus derived
// signals) into the brand's learned-lessons memo nightly.
// Fire-and-forget by design: capture must never block or break a user action,
// and must degrade silently until sql/setup_learning.sql is applied.

import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient } from '@/lib/project'

export type FeedbackEvent = {
  draft_id?: string
  event_type: 'rejected' | 'edited' | 'final_edit' | 'edit_requested'
  channel?: string
  topic?: string
  reason?: string
  before_text?: string
  after_text?: string
}

export async function logFeedback(ev: FeedbackEvent): Promise<void> {
  try {
    const pid = await resolveActiveProjectClient()
    await supabase.from('feedback_events').insert({ ...ev, ...(pid ? { project_id: pid } : {}) })
  } catch {
    /* capture is best-effort — never surface an error for it */
  }
}

export const REJECT_REASONS = [
  'Off-brand',
  'Boring',
  'Sounds like AI',
  'Wrong facts',
  'Bad topic',
] as const
