import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createTask,
  createTeam,
} from '@/test/factories'
import { clientAs } from '@/test/rpc'

const interestRow = (volunteerId: number, workItemId: number) =>
  prisma.workItemInterest.findUniqueOrThrow({
    where: { volunteerId_workItemId: { volunteerId, workItemId } },
  })
const notified = (volunteerId: number, type: string, expected: object = {}) =>
  vi.waitFor(async () =>
    expect(await prisma.notification.findFirst({ where: { volunteerId, type } })).toMatchObject(
      expected,
    ),
  )

describe('projects.expressInterest / withdrawInterest', () => {
  it('records interest on a seeking project and notifies the owner', async () => {
    const owner = await createVolunteer()
    const me = await createVolunteer()
    const c = clientAs(me)
    const closed = await createProject({
      assigneeId: owner.id,
      isSeekingHelp: false,
      status: 'in_progress',
    })
    await expect(
      c.projects.expressInterest({ projectId: closed.id, interestType: 'want_to_contribute' }),
    ).rejects.toMatchObject({ message: 'This project is not currently seeking volunteers' })
    const team = await createTeam()
    const teamP = await createProject({ teamId: team.id })
    await expect(
      c.projects.expressInterest({ projectId: teamP.id, interestType: 'want_to_own' }),
    ).rejects.toMatchObject({ message: 'Project not found' })
    // A team member can reach the team's project.
    const member = await createVolunteer()
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: member.id } })
    expect(
      await clientAs(member).projects.expressInterest({
        projectId: teamP.id,
        interestType: 'want_to_own',
      }),
    ).toEqual({ message: 'Interest expressed successfully' })
    // ...as can its proposer, without being on the team.
    const proposed = await createProject({ teamId: team.id, creatorId: me.id })
    expect(
      await c.projects.expressInterest({ projectId: proposed.id, interestType: 'want_to_own' }),
    ).toEqual({ message: 'Interest expressed successfully' })

    const p = await createProject({
      assigneeId: owner.id,
      isSeekingHelp: true,
      status: 'in_progress',
    })
    expect(
      await c.projects.expressInterest({
        projectId: p.id,
        interestType: 'want_to_contribute',
        message: 'pick me',
      }),
    ).toEqual({ message: 'Interest expressed successfully' })
    await notified(owner.id, 'new_interest')
    await expect(
      c.projects.expressInterest({ projectId: p.id, interestType: 'want_to_contribute' }),
    ).rejects.toMatchObject({ message: "You've already expressed interest" })

    await expect(
      clientAs(owner).projects.withdrawInterest({ projectId: p.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const task = await createTask(p.id, { assigneeId: me.id, status: 'in_progress' })
    const doneTask = await createTask(p.id, { assigneeId: me.id, status: 'completed' })
    expect(await c.projects.withdrawInterest({ projectId: p.id })).toEqual({
      message: 'Interest withdrawn',
    })
    expect((await interestRow(me.id, p.id)).status).toBe('withdrawn')
    expect(await prisma.workItem.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      assigneeId: null,
      status: 'open',
    })
    expect(
      (await prisma.workItem.findUniqueOrThrow({ where: { id: doneTask.id } })).assigneeId,
    ).toBe(me.id)

    // Re-expressing after withdrawal reuses the row; an unowned project notifies nobody.
    await c.projects.expressInterest({ projectId: p.id, interestType: 'want_to_own' })
    expect(await interestRow(me.id, p.id)).toMatchObject({
      status: 'pending',
      interestType: 'want_to_own',
    })
    const unowned = await createProject()
    await c.projects.expressInterest({ projectId: unowned.id, interestType: 'want_to_own' })
    await vi.waitFor(async () =>
      expect(await prisma.notification.count({ where: { type: 'new_interest' } })).toBe(2),
    )
  })
})

