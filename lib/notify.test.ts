import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createTeam } from '@/test/factories'

vi.mock('./email', () => ({
  sendProjectNotificationEmail: vi.fn(async () => true),
  sendAdminAlertEmail: vi.fn(async () => true),
}))

import { sendProjectNotificationEmail, sendAdminAlertEmail } from './email'
import {
  createNotification,
  clearNotifications,
  notifyUser,
  notifyTeamOfProject,
  notifyAdmins,
} from './notify'

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('createNotification / clearNotifications', () => {
  it('stores and clears notifications by type and entity', async () => {
    const vol = await createVolunteer()
    await createNotification(vol.id, 'thing', 'Title', 'body', '/x', 42)
    await createNotification(vol.id, 'thing', 'Title2')
    expect(await prisma.notification.count({ where: { volunteerId: vol.id } })).toBe(2)
    await clearNotifications('thing', 42)
    const left = await prisma.notification.findMany({ where: { volunteerId: vol.id } })
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ body: null, link: null, entityId: null })
  })

  it('logs rather than throws when the clear fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma.notification, 'deleteMany').mockRejectedValueOnce(new Error('db') as never)
    await clearNotifications('x', 1)
    expect(error).toHaveBeenCalledWith('[NOTIFY CLEAR ERROR]', expect.any(Error))
  })
})

describe('notifyUser', () => {
  it('creates the notification and emails a project or admin-alert payload', async () => {
    const vol = await createVolunteer()
    await notifyUser(vol.id, 'a', 'T', null, null)
    expect(sendProjectNotificationEmail).not.toHaveBeenCalled()

    await notifyUser(vol.id, 'a', 'T', 'b', '/l', { message: 'm', projectId: 1, projectTitle: 'P' })
    expect(sendProjectNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: vol.email, subject: 'T', projectId: 1 }),
    )
    await notifyUser(vol.id, 'a', 'T', 'b', '/l', {
      subject: 'Custom',
      message: 'm',
      ctaLabel: 'Go',
      ctaUrl: '/go',
    })
    expect(sendAdminAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Custom', ctaUrl: '/go' }),
    )
  })

  it('skips the email for a volunteer without one, and logs send/insert failures', async () => {
    const noEmail = await createVolunteer({ email: null })
    await notifyUser(noEmail.id, 'a', 'T', null, null, {
      message: 'm',
      projectId: 1,
      projectTitle: 'P',
    })
    expect(sendProjectNotificationEmail).not.toHaveBeenCalled()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const vol = await createVolunteer()
    vi.mocked(sendProjectNotificationEmail).mockRejectedValueOnce(new Error('smtp'))
    await notifyUser(vol.id, 'a', 'T', null, null, {
      message: 'm',
      projectId: 1,
      projectTitle: 'P',
    })
    await new Promise((r) => setImmediate(r))
    expect(error).toHaveBeenCalledWith('[EMAIL ERROR]', expect.any(Error))

    vi.spyOn(prisma.notification, 'create').mockRejectedValueOnce(new Error('db') as never)
    await notifyUser(vol.id, 'a', 'T', null, null)
    await new Promise((r) => setImmediate(r))
    expect(error).toHaveBeenCalledWith('[NOTIFY ERROR]', expect.any(Error))
  })
})

describe('notifyTeamOfProject / notifyAdmins', () => {
  it('fans out to team members and to live admins', async () => {
    const team = await createTeam()
    const m1 = await createVolunteer()
    const m2 = await createVolunteer()
    await prisma.teamMembership.createMany({
      data: [
        { teamId: team.id, volunteerId: m1.id },
        { teamId: team.id, volunteerId: m2.id },
      ],
    })
    await notifyTeamOfProject(team.id, 7, 'Proj')
    // createNotification is fire-and-forget inside notifyUser, so poll for the rows.
    const notes = await vi.waitFor(async () => {
      const rows = await prisma.notification.findMany({ where: { type: 'team_project_assigned' } })
      expect(rows).toHaveLength(2)
      return rows
    })
    expect(notes.map((n) => n.volunteerId).sort()).toEqual([m1.id, m2.id].sort())
    expect(notes[0]).toMatchObject({ link: '/projects/7', entityId: 7 })

    const admin = await createAdmin()
    await createAdmin({ deletedAt: new Date() })
    await notifyAdmins('alert', 'T', null, null, { message: 'm', ctaLabel: 'L', ctaUrl: '/u' }, 3)
    await vi.waitFor(async () =>
      expect(await prisma.notification.count({ where: { type: 'alert' } })).toBe(1),
    )
    expect(sendAdminAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ to: admin.email }))
  })
})
