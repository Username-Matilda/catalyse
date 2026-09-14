import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createTask,
  createQuickTask,
  createTeam,
} from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('workItemComments.list', () => {
  it('follows work-item visibility, and reports whether the viewer may post', async () => {
    const owner = await createVolunteer()
    const helper = await createVolunteer()
    const other = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id })
    await prisma.workItemInterest.create({
      data: {
        workItemId: project.id,
        volunteerId: helper.id,
        interestType: 'want_to_contribute',
        status: 'accepted',
      },
    })
    await expect(
      clientAs(other).workItemComments.list({ workItemId: 999_999 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await clientAs(owner).workItemComments.list({ workItemId: project.id })).canPost).toBe(
      true,
    )
    expect((await clientAs(helper).workItemComments.list({ workItemId: project.id })).canPost).toBe(
      true,
    )
    expect((await clientAs(other).workItemComments.list({ workItemId: project.id })).canPost).toBe(
      false,
    )

    const hidden = await createProject({ status: 'pending_review', creatorId: owner.id })
    await expect(
      clientAs(other).workItemComments.list({ workItemId: hidden.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // A task follows its parent; a team project restricts non-members.
    const team = await createTeam()
    const teamProject = await createProject({ teamId: team.id, assigneeId: owner.id })
    const task = await createTask(teamProject.id)
    await expect(
      clientAs(other).workItemComments.list({ workItemId: task.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: other.id } })
    expect((await clientAs(other).workItemComments.list({ workItemId: task.id })).canPost).toBe(
      false,
    )
    expect((await clientAs(owner).workItemComments.list({ workItemId: task.id })).canPost).toBe(
      true,
    )

    // A quick task with no project context: only its assignee may post.
    const qt = await createQuickTask({ assigneeId: helper.id, status: 'in_progress' })
    expect((await clientAs(helper).workItemComments.list({ workItemId: qt.id })).canPost).toBe(true)
    expect(
      (await clientAs(await createAdmin()).workItemComments.list({ workItemId: qt.id })).canPost,
    ).toBe(true)
  })
})

describe('workItemComments.add', () => {
  it('posts for participants and notifies the other participants', async () => {
    const creator = await createVolunteer()
    const owner = await createVolunteer()
    const assignee = await createVolunteer()
    const other = await createVolunteer()
    const project = await createProject({ creatorId: creator.id, assigneeId: owner.id })
    const task = await createTask(project.id, { assigneeId: assignee.id, creatorId: owner.id })

    await expect(
      clientAs(other).workItemComments.add({ workItemId: 999_999, content: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      clientAs(other).workItemComments.add({ workItemId: task.id, content: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const res = await clientAs(assignee).workItemComments.add({
      workItemId: task.id,
      content: '  done  ',
    })
    expect(res).toMatchObject({ message: 'Comment added' })
    await vi.waitFor(async () => {
      const notes = await prisma.notification.findMany({ where: { type: 'work_item_comment' } })
      expect(notes.map((n) => n.volunteerId).sort()).toEqual([owner.id].sort())
      expect(notes[0].link).toBe(`/projects/${project.id}`)
    })
    const { comments } = await clientAs(owner).workItemComments.list({ workItemId: task.id })
    expect(comments[0]).toMatchObject({ content: 'done', authorName: assignee.name })

    // Project comment by the owner notifies the creator; quick-task link points at the task.
    await clientAs(owner).workItemComments.add({ workItemId: project.id, content: 'update' })
    await vi.waitFor(async () =>
      expect(
        await prisma.notification.count({
          where: { type: 'work_item_comment', volunteerId: creator.id },
        }),
      ).toBe(1),
    )
    // A task with no parent (data corruption) still gets a link, to the dashboard.
    const admin = await createAdmin()
    const orphan = await prisma.workItem.create({
      data: {
        type: 'TASK',
        status: 'open',
        title: 'orphan',
        assigneeId: admin.id,
        creatorId: owner.id,
      },
    })
    await clientAs(admin).workItemComments.add({ workItemId: orphan.id, content: 'o' })
    await vi.waitFor(async () =>
      expect(
        await prisma.notification.findFirst({
          where: { type: 'work_item_comment', volunteerId: owner.id, link: '/dashboard' },
        }),
      ).not.toBeNull(),
    )
    const qt = await createQuickTask({
      assigneeId: assignee.id,
      creatorId: owner.id,
      status: 'in_progress',
    })
    await clientAs(assignee).workItemComments.add({ workItemId: qt.id, content: 'q' })
    await vi.waitFor(async () =>
      expect(
        await prisma.notification.findFirst({
          where: { type: 'work_item_comment', link: `/quick-tasks/${qt.id}` },
        }),
      ).not.toBeNull(),
    )
  })
})
