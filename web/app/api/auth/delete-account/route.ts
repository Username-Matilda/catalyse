import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentVolunteer, verifyPassword } from '@/lib/auth'
import { sendProjectNotificationEmail } from '@/lib/email'

async function sendAccountDeletionNotifications(
  deletedId: number,
  deletedName: string
) {
  // Projects with unfinished tasks assigned to the deleted user, grouped by project owner
  const taskRows = await prisma.$queryRaw<Array<{
    owner_id: number; owner_name: string; owner_email: string | null
    project_id: number; project_title: string; task_count: number
  }>>`
    SELECT p.owner_id, v.name AS owner_name, v.email AS owner_email,
           p.id AS project_id, p.title AS project_title,
           COUNT(st.id) AS task_count
    FROM starter_tasks st
    JOIN projects p ON st.project_id = p.id
    JOIN volunteers v ON p.owner_id = v.id
    WHERE st.assigned_to_id = ${deletedId}
      AND st.status NOT IN ('completed', 'reviewed')
      AND p.owner_id != ${deletedId}
      AND v.deleted_at IS NULL
    GROUP BY p.id
  `

  const ownedProjects = await prisma.project.findMany({
    where: { ownerId: deletedId, status: { notIn: ['completed', 'archived'] } },
    select: { id: true, title: true },
  })

  if (!taskRows.length && !ownedProjects.length) return

  type Recipient = {
    name: string; email: string | null
    taskProjects: { projectId: number; projectTitle: string; taskCount: number }[]
    ownerlessProjects: { projectId: number; projectTitle: string }[]
  }
  const recipients: Record<number, Recipient> = {}

  for (const row of taskRows) {
    if (!recipients[row.owner_id]) {
      recipients[row.owner_id] = {
        name: row.owner_name, email: row.owner_email,
        taskProjects: [], ownerlessProjects: [],
      }
    }
    recipients[row.owner_id].taskProjects.push({
      projectId: row.project_id, projectTitle: row.project_title, taskCount: Number(row.task_count),
    })
  }

  const ownerless = ownedProjects.map(p => ({ projectId: p.id, projectTitle: p.title }))

  if (ownerless.length) {
    const admins = await prisma.volunteer.findMany({
      where: { isAdmin: true, deletedAt: null, id: { not: deletedId } },
      select: { id: true, name: true, email: true },
    })
    for (const admin of admins) {
      if (!recipients[admin.id]) {
        recipients[admin.id] = { name: admin.name, email: admin.email, taskProjects: [], ownerlessProjects: [] }
      }
      recipients[admin.id].ownerlessProjects = ownerless
    }
  }

  for (const [recipientId, r] of Object.entries(recipients)) {
    const rid = Number(recipientId)
    for (const p of r.taskProjects) {
      const word = p.taskCount === 1 ? 'task' : 'tasks'
      try {
        await prisma.notification.create({
          data: {
            volunteerId: rid, type: 'account_deleted_impact',
            title: `${deletedName} has deleted their account`,
            body: `${p.taskCount} ${word} in '${p.projectTitle}' assigned to ${deletedName} need a new assignee.`,
            link: `/static/project.html?id=${p.projectId}`,
          },
        })
      } catch (e) {
        console.error('[NOTIFY ERROR] Account deletion notification failed:', e)
      }
    }
    for (const p of r.ownerlessProjects) {
      try {
        await prisma.notification.create({
          data: {
            volunteerId: rid, type: 'account_deleted_impact',
            title: `${deletedName} has deleted their account`,
            body: `'${p.projectTitle}' needs a new owner.`,
            link: `/static/project.html?id=${p.projectId}`,
          },
        })
      } catch (e) {
        console.error('[NOTIFY ERROR] Account deletion notification failed:', e)
      }
    }

    if (r.email) {
      const allProjects = [...r.taskProjects, ...r.ownerlessProjects]
      const msgParts: string[] = [
        `<p><strong>${deletedName}</strong> has deleted their account.</p>`,
      ]
      if (r.taskProjects.length) {
        const rows = r.taskProjects
          .map(p => `<li>${p.taskCount} ${p.taskCount === 1 ? 'task' : 'tasks'} in <strong>${p.projectTitle}</strong></li>`)
          .join('')
        msgParts.push(`<p>The following tasks need a new assignee:</p><ul>${rows}</ul>`)
      }
      if (r.ownerlessProjects.length) {
        const rows = r.ownerlessProjects
          .map(p => `<li><strong>${p.projectTitle}</strong></li>`)
          .join('')
        msgParts.push(`<p>The following projects need a new owner:</p><ul>${rows}</ul>`)
      }
      try {
        await sendProjectNotificationEmail(
          r.email, r.name,
          `${deletedName} has deleted their account`,
          msgParts.join(''),
          allProjects[0].projectTitle,
          allProjects[0].projectId,
        )
      } catch (e) {
        console.error('[NOTIFY ERROR] Account deletion email failed:', e)
      }
    }
  }
}

export async function POST(request: NextRequest) {
  const volunteer = await getCurrentVolunteer(request.headers.get('authorization'))
  if (!volunteer) {
    return Response.json({ detail: 'Authentication required' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const vol = await prisma.volunteer.findUnique({
    where: { id: volunteer.id },
    select: { passwordHash: true },
  })

  if (!vol?.passwordHash || !verifyPassword(String(body.password || ''), vol.passwordHash)) {
    return Response.json({ detail: 'Password is incorrect' }, { status: 400 })
  }

  await prisma.deletionRequest.create({
    data: {
      volunteerId: volunteer.id,
      volunteerEmail: volunteer.email,
      status: 'completed',
    },
  })

  await sendAccountDeletionNotifications(volunteer.id, volunteer.name)

  await prisma.volunteer.update({
    where: { id: volunteer.id },
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

  await prisma.volunteerSkill.deleteMany({ where: { volunteerId: volunteer.id } })

  return Response.json({ message: "Your account has been deleted. We're sorry to see you go." })
}
