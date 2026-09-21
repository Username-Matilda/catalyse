import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject, createSkill, createTeam } from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('dashboard.get', () => {
  it('assembles owned, proposed, interested and suggested projects plus unread count', async () => {
    const me = await createVolunteer()
    const other = await createVolunteer()
    const skill = await createSkill()
    await prisma.volunteerSkill.create({ data: { volunteerId: me.id, skillId: skill.id } })

    const owned = await createProject({ assigneeId: me.id, status: 'in_progress' })
    const proposedUnowned = await createProject({ creatorId: me.id, assigneeId: null })
    const proposedOwnedByOther = await createProject({ creatorId: me.id, assigneeId: other.id })
    const interested = await createProject({
      assigneeId: other.id,
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await prisma.workItemInterest.create({
      data: {
        workItemId: interested.id,
        volunteerId: me.id,
        interestType: 'want_to_contribute',
        message: 'hi',
      },
    })
    const suggested = await createProject({
      status: 'ready',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    // Team-scoped projects are only suggested to that team's members.
    const myTeam = await createTeam()
    await prisma.teamMembership.create({ data: { teamId: myTeam.id, volunteerId: me.id } })
    const teamSuggested = await createProject({
      status: 'ready',
      teamId: myTeam.id,
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await createProject({
      status: 'ready',
      teamId: (await createTeam()).id,
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await createProject({
      status: 'pending_review',
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await createProject({
      status: 'ready',
      assigneeId: other.id,
      isSeekingHelp: false,
      skills: { create: [{ skillId: skill.id, isRequired: true }] },
    })
    await prisma.notification.createMany({
      data: [
        { volunteerId: me.id, type: 'x', title: 'unread' },
        { volunteerId: me.id, type: 'x', title: 'read', readAt: new Date() },
      ],
    })

    const d = await clientAs(me).dashboard.get()
    expect(d.ownedProjects.map((p) => p.id)).toEqual([owned.id])
    expect(d.proposedProjects.map((p) => p.id).sort()).toEqual(
      [proposedUnowned.id, proposedOwnedByOther.id].sort(),
    )
    expect(d.myInterests).toEqual([
      expect.objectContaining({
        id: interested.id,
        interestMessage: 'hi',
        interestStatus: 'pending',
        match: expect.objectContaining({ matchedRequiredCount: 1 }),
      }),
    ])
    expect(d.suggestedProjects.map((p) => p.id).sort()).toEqual(
      [suggested.id, teamSuggested.id].sort(),
    )
    expect(d.unreadNotificationCount).toBe(1)
  })

  it('offers the approval welcome until its notification is read', async () => {
    const me = await createVolunteer({ emailConfirmed: false })
    const c = clientAs(me)
    expect((await c.dashboard.get()).approvalWelcome).toBeNull()
    const note = await prisma.notification.create({
      data: { volunteerId: me.id, type: 'application_approved', title: 'Approved' },
    })
    expect((await c.dashboard.get()).approvalWelcome).toEqual({
      notificationId: note.id,
      emailConfirmed: false,
    })
    await prisma.volunteer.update({ where: { id: me.id }, data: { emailConfirmed: true } })
    expect((await c.dashboard.get()).approvalWelcome).toMatchObject({ emailConfirmed: true })
    await c.notifications.markRead({ id: note.id })
    expect((await c.dashboard.get()).approvalWelcome).toBeNull()
  })

  it('suggests nothing to a volunteer without skills', async () => {
    const me = await createVolunteer()
    const d = await clientAs(me).dashboard.get()
    expect(d.suggestedProjects).toEqual([])
    expect(d.unreadNotificationCount).toBe(0)
  })
})

describe('privacy.export', () => {
  it('bundles everything held about the volunteer, with contact details', async () => {
    const me = await createVolunteer({ discordHandle: 'me#1' })
    const other = await createVolunteer()
    const skill = await createSkill()
    await prisma.volunteerSkill.create({
      data: { volunteerId: me.id, skillId: skill.id, proficiencyLevel: 'x' },
    })
    const p = await createProject({ creatorId: me.id })
    await prisma.workItemInterest.create({
      data: { workItemId: p.id, volunteerId: me.id, interestType: 'want_to_own' },
    })
    await prisma.message.createMany({
      data: [
        {
          fromVolunteerId: me.id,
          toVolunteerId: other.id,
          subject: 'out',
          message: 'm',
          relatedWorkItemId: p.id,
        },
        { fromVolunteerId: other.id, toVolunteerId: me.id, subject: 'in', message: 'm' },
      ],
    })
    const out = await clientAs(me).privacy.export()
    expect(out.profile).toMatchObject({ email: me.email, discordHandle: 'me#1' })
    expect(out.skills).toEqual([expect.objectContaining({ id: skill.id, proficiencyLevel: 'x' })])
    expect(out.projects).toEqual([expect.objectContaining({ id: p.id, proposedById: me.id })])
    expect(out.interests).toEqual([
      expect.objectContaining({ projectId: p.id, interestType: 'want_to_own' }),
    ])
    expect(out.messagesSent).toEqual([
      expect.objectContaining({ subject: 'out', relatedProjectId: p.id }),
    ])
    expect(out.messagesReceived).toEqual([
      expect.objectContaining({ subject: 'in', fromVolunteerId: other.id }),
    ])
    expect(typeof out.exportedAt).toBe('string')
  })

  it('is NOT_FOUND if the volunteer row has vanished', async () => {
    const me = await createVolunteer()
    const c = clientAs(me)
    await prisma.volunteer.delete({ where: { id: me.id } })
    await expect(c.privacy.export()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
