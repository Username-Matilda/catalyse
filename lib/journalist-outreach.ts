/**
 * EXPERIMENTAL: People for a Pause journalist outreach trial. To remove it:
 * 1. Delete the EXPERIMENTAL block in prisma/schema.prisma and add a migration dropping the
 *    experimental_* tables.
 * 2. Delete this file, app/people-for-a-pause-protest-journalist-outreach/,
 *    app/admin/people-for-a-pause-protest-journalist-outreach/ and
 *    server/routers/{,admin/}journalistOutreach.ts with their tests.
 * 3. Remove the router entries in server/router.ts, the admin link in app/admin/page.tsx,
 *    the outreach header in lib/client.ts and the outreach login email in lib/email.ts.
 */
import {
  ExperimentalJournalistLeaning as JournalistLeaning,
  ExperimentalLeaningConfidence as LeaningConfidence,
} from '@/generated/prisma/enums'

export const CLAIM_MINUTES = 20
export const CLAIM_MS = CLAIM_MINUTES * 60 * 1000
export const PRESS_EMAIL = 'press@pauseai.info'
export const OUTREACH_PATH = '/people-for-a-pause-protest-journalist-outreach'
export const OUTREACH_TOKEN_HEADER = 'x-outreach-token'
export const OUTREACH_TOKEN_STORAGE_KEY = 'outreachToken'
export const OUTREACH_SESSION_EXPIRED = 'OUTREACH_SESSION_EXPIRED'

/** A claim made before this moment has lapsed and the journalist is free again. */
export const claimCutoff = (now = new Date()) => new Date(now.getTime() - CLAIM_MS)

export type JournalistStatus = 'available' | 'claimed' | 'contacted'

export function journalistStatus(
  j: { contactedAt: Date | null; claimedAt: Date | null },
  now = new Date(),
): JournalistStatus {
  if (j.contactedAt) return 'contacted'
  if (j.claimedAt && j.claimedAt > claimCutoff(now)) return 'claimed'
  return 'available'
}

// Bracketed lines are prompts for the volunteer to replace before sending.
// [text](https://…) marks a link; see renderEmail.
const COXON_RESIGNATION_URL = 'https://x.com/hilbertspaess/status/2097476196791709843'
const TEMPLATES: Record<JournalistLeaning, { subject: string; body: string }> = {
  REPUBLICAN: {
    subject: 'PAUSE NOT PACE - PAUSE AI',
    body: `Dear {{firstName}},

[Add a personal opening sentence: perhaps pick up on other AI articles covered by the outlet if possible]

[Jacob Coxon’s resignation](${COXON_RESIGNATION_URL}) from the AI company Anthropic over human extinction concerns has gone viral, with over 170 million views. More than 1,380 employees of OpenAI, Anthropic, Google DeepMind, and Meta, including CEOs, have also signed a statement asking the U.S. government to deliberately slow the frontier.

But the real story here is that ordinary people are ahead of the debate. Half of all Americans say they are concerned that AI “will cause the end of the human race on Earth,” and two thirds think it is advancing too quickly (YouGov, September 14). The American people want a pause, not just Big Tech.

I’m a volunteer at PauseAI Global. We’re a grassroots coalition of hardworking everyday people from all walks of life, not Democrat lobbyists or coastal elites. We want a PAUSE, NOT A PACE. Senator Hawley’s already asking the tough questions; we can connect you to the people outside the Beltway asking them too.

A local partner organization — People for a Pause — is running a protest in Washington DC on Saturday September 19th 2-4pm, calling for President Trump and Xi Jinping to make an AI pause deal.

Racing China recklessly means building technology that destroys the value of work and hands government and big tech the tools for Orwellian surveillance. We don’t need to trust China to beat them. Innovative verification technologies would let the US negotiate from strength, without ever taking their word for it.

The US can continue to lead the world on AI and automation without jeopardizing our national security by creating dangerous frontier models.

Available for interview: Maxime Fournes, CEO of Pause AI Global, Irina Tavera, Organizing Director for PauseAI Global, and local volunteers by video or in person: Crissie McMullan, Ben Aybar, and others.

Sincerely,
{{volunteerName}}
[personal phone number, if you are happy to provide it]

PauseAI press email: press@pauseai.info`,
  },
  DEMOCRAT: {
    subject: 'PAUSE NOT PACE - PAUSE AI',
    body: `Dear {{firstName}},

[Add a personal opening sentence: perhaps pick up on other AI articles covered by the outlet if possible]

[Jacob Coxon’s resignation](${COXON_RESIGNATION_URL}) from the AI company Anthropic over concerns regarding human extinction has gone viral. When over 1,380 employees of OpenAI, Anthropic, Google DeepMind, and Meta - including CEOs - sign a statement urging the government to slow AI development, that’s no longer “hysteria” but whistleblower testimony from inside the industry.

But the mainstream media keeps missing something crucial: the public is ahead of the debate. Half of Americans fear AI “will cause the end of the human race on Earth,” and two-thirds say it’s advancing too fast (YouGov, September 14). The American people want a pause, not just tech elites.

I’m a volunteer with PauseAI, a grassroots coalition of everyday Americans. We’re not lobbyists or industry insiders, we’re not political hacks, and we’re not techno-utopians or EA accelerationists. We’re teachers, engineers, students, parents — people watching powerful tech companies race ahead with minimal oversight, and smart enough to know what the consequences could be.

A similar organization — People for a Pause — is running a protest in Washington DC on Saturday September 19th 2-4pm, calling for President Trump and Xi Jinping to make an AI pause deal. This isn’t just the US against China — it’s humanity against the machines, and no country wins that one alone.

We can connect you to the ordinary people calling for an international moratorium right now, and help to reclaim the narrative and address Americans’ calls for a pause.

Available for interview: Maxime Fournes, CEO of Pause AI Global, Irina Tavera, Organizing Director for PauseAI Global, and local volunteers by video or in person: Crissie McMullan, Ben Aybar, and others.

Sincerely,
{{volunteerName}}
[personal phone number, if you are happy to provide it]

PauseAI press email: press@pauseai.info`,
  },
}