describe('projects.respondToInterest', () => {
  it('lets the owner or an admin accept/decline, with the side effects of each', async () => {
    const owner = await createVolunteer()
    const helper = await createVolunteer()
    const other = await createVolunteer()
    const p = await createProject({
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
    })
    await clientAs(helper).projects.expressInterest({
      projectId: p.id,
      interestType: 'want_to_contribute',
    })
    const interest = await interestRow(helper.id, p.id)
    const c = clientAs(owner)
    await expect(
      clientAs(other).projects.respondToInterest({
        projectId: p.id,
        interestId: interest.id,
        status: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.respondToInterest({
        projectId: 999_999,
        interestId: interest.id,
        status: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.respondToInterest({ projectId: p.id, interestId: 999_999, status: 'accepted' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(
      await c.projects.respondToInterest({
        projectId: p.id,
        interestId: interest.id,
        status: 'accepted',
        responseMessage: 'welcome',
      }),
    ).toEqual({ message: 'Interest accepted' })
    expect(await interestRow(helper.id, p.id)).toMatchObject({
      status: 'accepted',
      responseMessage: 'welcome',
    })
    await notified(helper.id, 'interest_accepted', {
      title: `Accepted: your interest in '${p.title}'`,
      link: `/projects/${p.id}`,
    })

    const task = await createTask(p.id, { assigneeId: helper.id, status: 'in_progress' })
    await c.projects.respondToInterest({
      projectId: p.id,
      interestId: interest.id,
      status: 'declined',
    })
    expect(
      (await prisma.workItem.findUniqueOrThrow({ where: { id: task.id } })).assigneeId,
    ).toBeNull()
    await notified(helper.id, 'interest_declined', {
      title: `Declined: your interest in '${p.title}'`,
      link: `/projects/${p.id}`,
    })

    const pending = await createVolunteer({ approvalStatus: 'pending' })
    const pi = await prisma.workItemInterest.create({
      data: { workItemId: p.id, volunteerId: pending.id, interestType: 'want_to_contribute' },
    })
    await expect(
      c.projects.respondToInterest({ projectId: p.id, interestId: pi.id, status: 'accepted' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not yet approved') })

    // Accepting a want_to_own interest hands over the project.
    const unowned = await createProject()
    await clientAs(helper).projects.expressInterest({
      projectId: unowned.id,
      interestType: 'want_to_own',
    })
    const oi = await interestRow(helper.id, unowned.id)
    await clientAs(await createAdmin()).projects.respondToInterest({
      projectId: unowned.id,
      interestId: oi.id,
      status: 'accepted',
    })
    expect(await prisma.workItem.findUniqueOrThrow({ where: { id: unowned.id } })).toMatchObject({
      assigneeId: helper.id,
      status: 'in_progress',
    })
  })
})

describe('projects.assign', () => {
  it('assigns an approved volunteer, accepting or creating their interest', async () => {
    const owner = await createVolunteer()
    const other = await createVolunteer()
    const vol = await createVolunteer()
    const p = await createProject({
      assigneeId: owner.id,
      status: 'in_progress',
      isSeekingHelp: true,
    })
    const c = clientAs(owner)
    await expect(
      c.projects.assign({ projectId: 999_999, volunteerId: vol.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      clientAs(other).projects.assign({ projectId: p.id, volunteerId: vol.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.assign({ projectId: p.id, volunteerId: 999_999 }),
    ).rejects.toMatchObject({ message: 'Volunteer not found' })
    const pending = await createVolunteer({ approvalStatus: 'pending' })
    await expect(
      c.projects.assign({ projectId: p.id, volunteerId: pending.id }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not yet approved') })

    expect(await c.projects.assign({ projectId: p.id, volunteerId: vol.id })).toEqual({
      message: 'Volunteer assigned to project',
    })
    expect((await interestRow(vol.id, p.id)).status).toBe('accepted')
    await notified(vol.id, 'assigned_to_project', {
      title: `Assigned: you're on '${p.title}'`,
      link: `/projects/${p.id}`,
    })
    expect(await c.projects.assign({ projectId: p.id, volunteerId: vol.id })).toEqual({
      message: 'This volunteer is already assigned to this project',
    })

    const applicant = await createVolunteer()
    await clientAs(applicant).projects.expressInterest({
      projectId: p.id,
      interestType: 'want_to_contribute',
    })
    await c.projects.assign({ projectId: p.id, volunteerId: applicant.id })
    expect((await interestRow(applicant.id, p.id)).status).toBe('accepted')
    // A declined interest gets neither re-accepted nor recreated; the assignee is still notified.
    const declined = await createVolunteer()
    await prisma.workItemInterest.create({
      data: {
        workItemId: p.id,
        volunteerId: declined.id,
        interestType: 'want_to_contribute',
        status: 'declined',
      },
    })
    await c.projects.assign({ projectId: p.id, volunteerId: declined.id })
    expect((await interestRow(declined.id, p.id)).status).toBe('declined')
  })

  it('assigning as owner sets the assignee, unless the project is finished', async () => {
    const admin = await createAdmin()
    const vol = await createVolunteer()
    const unowned = await createProject()
    await clientAs(admin).projects.assign({
      projectId: unowned.id,
      volunteerId: vol.id,
      interestType: 'want_to_own',
    })
    expect(await prisma.workItem.findUniqueOrThrow({ where: { id: unowned.id } })).toMatchObject({
      assigneeId: vol.id,
      status: 'in_progress',
    })
    const done = await createProject({ status: 'completed' })
    await clientAs(admin).projects.assign({
      projectId: done.id,
      volunteerId: vol.id,
      interestType: 'want_to_own',
    })
    expect(await prisma.workItem.findUniqueOrThrow({ where: { id: done.id } })).toMatchObject({
      assigneeId: vol.id,
      status: 'completed',
    })
  })
})
