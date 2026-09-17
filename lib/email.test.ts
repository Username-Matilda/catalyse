import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.restoreAllMocks()
  sendMock.mockReset()
})

type Email = typeof import('./email')

async function load(vars: Record<string, string>): Promise<Email> {
  vi.stubEnv('STUB_EMAIL', 'false')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('REPLY_TO_EMAIL', '')
  vi.stubEnv('APP_URL', 'https://app.test')
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
  return import('./email')
}

describe('html tagged template', () => {
  it('escapes interpolations except rawHtml, and stringifies null as empty', async () => {
    const { html, rawHtml } = await load({})
    expect(html`<b>${'<i>'}</b>${rawHtml('<u>')}${null}${'"&\''}`).toBe(
      '<b>&lt;i&gt;</b><u>&quot;&amp;&#39;',
    )
  })
})

describe('sendEmail transport', () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes a preview file when stubbed', async () => {
    const email = await load({ STUB_EMAIL: 'true' })
    expect(email.isEmailConfigured()).toBe(true)
    expect(await email.sendWelcomeEmail({ to: 'a@b.c', name: 'Ann' })).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[EMAIL STUB] To: a@b.c'))
  })

  it('logs and returns false when nothing is configured', async () => {
    const email = await load({})
    expect(email.isEmailConfigured()).toBe(false)
    expect(await email.sendWelcomeEmail({ to: 'a@b.c', name: 'Ann' })).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[EMAIL NOT CONFIGURED]'))
  })

  it('sends through Resend, with the reply-to from the call or the env', async () => {
    const email = await load({ RESEND_API_KEY: 'key', REPLY_TO_EMAIL: 'reply@x' })
    sendMock.mockResolvedValue({ error: null })
    expect(await email.sendWelcomeEmail({ to: 'a@b.c', name: 'Ann' })).toBe(true)
    expect(sendMock.mock.calls[0][0]).toMatchObject({ to: ['a@b.c'], replyTo: 'reply@x' })
    await email.sendRelayMessage({
      to: 'a@b.c',
      toName: 'A',
      fromName: 'B',
      fromEmail: 'b@x',
      subject: 'Hi',
      message: 'm',
    })
    expect(sendMock.mock.calls[1][0]).toMatchObject({ subject: '[Catalyse] Hi', replyTo: 'b@x' })
  })

  it('reports Resend errors and thrown failures as false', async () => {
    const email = await load({ RESEND_API_KEY: 'key' })
    sendMock.mockResolvedValueOnce({ error: { message: 'nope' } })
    expect(await email.sendWelcomeEmail({ to: 'a@b.c', name: 'Ann' })).toBe(false)
    sendMock.mockRejectedValueOnce(new Error('network'))
    expect(await email.sendWelcomeEmail({ to: 'a@b.c', name: 'Ann' })).toBe(false)
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty('replyTo')
  })
})