export type EmailPart = string | { text: string; url: string }

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Fills a template three ways: `parts` for display, `body` as plain text for mail-app links
 * (which cannot carry hyperlinks, so each link becomes "text (url)"), and `html` for pasting
 * into a mail client with the links intact.
 */
export function renderEmail(
  journalist: {
    firstName: string
    lastName: string
    organisation: string
    leaning: JournalistLeaning
  },
  volunteerName: string,
): { subject: string; body: string; html: string; parts: EmailPart[] } {
  const values: Record<string, string> = {
    firstName: journalist.firstName,
    lastName: journalist.lastName,
    organisation: journalist.organisation,
    volunteerName: volunteerName.trim() || '[Your name]',
  }
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key])
  const template = TEMPLATES[journalist.leaning]

  // Links are split out before filling, so names can never be read as link markup.
  const parts: EmailPart[] = []
  let last = 0
  for (const m of template.body.matchAll(LINK_RE)) {
    parts.push(fill(template.body.slice(last, m.index)), { text: m[1], url: m[2] })
    last = m.index + m[0].length
  }
  parts.push(fill(template.body.slice(last)))

  const body = parts.map((p) => (typeof p === 'string' ? p : `${p.text} (${p.url})`)).join('')
  const html = parts
    .map((p) =>
      typeof p === 'string'
        ? escapeHtml(p).replace(/\n/g, '<br>')
        : `<a href="${escapeHtml(p.url)}">${escapeHtml(p.text)}</a>`,
    )
    .join('')
  return { subject: fill(template.subject), body, html, parts }
}

export function composeLinks(to: string, subject: string, body: string) {
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()
  return {
    mailto: `mailto:${to}?${q({ cc: PRESS_EMAIL, subject, body }).replace(/\+/g, '%20')}`,
    gmail: `https://mail.google.com/mail/?${q({ view: 'cm', fs: '1', to, cc: PRESS_EMAIL, su: subject, body })}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?${q({ to, cc: PRESS_EMAIL, subject, body })}`,
  }
}

export const fullName = (j: { firstName: string; lastName: string }) =>
  `${j.firstName} ${j.lastName}`

/** CSV header → field. Headers match case-insensitively; unlisted columns are ignored. */
export const CSV_COLUMNS = {
  firstName: { header: 'First name', required: true },
  lastName: { header: 'Last name', required: true },
  email: { header: 'Email', required: true },
  organisation: { header: 'Organisation', required: true },
  leaning: { header: 'Leaning', required: true },
  leaningConfidence: { header: 'Leaning confidence', required: false },
  category: { header: 'Category', required: false },
  priorityTier: { header: 'Priority/Tier', required: false },
  medium: { header: 'Medium', required: false },
  website: { header: 'Website', required: false },
  interests: { header: 'Interests/areas of activity', required: false },
  notes: { header: 'Notes', required: false },
} as const

type Field = keyof typeof CSV_COLUMNS
type TextField = Exclude<
  { [K in Field]: (typeof CSV_COLUMNS)[K]['required'] extends true ? never : K }[Field],
  'priorityTier' | 'leaningConfidence'
>

export type JournalistRow = {
  firstName: string
  lastName: string
  email: string
  organisation: string
  leaning: JournalistLeaning
  leaningConfidence: LeaningConfidence | null
  priorityTier: number | null
} & Record<TextField, string | null>

