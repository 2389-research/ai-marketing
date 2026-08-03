// Anti-AI-slop style rules — TypeScript mirror of agents/style_rules.py.
// KEEP IN SYNC: the Python file is the source of truth for the pipeline
// (content_agent prompt + qa_agent enforcement); this mirror covers the
// TS-only writing paths (the Write page's /api/drafts/generate + compose).
// If you add a word or pattern in one file, add it to the other.

export const AI_SLOP_WORDS = [
  'delve', 'tapestry', 'testament to', 'pivotal', 'boasts', 'stands as',
  'serves as a', 'game-changer', 'game changer', 'cutting-edge',
  'revolutionary', 'revolutionize', 'unlock the', 'unleash', 'elevate your',
  'supercharge', 'synergy', 'leverage the power', 'harness the power',
  "in today's fast-paced", "in today's world", 'in an era of',
  'in a world where', 'let that sink in', 'goes without saying',
  'look no further', 'we are excited to announce', "we're excited to announce",
  'buckle up', 'dive deep into', 'a deep dive into',
]

const SLOP_PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /\b(is|are|was|were|it)?n[o']t\s+just\s+(a\s+|an\s+|about\s+)?\w[^.!?\n]{0,60}?\b(it'?s|they'?re|this is)\b/i,
    message: "the 'it's not just X, it's Y' construction — state the point directly instead",
  },
  {
    re: /\bnot\s+only\b[^.!?\n]{0,80}\bbut\s+(also\b|it\b|the\b)/i,
    message: "the 'not only … but also' construction",
  },
  {
    re: /,\s+(highlighting|showcasing|underscoring|emphasizing|signaling|demonstrating|reflecting|illustrating)\s/i,
    message: "fake-depth '-ing' clause (', highlighting how…') — make it a real sentence or cut it",
  },
  {
    re: /^(imagine\s|picture this|what if i told you|ever wondered|we've all been there|let's face it|let's be honest)/i,
    message: 'a cliché AI opener — start with the actual point or a concrete detail',
  },
  {
    re: /\?\s*(here'?s the (thing|kicker|catch)|the answer( is|:)|spoiler( alert)?:)/i,
    message: "the rhetorical-question-then-'here's the thing' pattern",
  },
  {
    re: /\b(\w{3,})[.!?]['"\u201d]?\s+[^.!?\n]{0,60}?\b\1[.!?]/i,
    message: "consecutive sentences ending on the same word ('...gone. Not annoyed gone.') — the echo device reads as AI",
  },
  {
    re: /(?:^|[.!?]\s+)not\s+[^.!?\n]{1,40}[.!?]\s+not\s/i,
    message: "the 'Not X. Not Y.' escalation pattern",
  },
]

const SLOP_WARNING_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /\bseamless(ly)?\b/i, message: "'seamless' is marketing filler — name what actually happens" },
  { re: /\beffortless(ly)?\b/i, message: "'effortless' is marketing filler" },
  { re: /\brobust\b/i, message: "'robust' is filler unless you say what survives what" },
  { re: /\bthe (result|best part|bottom line)\?/i, message: "'The result?' one-word-question pattern reads AI" },
  { re: /;/, message: 'semicolon in a social post — use a period or comma' },
]

export const MAX_EM_DASHES = 1

// Section labels like [HOOK]/[CTA] in scripts aren't sentences.
const SECTION_LABEL = /^\s*\[[A-Z][A-Z /-]*\]\s*$/gm

// The staccato tell: chains of clipped fragments — currently the most
// recognizable LLM cadence. One fragment is seasoning; runs of them are AI.
function rhythmIssues(text: string): string[] {
  const t = text.replace(SECTION_LABEL, '')
  const sents = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
  if (sents.length === 0) return []
  const wc = sents.map(s => s.split(/\s+/).length)
  const issues: string[] = []

  let run = 0, maxRun = 0
  for (const n of wc) {
    run = n <= 4 ? run + 1 : 0
    maxRun = Math.max(maxRun, run)
  }
  if (maxRun >= 3) {
    issues.push(`AI-style rhythm: ${maxRun} ultra-short sentences in a row — merge the fragments into full sentences (at most ONE fragment per post)`)
  }
  if (wc.length >= 6 && wc.filter(n => n <= 5).length / wc.length > 0.5) {
    issues.push('AI-style rhythm: over half the sentences are under 6 words — the staccato cadence reads as AI; write mostly complete sentences')
  }
  return issues
}

export function checkAiSlop(text: string): { issues: string[]; warnings: string[] } {
  const issues: string[] = []
  const warnings: string[] = []

  const dashCount = (text.match(/[—–]/g) ?? []).length
  if (dashCount > MAX_EM_DASHES) {
    issues.push(
      `AI-style: ${dashCount} em dashes (max ${MAX_EM_DASHES}) — replace with periods, commas, or restructure the sentences`,
    )
  }

  const lower = text.toLowerCase()
  const hitWords = AI_SLOP_WORDS.filter(w => lower.includes(w))
  if (hitWords.length > 0) {
    const quoted = hitWords.slice(0, 6).map(w => `"${w}"`).join(', ')
    issues.push(`AI-style wording: ${quoted} — rewrite in plain, specific language`)
  }

  for (const { re, message } of SLOP_PATTERNS) {
    if (re.test(text)) issues.push(`AI-style structure: ${message}`)
  }
  issues.push(...rhythmIssues(text))
  for (const { re, message } of SLOP_WARNING_PATTERNS) {
    if (re.test(text)) warnings.push(`Possible AI-style wording: ${message}`)
  }

  return { issues, warnings }
}

/** The style section for TS-side writer prompts — mirrors the pipeline writer's rules. */
export function styleRulesPromptBlock(): string {
  return [
    '## Writing rules — avoid AI patterns (a hard automated QA check enforces these; violations FAIL the draft)',
    `BANNED WORDS/PHRASES: ${AI_SLOP_WORDS.join(', ')}.`,
    'BANNED STRUCTURES:',
    "- \"it's not just X, it's Y\" and \"not only … but also\" constructions",
    "- fake-depth '-ing' clauses (', highlighting how…', ', showcasing the…')",
    "- cliché openers: 'Imagine…', 'Picture this', 'What if I told you', 'Let's face it'",
    "- rhetorical question followed by 'here's the thing / the answer is'",
    `- more than ${MAX_EM_DASHES} em dash in the whole post — prefer periods and commas`,
    'WRITE LIKE A HUMAN: vary sentence length, be specific over vague, have an opinion, simple copulas (is/are), cite real things.',
    'VOICE MECHANICS: active voice; address the reader as you/your where it fits; definitive statements over hedging when safe (never invent stats or quotes); no semicolons — period or comma; casual simplified grammar is fine on casual channels.',
    'RHYTHM (hard-checked): write mostly COMPLETE sentences of varied length. At most ONE short fragment per post. NEVER chain 2+ fragments ("Poof. Gone. Vanished."), never end consecutive sentences on the same word ("...gone. Not annoyed gone."), never use the "Not X. Not Y. Z." escalation — these staccato devices are the most recognizable AI tells.',
  ].join('\n')
}
