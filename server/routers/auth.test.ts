import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createSuperAdmin,
  createProject,
  createQuickTask,
  createSkill,
  TEST_PASSWORD,
} from '@/test/factories'
import { clientAs, anon } from '@/test/rpc'
import { hashToken } from '@/lib/auth'

const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn() }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/rate-limit')>()
  checkRateLimitMock.mockImplementation(original.checkRateLimit)
  return { ...original, checkRateLimit: checkRateLimitMock }
})
const denyNext = () => checkRateLimitMock.mockReturnValueOnce({ allowed: false, retryAfterMs: 1 })

vi.mock('@/lib/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/email')>()
  const ok = () => vi.fn(async () => true)
  return {
    ...original,
    sendWelcomeEmail: ok(),
    sendWelcomeAndConfirmEmail: ok(),
    sendPasswordResetEmail: ok(),
    sendApplicationReceivedEmail: ok(),
    sendApplicationApprovedEmail: ok(),
    sendProjectNotificationEmail: ok(),
  }
})
vi.mock('@/lib/google-auth', () => ({ verifyGoogleToken: vi.fn(async () => null) }))
import * as email from '@/lib/email'
import { verifyGoogleToken } from '@/lib/google-auth'

beforeEach(() => vi.clearAllMocks())

const signupInput = (email: string, extra: Record<string, unknown> = {}) => ({
  name: 'New Person',
  email,
  password: 'a-long-password',
  bio: 'A biography that is comfortably over twenty characters',
  country: 'UK',
  availabilityHoursPerWeek: 4,
  applicationMessage: 'An application message that is long enough to pass',
  ...extra,
})