export const otherLeaning = (leaning: JournalistLeaning) =>
  leaning === JournalistLeaning.REPUBLICAN
    ? JournalistLeaning.DEMOCRAT
    : JournalistLeaning.REPUBLICAN

/** Volunteers may switch templates unless the leaning is known with high confidence. */
export const canSwitchTemplate = (confidence: LeaningConfidence | null) =>
  confidence !== LeaningConfidence.HIGH

/** The first whole number in a tier cell: "1" and "Tier 1 - VIP" both give 1. */
export function parsePriorityTier(cell: string): number | null {
  const match = cell.match(/\d+/)
  return match ? Number(match[0]) : null
}

export interface CsvParseResult {
  /** Required headers the CSV lacks; when any are missing no rows are parsed. */
  missingColumns: string[]
  valid: (JournalistRow & { line: number })[]
  invalid: { line: number; raw: string; reason: string }[]
}

/** Splits CSV text into records of fields, honouring double-quoted fields with "" escapes. */
function splitCsv(text: string): { line: number; fields: string[]; raw: string }[] {
  const records: { line: number; fields: string[]; raw: string }[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let startLine = 1
  let raw = ''
  const endRecord = () => {
    fields.push(field)
    if (fields.some((f) => f.trim() !== '')) records.push({ line: startLine, fields, raw })
    fields = []
    field = ''
    raw = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        raw += '""'
        i++
        continue
      }
      if (c === '"') quoted = false
      else field += c
      if (c === '\n') line++
      raw += c
      continue
    }
    if (c === '"') {
      quoted = true
      raw += c
    } else if (c === ',') {
      fields.push(field)
      field = ''
      raw += c
    } else if (c === '\n') {
      endRecord()
      line++
      startLine = line
    } else if (c !== '\r') {
      field += c
      raw += c
    }
  }
  endRecord()
  return records
}

const LEANINGS: Record<string, JournalistLeaning> = {
  r: JournalistLeaning.REPUBLICAN,
  rep: JournalistLeaning.REPUBLICAN,
  republican: JournalistLeaning.REPUBLICAN,
  d: JournalistLeaning.DEMOCRAT,
  dem: JournalistLeaning.DEMOCRAT,
  democrat: JournalistLeaning.DEMOCRAT,
}

const CONFIDENCES: Record<string, LeaningConfidence> = {
  low: LeaningConfidence.LOW,
  medium: LeaningConfidence.MEDIUM,
  high: LeaningConfidence.HIGH,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const WEBSITE_RE = /^https?:\/\//i

/** Parses a CSV whose first row is a header naming the columns in CSV_COLUMNS. */
export function parseJournalistCsv(text: string): CsvParseResult {
  const [header, ...records] = splitCsv(text)
  const result: CsvParseResult = { missingColumns: [], valid: [], invalid: [] }
  const headers = (header?.fields ?? []).map((h) => h.trim().toLowerCase())
  const index = {} as Record<Field, number>
  for (const [field, { header: name, required }] of Object.entries(CSV_COLUMNS)) {
    index[field as Field] = headers.indexOf(name.toLowerCase())
    if (required && index[field as Field] === -1) result.missingColumns.push(name)
  }
  if (result.missingColumns.length > 0) return result

  for (const { line, fields, raw } of records) {
    const get = (field: Field) => (fields[index[field]] ?? '').trim()
    const optional = (field: TextField) => get(field) || null
    const leaning = LEANINGS[get('leaning').toLowerCase()]
    const priorityTier = parsePriorityTier(get('priorityTier'))
    const confidence = CONFIDENCES[get('leaningConfidence').toLowerCase()]
    const reject = (reason: string) => result.invalid.push({ line, raw, reason })
    if (!get('firstName')) reject('Missing first name')
    else if (!get('lastName')) reject('Missing last name')
    else if (!EMAIL_RE.test(get('email'))) reject('Invalid email')
    else if (!get('organisation')) reject('Missing organisation')
    else if (!leaning) reject('Leaning must be Republican or Democrat')
    else if (get('leaningConfidence') && !confidence)
      reject('Leaning confidence must be low, medium or high')
    else if (get('website') && !WEBSITE_RE.test(get('website')))
      reject('Website must start with http:// or https://')
    else if (get('priorityTier') && priorityTier === null)
      reject('Priority/Tier must contain a number')
    else
      result.valid.push({
        line,
        firstName: get('firstName'),
        lastName: get('lastName'),
        email: get('email').toLowerCase(),
        organisation: get('organisation'),
        leaning,
        leaningConfidence: confidence ?? null,
        category: optional('category'),
        priorityTier,
        medium: optional('medium'),
        website: optional('website'),
        interests: optional('interests'),
        notes: optional('notes'),
      })
  }
  return result
}

const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map((v) => csvField(String(v ?? ''))).join(',')).join('\n')
}
