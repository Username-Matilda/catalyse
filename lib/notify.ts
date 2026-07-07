import { prisma } from './prisma'
import { sendProjectNotificationEmail, sendAdminAlertEmail } from './email'

export async function createNotification(
  volunteerId: number,
  type: string,
  title: string,
  body?: string | null,
  link?: string | null,
) {
  return prisma.notification.create({
    data: { volunteerId, type, title, body: body ?? null, link: link ?? null },
  })
}

type NotifyEmailPayload =
  | {
      subject?: string
      message: string
      projectId: number
      projectTitle: string
      extraHtml?: string
    }
  | { subject?: string; message: string; ctaLabel: string; ctaUrl: string }

export async function notifyUser(
  volunteerId: number,
  type: string,
  title: string,
  body: string | null | undefined,
  link: string | null | undefined,
  email?: NotifyEmailPayload,
): Promise<void> {
  createNotification(volunteerId, type, title, body, link).catch((e) =>
    console.error('[NOTIFY ERROR]', e),
  )
  if (!email) return

  const vol = await prisma.volunteer.findFirst({
    where: { id: volunteerId, deletedAt: null },
    select: { name: true, email: true },
  })
  if (!vol?.email) return

  const send =
    'projectId' in email
      ? sendProjectNotificationEmail({
          to: vol.email,
          name: vol.name,
          subject: email.subject ?? title,
          message: email.message,
          projectTitle: email.projectTitle,
          projectId: email.projectId,
          extraHtml: email.extraHtml,
        })
      : sendAdminAlertEmail({
          to: vol.email,
          name: vol.name,
          subject: email.subject ?? title,
          message: email.message,
          ctaLabel: email.ctaLabel,
          ctaUrl: email.ctaUrl,
        })

  send.catch((e) => console.error('[EMAIL ERROR]', e))
}

export async function notifyAdmins(
  type: string,
  title: string,
  body: string | null | undefined,
  link: string | null | undefined,
  email?: NotifyEmailPayload,
): Promise<void> {
  const admins = await prisma.volunteer.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true },
  })
  await Promise.all(admins.map((admin) => notifyUser(admin.id, type, title, body, link, email)))
}
