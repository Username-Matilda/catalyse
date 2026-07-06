import { ORPCError } from '@orpc/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  hashPassword,
  generateAuthToken,
  checkAdminBootstrap,
  acceptPendingInvite,
  redactVolunteer,
} from '@/lib/auth'
import {
  sendWelcomeEmail,
  sendWelcomeAndConfirmEmail,
  sendPasswordResetEmail,
  sendApplicationReceivedEmail,
  sendApplicationApprovedEmail,
} from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  SignupSchema,
  ChangePasswordSchema,
  ChangeEmailSchema,
  ResetPasswordSchema,
} from '@/lib/schemas'
import { publicProcedure, authedProcedure } from '../procedures'
import { env } from '@/lib/env'
import { ApprovalStatus, ProjectStatus, WorkItemType } from '@/generated/prisma/enums'

const STUB_EMAIL = env.STUB_EMAIL
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID
const STUB_GOOGLE = env.STUB_GOOGLE || (!GOOGLE_CLIENT_ID && env.NODE_ENV !== 'production')

async function verifyGoogleToken(credential: string) {
  if (!GOOGLE_CLIENT_ID) return null
  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`)
    if (!resp.ok) return null
    const data = (await resp.json()) as Record<string, string>
    if (data.aud !== GOOGLE_CLIENT_ID) return null
    if (data.email_verified !== 'true') return null
    return { email: data.email, name: data.name || data.email.split('@')[0] }
  } catch {
    return null
  }
}

async function sendAccountDeletionNotifications(deletedId: number, deletedName: string) {
  const taskRows = await prisma.$queryRaw<
    Array<{
      owner_id: number
      owner_name: string
      owner_email: string | null
      project_id: number
      project_title: string
      task_count: number
    }>
  >`
    SELECT p.assignee_id AS owner_id, v.name AS owner_name, v.email AS owner_email,
           p.id AS project_id, p.title AS project_title,
           COUNT(st.id) AS task_count
    FROM work_items st
    JOIN work_items p ON st.context_project_id = p.id AND p.type = 'PROJECT'
    JOIN volunteers v ON p.assignee_id = v.id
    WHERE st.type = 'STARTER_TASK'
      AND st.assignee_id = ${deletedId}
      AND st.status NOT IN ('completed')
      AND p.assignee_id != ${deletedId}
      AND v.deleted_at IS NULL
    GROUP BY p.id
  `
  const ownedProjects = await prisma.workItem.findMany({
    where: {
      type: WorkItemType.PROJECT,
      assigneeId: deletedId,
      status: { notIn: [ProjectStatus.completed, ProjectStatus.archived] },
    },
    select: { id: true, title: true },
  })
  if (!taskRows.length && !ownedProjects.length) return

  type Recipient = {
    name: string
    email: string | null
    taskProjects: { projectId: number; projectTitle: string; taskCount: number }[]
    ownerlessProjects: { projectId: number; projectTitle: string }[]
  }
  const recipients: Record<number, Recipient> = {}

  for (const row of taskRows) {
    if (!recipients[row.owner_id]) {
      recipients[row.owner_id] = {
        name: row.owner_name,
        email: row.owner_email,
        taskProjects: [],
        ownerlessProjects: [],
      }
    }
    recipients[row.owner_id].taskProjects.push({
      projectId: row.project_id,
      projectTitle: row.project_title,
      taskCount: Number(row.task_count),
    })
  }

  const ownerless = ownedProjects.map((p) => ({ projectId: p.id, projectTitle: p.title }))
  if (ownerless.length) {
    const admins = await prisma.volunteer.findMany({
      where: { isAdmin: true, deletedAt: null, id: { not: deletedId } },
      select: { id: true, name: true, email: true },
    })
    for (const admin of admins) {
      if (!recipients[admin.id])
        recipients[admin.id] = {
          name: admin.name,
          email: admin.email,
          taskProjects: [],
          ownerlessProjects: [],
        }
      recipients[admin.id].ownerlessProjects = ownerless
    }
  }

  const { sendProjectNotificationEmail } = await import('@/lib/email')
  for (const [recipientId, r] of Object.entries(recipients)) {
    const rid = Number(recipientId)
    for (const p of r.taskProjects) {
      const word = p.taskCount === 1 ? 'task' : 'tasks'
      await prisma.notification
        .create({
          data: {
            volunteerId: rid,
            type: 'account_deleted_impact',
            title: `${deletedName} has deleted their account`,
            body: `${p.taskCount} ${word} in '${p.projectTitle}' assigned to ${deletedName} need a new assignee.`,
            link: `/projects/${p.projectId}`,
          },
        })
        .catch((e) => console.error('[NOTIFY ERROR]', e))
    }
    for (const p of r.ownerlessProjects) {
      await prisma.notification
        .create({
          data: {
            volunteerId: rid,
            type: 'account_deleted_impact',
            title: `${deletedName} has deleted their account`,
            body: `'${p.projectTitle}' needs a new owner.`,
            link: `/projects/${p.projectId}`,
          },
        })
        .catch((e) => console.error('[NOTIFY ERROR]', e))
    }
    if (r.email) {
      const allProjects = [...r.taskProjects, ...r.ownerlessProjects]
      const msgParts = [`<p><strong>${deletedName}</strong> has deleted their account.</p>`]
      if (r.taskProjects.length)
        msgParts.push(
          `<p>The following tasks need a new assignee:</p><ul>${r.taskProjects.map((p) => `<li>${p.taskCount} ${p.taskCount === 1 ? 'task' : 'tasks'} in <strong>${p.projectTitle}</strong></li>`).join('')}</ul>`,
        )
      if (r.ownerlessProjects.length)
        msgParts.push(
          `<p>The following projects need a new owner:</p><ul>${r.ownerlessProjects.map((p) => `<li><strong>${p.projectTitle}</strong></li>`).join('')}</ul>`,
        )
      await sendProjectNotificationEmail({
        to: r.email,
        name: r.name,
        subject: `${deletedName} has deleted their account`,
        message: msgParts.join(''),
        projectTitle: allProjects[0].projectTitle,
        projectId: allProjects[0].projectId,
      }).catch((e) => console.error('[NOTIFY ERROR] email failed:', e))
    }
  }
}

export const authRouter = {
  login: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .handler(async ({ input }) => {
      const email = input.email.toLowerCase().trim()
      if (!email || !input.password)
        throw new ORPCError('UNAUTHORIZED', { message: 'Invalid email or password' })

      const volunteer = await prisma.volunteer.findFirst({ where: { email, deletedAt: null } })
      if (
        !volunteer ||
        !volunteer.passwordHash ||
        !verifyPassword(input.password, volunteer.passwordHash)
      ) {
        throw new ORPCError('UNAUTHORIZED', { message: 'Invalid email or password' })
      }

      let wasPromoted = await checkAdminBootstrap(email, volunteer.id)
      const inviteAccepted = await acceptPendingInvite(email, volunteer.id)
      if (inviteAccepted) wasPromoted = true

      const authToken = generateAuthToken()
      await prisma.volunteer.update({
        where: { id: volunteer.id },
        data: { authToken, updatedAt: new Date() },
      })

      return {
        token: authToken,
        wasPromoted,
        message: wasPromoted
          ? "Login successful - you've been granted admin access!"
          : 'Login successful',
      }
    }),

  signup: publicProcedure.input(SignupSchema).handler(async ({ input, context }) => {
    const { allowed, retryAfterMs } = checkRateLimit(context.request, 'signup', {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    })
    if (!allowed)
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: `Rate limited. Retry after ${retryAfterMs}ms`,
      })

    const email = input.email.toLowerCase().trim()
    const existing = await prisma.volunteer.findFirst({
      where: { email },
      select: { id: true, deletedAt: true },
    })
    if (existing) {
      throw new ORPCError('BAD_REQUEST', {
        message: existing.deletedAt
          ? 'This email was previously registered. Contact us to restore your account.'
          : 'Email already registered',
      })
    }

    const authToken = generateAuthToken()
    const volunteer = await prisma.volunteer.create({
      data: {
        name: input.name,
        email,
        passwordHash: hashPassword(input.password),
        authToken,
        applicationMessage: input.applicationMessage ?? null,
        bio: input.bio ?? null,
        discordHandle: input.discordHandle ?? null,
        signalNumber: input.signalNumber ?? null,
        whatsappNumber: input.whatsappNumber ?? null,
        contactPreference: input.contactPreference ?? null,
        contactNotes: input.contactNotes ?? null,
        availabilityHoursPerWeek: input.availabilityHoursPerWeek ?? null,
        location: input.location ?? null,
        country: input.country ?? null,
        localGroup: input.localGroup ?? null,
        locationConfirmedAt: new Date(),
        otherSkills: input.otherSkills ?? null,
        consentMakeProfileVisibleInDirectory: input.consentMakeProfileVisibleInDirectory ?? true,
        consentContactableByProjectOwners: input.consentContactableByProjectOwners ?? true,
        consentShareContactInfoWithProjectOwner:
          input.consentShareContactInfoWithProjectOwner ?? false,
        consentGivenAt: new Date(),
        emailDigest: input.emailDigest ?? 'none',
      },
    })

    for (const skillId of input.skillIds ?? []) {
      await prisma.volunteerSkill.upsert({
        where: { volunteerId_skillId: { volunteerId: volunteer.id, skillId } },
        create: { volunteerId: volunteer.id, skillId },
        update: {},
      })
    }

    const wasBootstrapped = await checkAdminBootstrap(email, volunteer.id).catch(() => false)
    const wasInvited = await acceptPendingInvite(email, volunteer.id).catch(() => false)
    const platformSettings = await prisma.platformSettings
      .upsert({ where: { id: 1 }, create: { id: 1, requireApplicationApproval: true }, update: {} })
      .catch(() => ({ requireApplicationApproval: true }))

    let emailVerificationToken: string | undefined
    if (wasBootstrapped || wasInvited) {
      sendWelcomeEmail({ to: email, name: input.name }).catch((e) => console.error('[SIGNUP]', e))
    } else {
      const vt = await prisma.emailVerificationToken.create({
        data: {
          volunteerId: volunteer.id,
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      emailVerificationToken = vt.token
      if (!platformSettings.requireApplicationApproval) {
        await prisma.volunteer.update({
          where: { id: volunteer.id },
          data: { approvalStatus: ApprovalStatus.approved },
        })
      }
      sendWelcomeAndConfirmEmail({ to: email, token: vt.token, name: input.name }).catch((e) =>
        console.error('[SIGNUP]', e),
      )
    }

    const isApproved = wasBootstrapped || wasInvited || !platformSettings.requireApplicationApproval
    return {
      id: volunteer.id,
      token: authToken,
      pending: !isApproved,
      ...(STUB_EMAIL && emailVerificationToken ? { emailVerificationToken } : {}),
    }
  }),

  logout: authedProcedure.handler(async ({ context }) => {
    await prisma.volunteer.update({
      where: { id: context.volunteer.id },
      data: { authToken: null },
    })
    return { message: 'Logged out' }
  }),

  me: authedProcedure.handler(async ({ context }) => {
    const vol = await prisma.volunteer.findUnique({
      where: { id: context.volunteer.id },
      include: {
        skills: {
          include: { skill: { include: { category: true } } },
          orderBy: [{ skill: { category: { sortOrder: 'asc' } } }, { skill: { sortOrder: 'asc' } }],
        },
        skillEndorsementsReceived: { include: { skill: true } },
      },
    })
    if (!vol) throw new ORPCError('NOT_FOUND')
    return redactVolunteer(vol, {
      showContact: true,
      skills: vol.skills.map((vs) => ({
        id: vs.skill.id,
        categoryId: vs.skill.categoryId,
        name: vs.skill.name,
        description: vs.skill.description,
        sortOrder: vs.skill.sortOrder,
        createdAt: vs.skill.createdAt,
        categoryName: vs.skill.category.name,
        proficiencyLevel: vs.proficiencyLevel,
      })),
      endorsements: vol.skillEndorsementsReceived.map((se) => ({
        skillId: se.skillId,
        rating: se.rating,
        skillName: se.skill.name,
      })),
    })
  }),

  changePassword: authedProcedure
    .input(ChangePasswordSchema)
    .handler(async ({ input, context }) => {
      const vol = await prisma.volunteer.findUnique({
        where: { id: context.volunteer.id },
        select: { passwordHash: true },
      })
      if (!vol?.passwordHash || !verifyPassword(input.currentPassword, vol.passwordHash)) {
        throw new ORPCError('BAD_REQUEST', { message: 'Current password is incorrect' })
      }
      await prisma.volunteer.update({
        where: { id: context.volunteer.id },
        data: { passwordHash: hashPassword(input.newPassword), updatedAt: new Date() },
      })
      return { message: 'Password changed successfully' }
    }),

  changeEmail: authedProcedure.input(ChangeEmailSchema).handler(async ({ input, context }) => {
    const vol = await prisma.volunteer.findUnique({
      where: { id: context.volunteer.id },
      select: { passwordHash: true },
    })
    if (!vol?.passwordHash)
      throw new ORPCError('BAD_REQUEST', {
        message: 'Cannot change email for accounts without a password. Contact an admin.',
      })
    if (!verifyPassword(input.password, vol.passwordHash))
      throw new ORPCError('BAD_REQUEST', { message: 'Password is incorrect' })
    const newEmail = input.newEmail.toLowerCase().trim()
    const existing = await prisma.volunteer.findFirst({
      where: { email: newEmail, id: { not: context.volunteer.id } },
      select: { id: true },
    })
    if (existing)
      throw new ORPCError('BAD_REQUEST', {
        message: 'This email is already registered to another account',
      })
    await prisma.volunteer.update({
      where: { id: context.volunteer.id },
      data: { email: newEmail, updatedAt: new Date() },
    })
    return { message: 'Email changed successfully' }
  }),

  forgotPassword: publicProcedure
    .input(z.object({ email: z.string() }))
    .handler(async ({ input, context }) => {
      const { allowed, retryAfterMs } = checkRateLimit(context.request, 'forgot-password', {
        limit: 5,
        windowMs: 15 * 60 * 1000,
      })
      if (!allowed)
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message: `Rate limited. Retry after ${retryAfterMs}ms`,
        })

      const successMsg = "If an account exists with this email, you'll receive a reset link."
      const email = input.email.toLowerCase().trim()
      const volunteer = await prisma.volunteer.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, name: true, email: true },
      })
      if (!volunteer?.email) return { message: successMsg }

      const resetToken = generateAuthToken()
      await prisma.passwordResetToken.updateMany({
        where: { volunteerId: volunteer.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      await prisma.passwordResetToken.create({
        data: {
          volunteerId: volunteer.id,
          token: resetToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      await sendPasswordResetEmail({ to: volunteer.email, resetToken, name: volunteer.name })

      return {
        message: successMsg,
        ...(STUB_EMAIL
          ? { _devResetToken: resetToken, _devResetUrl: `/reset-password?token=${resetToken}` }
          : {}),
      }
    }),

  resetPassword: publicProcedure.input(ResetPasswordSchema).handler(async ({ input }) => {
    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        token: input.token,
        usedAt: null,
        expiresAt: { gt: new Date() },
        volunteer: { deletedAt: null },
      },
      select: { id: true, volunteerId: true },
    })
    if (!tokenRecord)
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired reset token' })
    await prisma.volunteer.update({
      where: { id: tokenRecord.volunteerId },
      data: {
        passwordHash: hashPassword(input.newPassword),
        authToken: null,
        updatedAt: new Date(),
      },
    })
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    })
    return { message: 'Password reset successful. Please log in with your new password.' }
  }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .handler(async ({ input }) => {
      const record = await prisma.emailVerificationToken.findUnique({
        where: { token: input.token },
        include: {
          volunteer: {
            select: {
              id: true,
              name: true,
              email: true,
              emailConfirmed: true,
              approvalStatus: true,
            },
          },
        },
      })
      if (!record)
        throw new ORPCError('BAD_REQUEST', { message: 'Invalid or expired confirmation link' })
      if (record.usedAt)
        throw new ORPCError('BAD_REQUEST', {
          message: 'This confirmation link has already been used',
        })
      if (record.expiresAt < new Date())
        throw new ORPCError('BAD_REQUEST', { message: 'This confirmation link has expired' })

      const { volunteer } = record
      await prisma.$transaction([
        prisma.emailVerificationToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        prisma.volunteer.update({ where: { id: volunteer.id }, data: { emailConfirmed: true } }),
      ])

      if (!volunteer.emailConfirmed && volunteer.email) {
        if (volunteer.approvalStatus === ApprovalStatus.approved) {
          const settings = await prisma.platformSettings
            .upsert({
              where: { id: 1 },
              create: { id: 1, requireApplicationApproval: true },
              update: {},
            })
            .catch(() => ({ requireApplicationApproval: true }))
          if (settings.requireApplicationApproval) {
            sendApplicationApprovedEmail({ to: volunteer.email, name: volunteer.name }).catch((e) =>
              console.error('[VERIFY_EMAIL]', e),
            )
          } else {
            sendWelcomeEmail({ to: volunteer.email, name: volunteer.name }).catch((e) =>
              console.error('[VERIFY_EMAIL]', e),
            )
          }
        } else if (volunteer.approvalStatus === ApprovalStatus.pending) {
          sendApplicationReceivedEmail({ to: volunteer.email, name: volunteer.name }).catch((e) =>
            console.error('[VERIFY_EMAIL]', e),
          )
        }
      }
      return { success: true }
    }),

  resendVerification: publicProcedure
    .input(z.object({ email: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const { allowed, retryAfterMs } = checkRateLimit(context.request, 'resend-verification', {
        limit: 5,
        windowMs: 15 * 60 * 1000,
      })
      if (!allowed)
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message: `Rate limited. Retry after ${retryAfterMs}ms`,
        })

      const okMsg = 'If that email is registered and unconfirmed, a new link has been sent.'
      const email = (input.email ?? context.volunteer?.email ?? '').toLowerCase().trim()
      if (!email) return { message: okMsg }

      const volunteer = await prisma.volunteer.findFirst({
        where: { email, emailConfirmed: false, deletedAt: null },
        select: { id: true, name: true, email: true },
      })
      if (!volunteer?.email) return { message: okMsg }

      await prisma.emailVerificationToken.updateMany({
        where: { volunteerId: volunteer.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      const vt = await prisma.emailVerificationToken.create({
        data: {
          volunteerId: volunteer.id,
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      sendWelcomeAndConfirmEmail({
        to: volunteer.email,
        token: vt.token,
        name: volunteer.name,
      }).catch((e) => console.error('[RESEND_VERIFICATION]', e))

      return { message: okMsg, ...(STUB_EMAIL ? { emailVerificationToken: vt.token } : {}) }
    }),

  deleteAccount: authedProcedure
    .input(z.object({ password: z.string().optional() }))
    .handler(async ({ input, context }) => {
      const vol = await prisma.volunteer.findUnique({
        where: { id: context.volunteer.id },
        select: { passwordHash: true },
      })
      if (
        vol?.passwordHash &&
        (!input.password || !verifyPassword(input.password, vol.passwordHash))
      ) {
        throw new ORPCError('BAD_REQUEST', { message: 'Password is incorrect' })
      }
      await prisma.deletionRequest.create({
        data: {
          volunteerId: context.volunteer.id,
          volunteerEmail: context.volunteer.email,
          status: 'completed',
        },
      })
      await sendAccountDeletionNotifications(context.volunteer.id, context.volunteer.name)
      await prisma.volunteer.update({
        where: { id: context.volunteer.id },
        data: {
          name: '[Deleted User]',
          email: null,
          bio: null,
          discordHandle: null,
          signalNumber: null,
          whatsappNumber: null,
          contactNotes: null,
          location: null,
          otherSkills: null,
          authToken: null,
          passwordHash: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      await prisma.volunteerSkill.deleteMany({ where: { volunteerId: context.volunteer.id } })
      return { message: "Your account has been deleted. We're sorry to see you go." }
    }),

  google: publicProcedure
    .input(
      z.object({
        credential: z.string().optional(),
        stub: z.boolean().optional(),
        email: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { allowed, retryAfterMs } = checkRateLimit(context.request, 'google', {
        limit: 20,
        windowMs: 5 * 60 * 1000,
      })
      if (!allowed)
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message: `Rate limited. Retry after ${retryAfterMs}ms`,
        })
      if (!GOOGLE_CLIENT_ID && !STUB_GOOGLE)
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Google Sign-In is not configured',
        })

      let email: string
      let name: string
      if (STUB_GOOGLE && input.stub) {
        email = input.email ?? 'stub@example.com'
        name = input.name ?? 'Stub User'
      } else {
        const googleUser = await verifyGoogleToken(input.credential ?? '')
        if (!googleUser) throw new ORPCError('UNAUTHORIZED', { message: 'Invalid Google token' })
        ;({ email, name } = googleUser)
      }

      const existing = await prisma.volunteer.findFirst({ where: { email, deletedAt: null } })
      if (existing) {
        const authToken = generateAuthToken()
        await prisma.volunteer.update({
          where: { id: existing.id },
          data: { authToken, updatedAt: new Date() },
        })
        let wasPromoted = await checkAdminBootstrap(email, existing.id)
        if (await acceptPendingInvite(email, existing.id)) wasPromoted = true
        return {
          token: authToken,
          wasPromoted,
          isNewUser: false,
          isPending: false,
          name: existing.name,
        }
      }

      const authToken = generateAuthToken()
      const volunteer = await prisma.volunteer.create({
        data: {
          name,
          email,
          authToken,
          emailConfirmed: true,
          consentMakeProfileVisibleInDirectory: true,
          consentContactableByProjectOwners: true,
          consentGivenAt: new Date(),
        },
      })
      const wasBootstrapped = await checkAdminBootstrap(email, volunteer.id).catch(() => false)
      const wasInvited = await acceptPendingInvite(email, volunteer.id).catch(() => false)
      const isApproved = wasBootstrapped || wasInvited

      if (isApproved) {
        sendWelcomeEmail({ to: email, name }).catch((e) => console.error('[GOOGLE_SIGNUP]', e))
      } else {
        sendApplicationReceivedEmail({ to: email, name }).catch((e) =>
          console.error('[GOOGLE_SIGNUP]', e),
        )
      }
      return {
        token: authToken,
        wasPromoted: wasBootstrapped || wasInvited,
        isNewUser: true,
        isPending: !isApproved,
        name,
      }
    }),

  googleClientId: publicProcedure.handler(() => ({
    clientId: GOOGLE_CLIENT_ID ?? '',
    stub: STUB_GOOGLE,
  })),
}
