import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createProject, createTask } from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('admin.stats.get', () => {
  it('aggregates volunteer, project and interest counts', async () => {
    const admin = await createAdmin()
    await createVolunteer({ approvalStatus: 'pending' })
    await createVolunteer({ approvalStatus: 'under_review' })
    await createVolunteer({ approvalStatus: 'needs_info', createdAt: new Date('2020-01-01') })
    await createVolunteer({ approvalStatus: 'rejected' })
    await createVolunteer({ deletedAt: new Date() })
    const owner = await createVolunteer()
    await createProject({ status: 'pending_review' })
    await createProject({ status: 'ready' })
    await createProject({ status: 'in_progress', assigneeId: owner.id, isSeekingHelp: true })
    await createProject({ status: 'in_progress', assigneeId: owner.id, isSeekingHelp: false })
    const done = await createProject({ status: 'completed' })
    await prisma.workItemInterest.createMany({
      data: [
        {
          workItemId: done.id,
          volunteerId: owner.id,
          interestType: 'want_to_contribute',
          status: 'pending',
        },
        {
          workItemId: done.id,
          volunteerId: admin.id,
          interestType: 'want_to_contribute',
          status: 'accepted',
        },
      ],
    })
    expect(await clientAs(admin).admin.stats.get()).toEqual({
      volunteers: {
        total: 5,
        approved: 2,
        pending: 1,
        underReview: 1,
        needsInfo: 1,
        last30Days: 4,
      },
      projects: { total: 5, pendingReview: 1, seekingHelp: 2, inProgress: 2, completed: 1 },
      interests: { total: 2, pending: 1 },
    })
  })
})

describe('admin.triage', () => {
  it('lists the review queue and volunteer drafts', async () => {
    const admin = await createAdmin()
    const c = clientAs(admin)
    const p1 = await createProject({ status: 'pending_review' })
    const p2 = await createProject({ status: 'needs_discussion' })
    await createProject({ status: 'ready' })
    const draft = await createProject({ status: 'draft', isOrgProposed: false })
    await createProject({ status: 'draft', isOrgProposed: true })
    const queue = (await c.admin.triage.list()).map((p) => p.id)
    expect(queue.filter((id) => id >= p1.id)).toEqual([p1.id, p2.id])
    expect((await c.admin.triage.drafts()).map((p) => p.id)).toContain(draft.id)
  })

  it('submits a volunteer draft for review with notifications', async () => {
    const admin = await createAdmin()
    const creator = await createVolunteer()
    const c = clientAs(admin)
    await expect(c.admin.triage.submitDraft({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    const org = await createProject({ status: 'draft', isOrgProposed: true })
    await expect(c.admin.triage.submitDraft({ id: org.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Not a volunteer draft',
    })
    const live = await createProject({ status: 'ready' })
    await expect(c.admin.triage.submitDraft({ id: live.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    const draft = await createProject({
      status: 'draft',
      isOrgProposed: false,
      creatorId: creator.id,
    })
    await expect(c.admin.triage.submitDraft({ id: draft.id })).rejects.toMatchObject({
      message: 'Add at least one task before submitting this draft for review',
    })
    await createTask(draft.id)
    expect(await c.admin.triage.submitDraft({ id: draft.id })).toEqual({
      message: 'Project submitted for review',
    })
    expect((await prisma.workItem.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      'pending_review',
    )
    await vi.waitFor(async () => {
      expect(
        await prisma.notification.count({
          where: { volunteerId: admin.id, type: 'new_project_proposal' },
        }),
      ).toBe(1)
      expect(
        await prisma.notification.count({
          where: { volunteerId: creator.id, type: 'draft_submitted_by_admin' },
        }),
      ).toBe(1)
    })

    // A draft with no creator skips the creator notification.
    const orphan = await createProject({ status: 'draft', isOrgProposed: false })
    await createTask(orphan.id)
    expect(await c.admin.triage.submitDraft({ id: orphan.id })).toEqual({
      message: 'Project submitted for review',
    })
  })
})
