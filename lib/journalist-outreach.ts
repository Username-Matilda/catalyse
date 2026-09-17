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

// Placeholder wording until the final Republican and Democrat templates are supplied.
const TEMPLATES: Record<JournalistLeaning, { subject: string; body: string }> = {
  REPUBLICAN: {
    subject: 'People for a Pause: a story for {{organisation}} readers',
    body: `Dear {{firstName}},

I'm writing as a constituent who took part in the People for a Pause protest. Americans across the country are asking Washington to put a pause on the race to build ever more powerful AI until we know it is safe.

[Add a line of your own here]

I'd be glad to talk, and the PauseAI press team (copied) can arrange interviews.

Best wishes,
{{volunteerName}}`,
  },
  DEMOCRAT: {
    subject: 'People for a Pause: a story for {{organisation}} readers',
    body: `Dear {{firstName}},

I'm writing as someone who took part in the People for a Pause protest. People across the country are calling for a pause on frontier AI development until there are real safeguards in place.

[Add a line of your own here]

I'd be glad to talk, and the PauseAI press team (copied) can arrange interviews.

Best wishes,
{{volunteerName}}`,
  },
}

export function renderEmail(
  journalist: {
    firstName: string
    lastName: string
    organisation: string
    leaning: JournalistLeaning
  },
  volunteerName: string,
): { subject: string; body: string } {
  const values: Record<string, string> = {
    firstName: journalist.firstName,
    lastName: journalist.lastName,
    organisation: journalist.organisation,
    volunteerName: volunteerName.trim() || '[Your name]',
  }
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key])
  const template = TEMPLATES[journalist.leaning]
  return { subject: fill(template.subject), body: fill(template.body) }
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