describe('auth.login', () => {
  it('issues a session for valid credentials and rejects everything else', async () => {
    const vol = await createVolunteer({ email: 'ann@example.com' })
    const res = await anon().auth.login({ email: '  ANN@example.com ', password: TEST_PASSWORD })
    expect(res).toMatchObject({ wasPromoted: false, message: 'Login successful' })
    expect(
      await prisma.session.findFirst({ where: { tokenHash: hashToken(res.token) } }),
    ).toMatchObject({ volunteerId: vol.id })

    await expect(anon().auth.login({ email: '', password: 'x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      anon().auth.login({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      anon().auth.login({ email: 'ann@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const noPw = await createVolunteer({ passwordHash: null })
    await expect(anon().auth.login({ email: noPw.email!, password: 'x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    denyNext()
    await expect(
      anon().auth.login({ email: 'ann@example.com', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('promotes on login via ADMIN_EMAILS bootstrap or a pending invite', async () => {
    const boot = await createVolunteer({ email: 'admin5@example.com', isAdmin: false })
    expect(
      (await anon().auth.login({ email: boot.email!, password: TEST_PASSWORD })).wasPromoted,
    ).toBe(true)
    const inviter = await createAdmin()
    const invited = await createVolunteer({ email: 'invited@example.com' })
    await prisma.adminInvite.create({
      data: {
        email: 'invited@example.com',
        inviteToken: 't1',
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    const res = await anon().auth.login({ email: 'invited@example.com', password: TEST_PASSWORD })
    expect(res.message).toContain('granted admin access')
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: invited.id } })).isAdmin).toBe(
      true,
    )
  })
})

describe('auth.signup', () => {
  it('creates a pending applicant, sends a confirmation, and alerts admins', async () => {
    const admin = await createAdmin()
    const skill = await createSkill()
    const res = await anon().auth.signup(
      signupInput('New@Example.com', { skillIds: [skill.id, skill.id], discordHandle: 'd' }),
    )
    expect(res.pending).toBe(true)
    expect(res.emailVerificationToken).toBeTruthy()
    const row = await prisma.volunteer.findUniqueOrThrow({
      where: { id: res.id },
      include: { skills: true },
    })
    expect(row).toMatchObject({
      email: 'new@example.com',
      approvalStatus: 'pending',
      emailConfirmed: false,
      discordHandle: 'd',
      consentMakeProfileVisibleInDirectory: true,
    })
    expect(row.skills).toHaveLength(1)
    expect(email.sendWelcomeAndConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com', token: res.emailVerificationToken }),
    )
    await vi.waitFor(async () =>
      expect(
        await prisma.notification.count({
          where: { volunteerId: admin.id, type: 'new_volunteer_signup', entityId: res.id },
        }),
      ).toBe(1),
    )
    expect(await prisma.session.count({ where: { tokenHash: hashToken(res.token) } })).toBe(1)
  })

  it('refuses duplicate, deleted and rejected-without-reapply emails, and rate limits', async () => {
    await createVolunteer({ email: 'taken@example.com' })
    await expect(anon().auth.signup(signupInput('taken@example.com'))).rejects.toMatchObject({
      message: 'Email already registered',
    })
    await createVolunteer({ email: 'gone@example.com', deletedAt: new Date() })
    await expect(anon().auth.signup(signupInput('gone@example.com'))).rejects.toMatchObject({
      message: expect.stringContaining('previously registered'),
    })
    const { createHash } = await import('node:crypto')
    await prisma.anonymisedEmail.create({
      data: { emailHash: createHash('sha256').update('rejected@example.com').digest('hex') },
    })
    await expect(anon().auth.signup(signupInput('rejected@example.com'))).rejects.toMatchObject({
      message: expect.stringContaining('previously rejected'),
    })
    await prisma.anonymisedEmail.create({
      data: {
        emailHash: createHash('sha256').update('allowed@example.com').digest('hex'),
        reapplyAllowedAt: new Date(),
      },
    })
    expect((await anon().auth.signup(signupInput('allowed@example.com'))).pending).toBe(true)
    denyNext()
    await expect(anon().auth.signup(signupInput('x@example.com'))).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })

  it('auto-approves bootstrapped admins, invitees, and everyone when approval is off', async () => {
    const boot = await anon().auth.signup(signupInput('admin6@example.com'))
    expect(boot.pending).toBe(false)
    expect(boot).not.toHaveProperty('emailVerificationToken')
    expect(email.sendWelcomeEmail).toHaveBeenCalledWith({
      to: 'admin6@example.com',
      name: 'New Person',
    })

    const inviter = await createAdmin()
    await prisma.adminInvite.create({
      data: {
        email: 'inv@example.com',
        inviteToken: 't2',
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    expect((await anon().auth.signup(signupInput('inv@example.com'))).pending).toBe(false)

    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: false },
    })
    const open = await anon().auth.signup(signupInput('open@example.com'))
    expect(open.pending).toBe(false)
    expect(
      (await prisma.volunteer.findUniqueOrThrow({ where: { id: open.id } })).approvalStatus,
    ).toBe('approved')
    expect(email.sendWelcomeAndConfirmEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'open@example.com' }),
    )
    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: true },
    })
  })

  it('survives failures in the best-effort steps', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma.volunteer, 'updateMany').mockRejectedValueOnce(new Error('boot') as never)
    vi.spyOn(prisma.adminInvite, 'findMany').mockRejectedValueOnce(new Error('invite') as never)
    vi.spyOn(prisma.platformSettings, 'upsert').mockRejectedValueOnce(
      new Error('settings') as never,
    )
    vi.mocked(email.sendWelcomeAndConfirmEmail).mockRejectedValueOnce(new Error('smtp'))
    vi.spyOn(prisma.volunteer, 'findMany').mockRejectedValueOnce(new Error('admins') as never)
    const res = await anon().auth.signup(signupInput('admin7@example.com'))
    expect(res.pending).toBe(true)
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith('[SIGNUP]', expect.any(Error))
      expect(error).toHaveBeenCalledWith('[SIGNUP NOTIFY]', expect.any(Error))
    })
    vi.restoreAllMocks()
    // The welcome email of a bootstrapped admin can fail too.
    const error2 = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(email.sendWelcomeEmail).mockRejectedValueOnce(new Error('smtp'))
    expect((await anon().auth.signup(signupInput('admin11@example.com'))).pending).toBe(false)
    await vi.waitFor(() => expect(error2).toHaveBeenCalledWith('[SIGNUP]', expect.any(Error)))
  })
})

