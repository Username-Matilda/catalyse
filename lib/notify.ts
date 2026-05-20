import { prisma } from './prisma'
import { createNotification } from './project'
import { sendProjectNotificationEmail } from './email'

export async function notifyUser(
  volunteerId: number,
  type: string,
  title: string,
  body: string | null | undefined,
  link: string | null | undefined,
  email?: {
    subject?: string
    message: string
    projectId: number
    projectTitle: string
    extraHtml?: string
  },
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

  sendProjectNotificationEmail({
    to: vol.email,
    name: vol.name,
    subject: email.subject ?? title,
    message: email.message,
    projectTitle: email.projectTitle,
    projectId: email.projectId,
    extraHtml: email.extraHtml,
  }).catch((e) => console.error('[EMAIL ERROR]', e))
}