describe('templates', () => {
  it('builds every template with escaped content and the right links', async () => {
    const e = await load({ STUB_EMAIL: 'true' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const app = 'https://app.test'

    expect(e.buildWelcomeAndConfirmHtml('<A>', `${app}/verify?x`)).toContain('Hi &lt;A&gt;')
    expect(e.buildApplicationReceivedHtml('A')).toContain('Application Received')
    expect(e.buildApplicationApprovedHtml('A', app)).toContain(`${app}/login`)
    expect(e.buildApplicationRejectedHtml('A')).not.toContain('Feedback from the team')
    expect(e.buildApplicationRejectedHtml('A', '<notes>')).toContain('&lt;notes&gt;')
    expect(e.buildApplicationNeedsInfoHtml('A', `${app}/login`)).not.toContain('white-space')
    expect(e.buildApplicationNeedsInfoHtml('A', `${app}/login`, 'n')).toContain('white-space')
    expect(e.buildApplicationReopenedHtml('A', `${app}/login`)).toContain('reopened')
    expect(e.buildApplicationReopenedHtml('A', `${app}/login`, 'n')).toContain('white-space')
    expect(e.buildPendingApplicationsSummaryHtml(3, app)).toContain('3')
    expect(e.buildPasswordResetHtml(`${app}/reset`, 'A')).toContain('Reset Your Password')
    expect(e.buildAdminInviteHtml(`${app}/invite`, 'B')).toContain('B')
    expect(e.buildOutreachLoginHtml(`${app}/outreach`)).toContain(`${app}/outreach`)
    expect(e.buildWelcomeHtml('A', app)).toContain('Welcome')
    expect(e.buildProjectNotificationHtml('A', 'S', 'M', 5, app, '<extra/>')).toContain(
      `${app}/projects/5`,
    )
    expect(e.buildAdminAlertHtml('A', 'S', 'M', 'Go', `${app}/go`)).toContain('Go')
    expect(e.buildLocalGroupSuggestionHtml('A', 'accepted', 'G')).toContain('Great news')
    expect(e.buildLocalGroupSuggestionHtml('A', 'merge', 'G')).toContain('merged')
    expect(e.buildLocalGroupSuggestionHtml('A', 'on_hold', 'G')).toContain('under review')
    expect(e.buildLocalGroupSuggestionHtml('A', 'declined', 'G')).toContain('not to add')
    expect(e.buildLocalGroupSuggestionHtml('A', 'weird', 'G', 'note')).toContain(
      'has been reviewed',
    )
    expect(e.buildLocalGroupSuggestionHtml('A', 'weird', 'G', 'note')).toContain('<em>note</em>')
    expect(e.buildRelayMessageHtml('A', 'B', 'S', 'M')).not.toContain('about the project')
    expect(e.buildRelayMessageHtml('A', 'B', 'S', 'M', 'P')).toContain('about the project')

    const long = 'x'.repeat(200)
    const digest = e.buildDigestHtml('A', app, [
      { id: 1, title: 'T', description: long, skill_names: ['a', 'b'], match_percent: 80 },
      { id: 2, title: 'U' },
    ])
    expect(digest).toContain('80% match')
    expect(digest).toContain('...')
    expect(digest).toContain('Skills: a, b')
    expect(e.buildDigestHtml('A', app, [], true)).toContain('match your skills')

    expect(e.buildTaskNudgeHtml('A', 'T', 'P', 1, 2, 10, 'commented', '1 Jan')).toContain(
      `${app}/projects/1#task-2`,
    )
    expect(
      e.buildTaskFinalWarningHtml('A', 'T', 'P', 1, 2, 20, 'commented', '1 Jan', '9 Jan'),
    ).toContain('9 Jan')
    expect(e.buildTaskSurrenderedOwnerHtml('O', 'V', 'T', 'P', 1)).toContain('V')
    expect(e.buildTaskSurrenderedAssigneeHtml('A', 'T', 'P', 1)).toContain(`${app}/projects/1`)
  })

  it('every send helper resolves through the stub transport', async () => {
    const e = await load({ STUB_EMAIL: 'true' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const base = { to: 'a@b.c', name: 'A' }
    const results = await Promise.all([
      e.sendWelcomeAndConfirmEmail({ ...base, token: 't' }),
      e.sendApplicationReceivedEmail(base),
      e.sendApplicationApprovedEmail(base),
      e.sendApplicationRejectedEmail({ ...base, applicantNotes: 'n' }),
      e.sendApplicationNeedsInfoEmail({ ...base, applicantNotes: 'n' }),
      e.sendApplicationReopenedEmail(base),
      e.sendPendingApplicationsSummaryEmail({ ...base, count: 2 }),
      e.sendPasswordResetEmail({ to: 'a@b.c', resetToken: 'r' }),
      e.sendAdminInviteEmail({ to: 'a@b.c', inviteToken: 'i', invitedBy: 'B' }),
      e.sendOutreachLoginEmail({ to: 'a@b.c', loginToken: 'o' }),
      e.sendAdminAlertEmail({ ...base, subject: 'S', message: 'M', ctaLabel: 'L', ctaUrl: '/rel' }),
      e.sendAdminAlertEmail({
        ...base,
        subject: 'S',
        message: 'M',
        ctaLabel: 'L',
        ctaUrl: 'http://abs',
      }),
      e.sendProjectNotificationEmail({
        ...base,
        subject: 'S',
        message: 'M',
        projectTitle: 'P',
        projectId: 1,
      }),
      e.sendLocalGroupSuggestionEmail({ ...base, action: 'declined', groupName: 'G' }),
      e.sendLocalGroupSuggestionEmail({ ...base, action: 'other', groupName: 'G' }),
      e.sendDigestEmail({ ...base, projects: [{ id: 1, title: 'T' }] }),
      e.sendDigestEmail({ ...base, projects: [{ id: 1, title: 'T' }], isMatch: true }),
      e.sendTaskNudgeEmail({
        ...base,
        taskTitle: 'T',
        projectTitle: 'P',
        projectId: 1,
        taskId: 2,
        daysInactive: 3,
        activityPhrase: 'a',
        lastActivityDate: 'd',
      }),
      e.sendTaskFinalWarningEmail({
        ...base,
        taskTitle: 'T',
        projectTitle: 'P',
        projectId: 1,
        taskId: 2,
        daysInactive: 3,
        activityPhrase: 'a',
        lastActivityDate: 'd',
        surrenderDate: 's',
      }),
      e.sendTaskSurrenderedOwnerEmail({
        to: 'a@b.c',
        ownerName: 'O',
        volunteerName: 'V',
        taskTitle: 'T',
        projectTitle: 'P',
        projectId: 1,
      }),
      e.sendTaskSurrenderedAssigneeEmail({
        ...base,
        taskTitle: 'T',
        projectTitle: 'P',
        projectId: 1,
      }),
    ])
    expect(results.every(Boolean)).toBe(true)
    expect(await e.sendDigestEmail({ ...base, projects: [] })).toBe(false)
  })
})
