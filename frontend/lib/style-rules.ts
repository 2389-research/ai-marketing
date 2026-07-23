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
]

const SLOP_WARNING_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /\bseamless(ly)?\b/i, message: "'seamless' is marketing filler — name what actually happens" },
  { re: /\beffortless(ly)?\b/i, message: "'effortless' is marketing filler" },
  { re: /\brobust\b/i, message: "'robust' is filler unless you say what survives what" },
  { re: /\bthe (result|best part|bottom line)\?/i, message: "'The result?' one-word-question pattern reads AI" },
]

export const MAX_EM_DASHES = 1

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
  ].join('\n')
}