describe('sessions: logout, logoutOtherSessions, me', () => {
  it('logs out the current session, or all the others', async () => {
    const vol = await createVolunteer()
    const t1 = (await anon().auth.login({ email: vol.email!, password: TEST_PASSWORD })).token
    const t2 = (await anon().auth.login({ email: vol.email!, password: TEST_PASSWORD })).token
    expect(await clientAs(vol, { token: t1 }).auth.logoutOtherSessions()).toEqual({
      message: 'Signed out of all other sessions',
    })
    expect(await prisma.session.count({ where: { volunteerId: vol.id } })).toBe(1)
    expect(await prisma.session.count({ where: { tokenHash: hashToken(t2) } })).toBe(0)
    await expect(clientAs(vol, { token: null }).auth.logoutOtherSessions()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await clientAs(vol, { token: null }).auth.logout()).toEqual({ message: 'Logged out' })
    expect(await clientAs(vol, { token: t1 }).auth.logout()).toEqual({ message: 'Logged out' })
    expect(await prisma.session.count({ where: { volunteerId: vol.id } })).toBe(0)
  })

  it('me returns the redacted profile with skills and endorsements', async () => {
    const skill = await createSkill()
    const vol = await createVolunteer({ skills: { create: [{ skillId: skill.id }] } })
    await prisma.skillEndorsement.create({
      data: { volunteerId: vol.id, skillId: skill.id, endorsedById: vol.id },
    })
    const me = await clientAs(vol).auth.me()
    expect(me.email).toBe(vol.email)
    expect(me.skills?.[0].id).toBe(skill.id)
    expect(me.endorsements?.[0].skillName).toBe(skill.name)
    await prisma.volunteer.delete({ where: { id: vol.id } })
    await expect(clientAs(vol).auth.me()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('changePassword / changeEmail', () => {
  it('changes the password, invalidating other sessions', async () => {
    const vol = await createVolunteer()
    const old = (await anon().auth.login({ email: vol.email!, password: TEST_PASSWORD })).token
    const c = clientAs(vol)
    await expect(
      c.auth.changePassword({ currentPassword: 'wrong', newPassword: 'another-long-one' }),
    ).rejects.toMatchObject({ message: 'Current password is incorrect' })
    denyNext()
    await expect(
      c.auth.changePassword({ currentPassword: TEST_PASSWORD, newPassword: 'another-long-one' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    const res = await c.auth.changePassword({
      currentPassword: TEST_PASSWORD,
      newPassword: 'another-long-one',
    })
    expect(res.message).toBe('Password changed successfully')
    expect(await prisma.session.count({ where: { tokenHash: hashToken(old) } })).toBe(0)
    expect(await prisma.session.count({ where: { tokenHash: hashToken(res.token) } })).toBe(1)
    expect(
      (await anon().auth.login({ email: vol.email!, password: 'another-long-one' })).token,
    ).toBeTruthy()
    const noPw = await createVolunteer({ passwordHash: null })
    await expect(
      clientAs(noPw).auth.changePassword({ currentPassword: 'x', newPassword: 'another-long-one' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('changes the email after re-verifying it', async () => {
    const vol = await createVolunteer()
    await createVolunteer({ email: 'taken2@example.com' })
    const c = clientAs(vol)
    await expect(
      c.auth.changeEmail({ newEmail: 'x@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ message: 'Password is incorrect' })
    await expect(
      c.auth.changeEmail({ newEmail: 'Taken2@example.com', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ message: expect.stringContaining('already registered') })
    const res = await c.auth.changeEmail({
      newEmail: ' Fresh@Example.com ',
      password: TEST_PASSWORD,
    })
    expect(res.emailVerificationToken).toBeTruthy()
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: vol.id } })).toMatchObject({
      email: 'fresh@example.com',
      emailConfirmed: false,
    })
    expect(email.sendWelcomeAndConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'fresh@example.com' }),
    )
    const noPw = await createVolunteer({ passwordHash: null })
    await expect(
      clientAs(noPw).auth.changeEmail({ newEmail: 'y@example.com', password: 'x' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('without a password') })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(email.sendWelcomeAndConfirmEmail).mockRejectedValueOnce(new Error('smtp'))
    await c.auth.changeEmail({ newEmail: 'again@example.com', password: TEST_PASSWORD })
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[CHANGE_EMAIL]', expect.any(Error)))
  })
})

describe('forgotPassword / resetPassword', () => {
  it('issues a reset token only for live accounts and resets with it once', async () => {
    const vol = await createVolunteer()
    const okMsg = "If an account exists with this email, you'll receive a reset link."
    expect(await anon().auth.forgotPassword({ email: 'nobody@example.com' })).toEqual({
      message: okMsg,
    })
    const res = await anon().auth.forgotPassword({ email: vol.email!.toUpperCase() })
    expect(res._devResetToken).toBeTruthy()
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: vol.email }),
    )
    // A second request supersedes the first token.
    const res2 = await anon().auth.forgotPassword({ email: vol.email! })
    await expect(
      anon().auth.resetPassword({
        token: res._devResetToken as string,
        newPassword: 'brand-new-pass',
      }),
    ).rejects.toMatchObject({ message: 'Invalid or expired reset token' })
    const session = (await anon().auth.login({ email: vol.email!, password: TEST_PASSWORD })).token
    expect(
      await anon().auth.resetPassword({
        token: res2._devResetToken as string,
        newPassword: 'brand-new-pass',
      }),
    ).toMatchObject({ message: expect.stringContaining('Password reset successful') })
    expect(await prisma.session.count({ where: { tokenHash: hashToken(session) } })).toBe(0)
    expect(
      (await anon().auth.login({ email: vol.email!, password: 'brand-new-pass' })).token,
    ).toBeTruthy()
    await expect(
      anon().auth.resetPassword({
        token: res2._devResetToken as string,
        newPassword: 'brand-new-pass',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    denyNext()
    await expect(anon().auth.forgotPassword({ email: vol.email! })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
    denyNext()
    await expect(
      anon().auth.resetPassword({ token: 'x', newPassword: 'brand-new-pass' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })
})

describe('verifyEmail / resendVerification', () => {
  const tokenFor = async (volunteerId: number, over: Record<string, unknown> = {}) =>
    prisma.emailVerificationToken.create({
      data: {
        volunteerId,
        token: `tok-${volunteerId}-${Math.random()}`,
        expiresAt: new Date(Date.now() + 60_000),
        ...over,
      },
    })

  it('confirms the email and sends the right follow-up', async () => {
    await expect(anon().auth.verifyEmail({ token: 'nope' })).rejects.toMatchObject({
      message: 'Invalid or expired confirmation link',
    })
    const pending = await createVolunteer({ approvalStatus: 'pending', emailConfirmed: false })
    const used = await tokenFor(pending.id, { usedAt: new Date() })
    await expect(anon().auth.verifyEmail({ token: used.token })).rejects.toMatchObject({
      message: expect.stringContaining('already been used'),
    })
    const expired = await tokenFor(pending.id, { expiresAt: new Date(Date.now() - 1) })
    await expect(anon().auth.verifyEmail({ token: expired.token })).rejects.toMatchObject({
      message: expect.stringContaining('expired'),
    })

    const t = await tokenFor(pending.id)
    expect(await anon().auth.verifyEmail({ token: t.token })).toEqual({ success: true })
    expect(
      (await prisma.volunteer.findUniqueOrThrow({ where: { id: pending.id } })).emailConfirmed,
    ).toBe(true)
    expect(email.sendApplicationReceivedEmail).toHaveBeenCalledWith({
      to: pending.email,
      name: pending.name,
    })

    const approved = await createVolunteer({ emailConfirmed: false })
    await anon().auth.verifyEmail({ token: (await tokenFor(approved.id)).token })
    expect(email.sendApplicationApprovedEmail).toHaveBeenCalledWith({
      to: approved.email,
      name: approved.name,
    })

    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: false },
    })
    const open = await createVolunteer({ emailConfirmed: false })
    await anon().auth.verifyEmail({ token: (await tokenFor(open.id)).token })
    expect(email.sendWelcomeEmail).toHaveBeenCalledWith({ to: open.email, name: open.name })
    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: true },
    })

    // Already confirmed, or a status that gets no email: nothing more is sent.
    const already = await createVolunteer({ emailConfirmed: true })
    await anon().auth.verifyEmail({ token: (await tokenFor(already.id)).token })
    const rejected = await createVolunteer({ emailConfirmed: false, approvalStatus: 'rejected' })
    await anon().auth.verifyEmail({ token: (await tokenFor(rejected.id)).token })
    expect(email.sendApplicationReceivedEmail).toHaveBeenCalledTimes(1)
  })

  it('logs email failures and settings lookup failures on verify', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v1 = await createVolunteer({ emailConfirmed: false })
    vi.spyOn(prisma.platformSettings, 'upsert').mockRejectedValueOnce(new Error('db') as never)
    vi.mocked(email.sendApplicationApprovedEmail).mockRejectedValueOnce(new Error('smtp'))
    await anon().auth.verifyEmail({ token: (await tokenFor(v1.id)).token })
    const v2 = await createVolunteer({ emailConfirmed: false, approvalStatus: 'pending' })
    vi.mocked(email.sendApplicationReceivedEmail).mockRejectedValueOnce(new Error('smtp'))
    await anon().auth.verifyEmail({ token: (await tokenFor(v2.id)).token })
    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: false },
    })
    const v3 = await createVolunteer({ emailConfirmed: false })
    vi.mocked(email.sendWelcomeEmail).mockRejectedValueOnce(new Error('smtp'))
    await anon().auth.verifyEmail({ token: (await tokenFor(v3.id)).token })
    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: true },
    })
    await vi.waitFor(() =>
      expect(error.mock.calls.filter((c) => c[0] === '[VERIFY_EMAIL]')).toHaveLength(3),
    )
    vi.restoreAllMocks()
  })

  it('resends a confirmation for unconfirmed accounts only', async () => {
    const okMsg = 'If that email is registered and unconfirmed, a new link has been sent.'
    expect(await anon().auth.resendVerification({})).toEqual({ message: okMsg })
    expect(await anon().auth.resendVerification({ email: 'nobody@example.com' })).toEqual({
      message: okMsg,
    })
    const confirmed = await createVolunteer()
    expect(await anon().auth.resendVerification({ email: confirmed.email! })).toEqual({
      message: okMsg,
    })
    const unconfirmed = await createVolunteer({ emailConfirmed: false })
    const res = await clientAs(unconfirmed).auth.resendVerification({})
    expect(res.emailVerificationToken).toBeTruthy()
    expect(email.sendWelcomeAndConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: unconfirmed.email }),
    )
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(email.sendWelcomeAndConfirmEmail).mockRejectedValueOnce(new Error('smtp'))
    await anon().auth.resendVerification({ email: unconfirmed.email! })
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith('[RESEND_VERIFICATION]', expect.any(Error)),
    )
    denyNext()
    await expect(anon().auth.resendVerification({})).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })
})

