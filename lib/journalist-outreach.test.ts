import { describe, it, expect } from 'vitest'
import {
  CLAIM_MS,
  PRESS_EMAIL,
  canSwitchTemplate,
  composeLinks,
  otherLeaning,
  fullName,
  journalistStatus,
  parseJournalistCsv,
  parsePriorityTier,
  renderEmail,
  toCsv,
} from './journalist-outreach'

describe('journalistStatus', () => {
  const now = new Date('2026-09-17T12:00:00Z')
  it('is contacted, claimed within the window, or available', () => {
    expect(journalistStatus({ contactedAt: now, claimedAt: null }, now)).toBe('contacted')
    expect(journalistStatus({ contactedAt: null, claimedAt: now }, now)).toBe('claimed')
    const lapsed = new Date(now.getTime() - CLAIM_MS)
    expect(journalistStatus({ contactedAt: null, claimedAt: lapsed }, now)).toBe('available')
    expect(journalistStatus({ contactedAt: null, claimedAt: null })).toBe('available')
  })
})

describe('renderEmail', () => {
  const j = { firstName: 'Jane', lastName: 'Doe', organisation: 'Daily Planet' }
  it('fills the template for the leaning and signs with the volunteer name', () => {
    const rep = renderEmail({ ...j, leaning: 'REPUBLICAN' }, ' Sam ')
    const dem = renderEmail({ ...j, leaning: 'DEMOCRAT' }, 'Sam')
    expect(rep.subject).toBe('PAUSE NOT PACE - PAUSE AI')
    expect(rep.body).toMatch(/^Dear Jane,/)
    expect(rep.body).toContain('Sincerely,\nSam\n')
    expect(rep.body).toContain('not Democrat lobbyists or coastal elites')
    expect(dem.body).toContain('humanity against the machines')
    for (const { subject, body } of [rep, dem]) {
      expect(`${subject}${body}`).not.toContain('{{')
      expect(body).not.toMatch(/['"]/)
      expect(body).toMatch(/PauseAI press email: press@pauseai\.info$/)
    }
    expect(renderEmail({ ...j, leaning: 'DEMOCRAT' }, '').body).toContain(
      'Sincerely,\n[Your name]\n',
    )
    expect(fullName(j)).toBe('Jane Doe')
  })
})

describe('composeLinks', () => {
  it('prefills to, cc, subject and body for each mail client', () => {
    const links = composeLinks('j@x.com', 'Hi there', 'Line 1\nLine 2')
    expect(links.mailto).toBe(
      `mailto:j@x.com?cc=${encodeURIComponent(PRESS_EMAIL)}&subject=Hi%20there&body=Line%201%0ALine%202`,
    )
    const gmail = new URL(links.gmail)
    expect(gmail.searchParams.get('cc')).toBe(PRESS_EMAIL)
    expect(gmail.searchParams.get('su')).toBe('Hi there')
    expect(new URL(links.outlook).searchParams.get('body')).toBe('Line 1\nLine 2')
  })
})

describe('parseJournalistCsv', () => {
  it('reads columns by header in any order, ignoring unknown ones', () => {
    const csv = [
      'Category,Priority/Tier,Medium,EMAIL,Website,First name,Last name,Organisation,Interests/areas of activity,Notes,Leaning,Extra',
      'AI press,Tier 1 - VIP,Web journalist, JANE@x.com ,https://planet.com,Jane,Doe,Daily Planet,"AI, policy",,R,ignored',
      '"Science",,,john@x.com,,John,"Smith, Jr","The ""Times""","covers AI,\nweekly",note,democrat,',
      '',
      'c,t,m,a@x.com,,,Doe,P,,,R,',
      'c,t,m,b@x.com,,Ann,,P,,,R,',
      'c,t,m,not-an-email,,Ann,Lee,P,,,R,',
      'c,t,m,d@x.com,,Ann,Lee,,,,R,',
      'c,t,m,e@x.com,,Ann,Lee,P,,,independent,',
      'c,t,m,f@x.com,javascript:alert(1),Ann,Lee,P,,,D,',
      'c,VIP,m,g@x.com,,Ann,Lee,P,,,D,',
      'short,row',
    ].join('\r\n')
    const { missingColumns, valid, invalid } = parseJournalistCsv(csv)
    expect(missingColumns).toEqual([])
    expect(valid).toEqual([
      {
        line: 2,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@x.com',
        organisation: 'Daily Planet',
        leaning: 'REPUBLICAN',
        leaningConfidence: null,
        category: 'AI press',
        priorityTier: 1,
        medium: 'Web journalist',
        website: 'https://planet.com',
        interests: 'AI, policy',
        notes: null,
      },
      {
        line: 3,
        firstName: 'John',
        lastName: 'Smith, Jr',
        email: 'john@x.com',
        organisation: 'The "Times"',
        leaning: 'DEMOCRAT',
        leaningConfidence: null,
        category: 'Science',
        priorityTier: null,
        medium: null,
        website: null,
        interests: 'covers AI,\nweekly',
        notes: 'note',
      },
    ])
    expect(invalid.map((i) => [i.line, i.reason])).toEqual([
      [6, 'Missing first name'],
      [7, 'Missing last name'],
      [8, 'Invalid email'],
      [9, 'Missing organisation'],
      [10, 'Leaning must be Republican or Democrat'],
      [11, 'Website must start with http:// or https://'],
      [12, 'Priority/Tier must contain a number'],
      [13, 'Missing first name'],
    ])
    expect(invalid[0].raw).toBe('c,t,m,a@x.com,,,Doe,P,,,R,')
  })

  it('reports missing required columns and parses nothing', () => {
    expect(parseJournalistCsv('First name,Email\nJane,j@x.com')).toEqual({
      missingColumns: ['Last name', 'Organisation', 'Leaning'],
      valid: [],
      invalid: [],
    })
    expect(parseJournalistCsv('').missingColumns).toHaveLength(5)
  })

  it('accepts short leaning forms', () => {
    const csv = (leaning: string) =>
      `First name,Last name,Email,Organisation,Leaning\nA,B,a@x.com,P,${leaning}`
    expect(parseJournalistCsv(csv('Rep')).valid[0].leaning).toBe('REPUBLICAN')
    expect(parseJournalistCsv(csv('dem')).valid[0].leaning).toBe('DEMOCRAT')
  })

  it('reads leaning confidence, rejecting unknown levels', () => {
    const csv = [
      'First name,Last name,Email,Organisation,Leaning,Leaning confidence',
      'A,B,a@x.com,P,R,Low',
      'A,B,b@x.com,P,R,MEDIUM',
      'A,B,c@x.com,P,R,high',
      'A,B,d@x.com,P,R,',
      'A,B,e@x.com,P,R,very sure',
    ].join('\n')
    const { valid, invalid } = parseJournalistCsv(csv)
    expect(valid.map((r) => r.leaningConfidence)).toEqual(['LOW', 'MEDIUM', 'HIGH', null])
    expect(invalid.map((i) => i.reason)).toEqual(['Leaning confidence must be low, medium or high'])
  })
})

describe('template switching', () => {
  it('allows switching unless confidence is high, to the other leaning', () => {
    expect([null, 'LOW', 'MEDIUM', 'HIGH'].map((c) => canSwitchTemplate(c as never))).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(otherLeaning('REPUBLICAN')).toBe('DEMOCRAT')
    expect(otherLeaning('DEMOCRAT')).toBe('REPUBLICAN')
  })
})

describe('parsePriorityTier', () => {
  it('takes the first number in the cell', () => {
    expect(parsePriorityTier('2')).toBe(2)
    expect(parsePriorityTier('Tier 1 - VIP')).toBe(1)
    expect(parsePriorityTier('tier 12')).toBe(12)
    expect(parsePriorityTier('VIP')).toBeNull()
  })
})

describe('toCsv', () => {
  it('quotes fields that need it and writes null as empty', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 3, null]])).toBe('a,"b,c","say ""hi""",3,')
  })
})