describe('deleteAccount', () => {
  it('requires the password when one is set, scrubs the account, and warns affected owners and admins', async () => {
    const me = await createVolunteer({ name: 'Leaver' })
    const owner = await createVolunteer()
    const noEmailOwner = await createVolunteer({ email: null })
    const admin = await createAdmin()
    const p1 = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const p2 = await createProject({ assigneeId: noEmailOwner.id, status: 'in_progress' })
    await createQuickTask({ contextProjectId: p1.id, assigneeId: me.id, status: 'in_progress' })
    await createQuickTask({ contextProjectId: p1.id, assigneeId: me.id, status: 'in_progress' })
    await createQuickTask({ contextProjectId: p2.id, assigneeId: me.id, status: 'in_progress' })
    await createQuickTask({ contextProjectId: p1.id, assigneeId: me.id, status: 'completed' })
    const mine = await createProject({ assigneeId: me.id, status: 'in_progress' })
    await createProject({ assigneeId: me.id, status: 'completed' })

    const c = clientAs(me)
    await expect(c.auth.deleteAccount({})).rejects.toMatchObject({
      message: 'Password is incorrect',
    })
    await expect(c.auth.deleteAccount({ password: 'wrong' })).rejects.toMatchObject({
      message: 'Password is incorrect',
    })
    expect((await c.auth.deleteAccount({ password: TEST_PASSWORD })).message).toContain('deleted')

    const row = await prisma.volunteer.findUniqueOrThrow({ where: { id: me.id } })
    expect(row).toMatchObject({ name: '[Deleted User]', email: null, passwordHash: null })
    expect(row.deletedAt).not.toBeNull()
    expect(await prisma.deletionRequest.count({ where: { volunteerId: me.id } })).toBe(1)
    expect(await prisma.session.count({ where: { volunteerId: me.id } })).toBe(0)

    const ownerNotes = await prisma.notification.findMany({
      where: { volunteerId: owner.id, type: 'account_deleted_impact' },
    })
    expect(ownerNotes.map((n) => n.body)).toEqual([
      `2 tasks in '${p1.title}' assigned to Leaver need a new assignee.`,
    ])
    expect(
      await prisma.notification.count({
        where: { volunteerId: noEmailOwner.id, type: 'account_deleted_impact' },
      }),
    ).toBe(1)
    expect(
      await prisma.notification.findFirst({
        where: { volunteerId: admin.id, type: 'account_deleted_impact' },
      }),
    ).toMatchObject({ body: `'${mine.title}' needs a new owner.` })
    const sent = vi.mocked(email.sendProjectNotificationEmail).mock.calls.map((c) => c[0].to)
    expect(sent).toEqual(expect.arrayContaining([owner.email, admin.email]))
    expect(sent).not.toContain(null)
  })

  it('deletes a passwordless account without a password, and one with nothing to notify', async () => {
    const me = await createVolunteer({ passwordHash: null })
    expect((await clientAs(me).auth.deleteAccount({})).message).toContain('deleted')
    expect(email.sendProjectNotificationEmail).not.toHaveBeenCalled()
  })

  it('logs notification failures during deletion', async () => {
    const me = await createVolunteer({ passwordHash: null })
    const owner = await createVolunteer()
    const p = await createProject({ assigneeId: owner.id })
    await createQuickTask({ contextProjectId: p.id, assigneeId: me.id })
    await createProject({ assigneeId: me.id })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma.notification, 'create').mockRejectedValue(new Error('db') as never)
    vi.mocked(email.sendProjectNotificationEmail).mockRejectedValue(new Error('smtp'))
    await clientAs(me).auth.deleteAccount({})
    expect(error).toHaveBeenCalledWith('[NOTIFY ERROR]', expect.any(Error))
    expect(error).toHaveBeenCalledWith('[NOTIFY ERROR] email failed:', expect.any(Error))
    vi.restoreAllMocks()
  })
})

describe('google sign-in (stubbed)', () => {
  it('reports the stub client config', async () => {
    expect(await anon().auth.googleClientId()).toEqual({
      clientId: 'test-google-client',
      stub: true,
    })
  })

  it('signs in existing accounts, and hands new ones to the signup form', async () => {
    const existing = await createVolunteer({ email: 'g@example.com' })
    const res = await anon().auth.google({ stub: true, email: 'g@example.com', name: 'Ignored' })
    expect(res).toMatchObject({
      isNewUser: false,
      isPending: false,
      name: existing.name,
      wasPromoted: false,
    })
    expect(res.token).toBeTruthy()
    const fresh = await anon().auth.google({ stub: true })
    expect(fresh).toEqual({
      token: null,
      wasPromoted: false,
      isNewUser: true,
      isPending: true,
      name: 'Stub User',
      email: 'stub@example.com',
    })
    // Promotion on Google login via invite.
    const inviter = await createSuperAdmin()
    await prisma.adminInvite.create({
      data: {
        email: 'g@example.com',
        inviteToken: 'g1',
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    expect((await anon().auth.google({ stub: true, email: 'g@example.com' })).wasPromoted).toBe(
      true,
    )
    // A real credential path goes through the verifier.
    await expect(anon().auth.google({ credential: 'bad' })).rejects.toMatchObject({
      message: 'Invalid Google token',
    })
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({ email: 'real@example.com', name: 'Real' })
    expect((await anon().auth.google({ credential: 'good' })).isNewUser).toBe(true)
    denyNext()
    await expect(anon().auth.google({ stub: true })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })

  it('completes a Google signup into a pending application (or straight to admin)', async () => {
    const { email: _e, password: _p, name: _n, ...form } = signupInput('unused@example.com')
    const res = await anon().auth.completeGoogleSignup({
      ...form,
      stub: true,
      skillIds: [(await createSkill()).id],
    })
    expect(res).toMatchObject({ pending: true, wasPromoted: false, name: 'Stub User' })
    const row = await prisma.volunteer.findFirstOrThrow({ where: { email: 'stub@example.com' } })
    expect(row).toMatchObject({
      emailConfirmed: true,
      approvalStatus: 'pending',
      passwordHash: null,
    })
    expect(email.sendApplicationReceivedEmail).toHaveBeenCalledWith({
      to: 'stub@example.com',
      name: 'Stub User',
    })
    await expect(anon().auth.completeGoogleSignup({ ...form, stub: true })).rejects.toMatchObject({
      message: 'Email already registered',
    })
    await prisma.volunteer.update({ where: { id: row.id }, data: { deletedAt: new Date() } })
    await expect(anon().auth.completeGoogleSignup({ ...form, stub: true })).rejects.toMatchObject({
      message: expect.stringContaining('previously registered'),
    })

    await expect(
      anon().auth.completeGoogleSignup({ ...form, credential: 'bad' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({
      email: 'admin8@example.com',
      name: 'Boot',
    })
    const boot = await anon().auth.completeGoogleSignup({ ...form, credential: 'good' })
    expect(boot).toMatchObject({ pending: false, wasPromoted: true })
    expect(email.sendWelcomeEmail).toHaveBeenCalledWith({ to: 'admin8@example.com', name: 'Boot' })
    denyNext()
    await expect(anon().auth.completeGoogleSignup({ ...form, stub: true })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })

  it('logs email failures and tolerates bootstrap failures on Google signup', async () => {
    const { email: _e, password: _p, name: _n, ...form } = signupInput('unused@example.com')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A listed admin email whose bootstrap and invite lookups both fail lands as pending.
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({ email: 'admin9@example.com', name: 'F' })
    vi.mocked(email.sendApplicationReceivedEmail).mockRejectedValueOnce(new Error('smtp'))
    vi.spyOn(prisma.volunteer, 'updateMany').mockRejectedValueOnce(new Error('boot') as never)
    vi.spyOn(prisma.adminInvite, 'findMany').mockRejectedValueOnce(new Error('invite') as never)
    expect((await anon().auth.completeGoogleSignup({ ...form, credential: 'good' })).pending).toBe(
      true,
    )
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({ email: 'admin10@example.com', name: 'F' })
    vi.mocked(email.sendWelcomeEmail).mockRejectedValueOnce(new Error('smtp'))
    await anon().auth.completeGoogleSignup({ ...form, credential: 'good' })
    await vi.waitFor(() =>
      expect(error.mock.calls.filter((c) => c[0] === '[GOOGLE_SIGNUP]')).toHaveLength(2),
    )
    vi.restoreAllMocks()
  })
})
