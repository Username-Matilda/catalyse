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

const task = (id: number) => prisma.workItem.findUniqueOrThrow({ where: { id } })

describe('projects.listTasks / getTask', () => {
  it('lists tasks with schedule, dependencies and manage rights, gated on project visibility', async () => {
    const owner = await createVolunteer()
    const me = await createVolunteer()
    const project = await createProject({
      assigneeId: owner.id,
      status: 'in_progress',
      startDate: new Date('2026-04-01T00:00:00Z'),
    })
    const a = await createTask(project.id, {
      sortOrder: 1,
      durationDays: 2,
      assigneeId: me.id,
      creatorId: owner.id,
    })
    const b = await createTask(project.id, { sortOrder: 2 })
    const done = await createTask(project.id, { sortOrder: 0, status: 'completed' })
    // Same sortOrder as `b`, created later → listed first within that order.
    const tie = await createTask(project.id, {
      sortOrder: 2,
      createdAt: new Date(Date.now() + 60_000),
    })
    await prisma.workItemDependency.create({
      data: { predecessorId: a.id, successorId: b.id, lagDays: 1 },
    })
    await expect(clientAs(me).projects.listTasks({ projectId: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    const res = await clientAs(me).projects.listTasks({ projectId: project.id })
    expect(res.tasks.map((t) => t.id)).toEqual([a.id, tie.id, b.id, done.id])
    expect(res.tasks[0]).toMatchObject({ assignedToName: me.name, createdByName: owner.name })
    expect(res.dependencies).toEqual([
      expect.objectContaining({ predecessorId: a.id, successorId: b.id, lagDays: 1 }),
    ])
    expect(res.scheduled.find((s) => s.id === b.id)?.start).toEqual(
      new Date('2026-04-04T00:00:00Z'),
    )
    expect(res.scopeOrigin).toEqual(new Date('2026-04-01T00:00:00Z'))
    expect(res.canManageTasks).toBe(false)
    expect(
      (await clientAs(owner).projects.listTasks({ projectId: project.id })).canManageTasks,
    ).toBe(true)

    // A task pinned before the origin extends the scope backwards.
    await prisma.workItem.update({
      where: { id: a.id },
      data: { startDate: new Date('2026-03-01T00:00:00Z') },
    })
    expect((await clientAs(me).projects.listTasks({ projectId: project.id })).scopeStart).toEqual(
      new Date('2026-03-01T00:00:00Z'),
    )

    const hidden = await createProject({ status: 'pending_review' })
    await expect(clientAs(me).projects.listTasks({ projectId: hidden.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('getTask returns detail with predecessors, siblings and claim/manage flags', async () => {
    const owner = await createVolunteer()
    const me = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const a = await createTask(project.id, { sortOrder: 1 })
    const b = await createTask(project.id, { sortOrder: 2, featuredAsQuickTask: true })
    await prisma.workItemDependency.create({ data: { predecessorId: a.id, successorId: b.id } })
    await expect(
      clientAs(me).projects.getTask({ projectId: 999_999, taskId: b.id }),
    ).rejects.toMatchObject({ message: 'Project not found' })
    await expect(
      clientAs(me).projects.getTask({ projectId: project.id, taskId: 999_999 }),
    ).rejects.toMatchObject({ message: 'Task not found' })
    const view = await clientAs(me).projects.getTask({ projectId: project.id, taskId: b.id })
    expect(view).toMatchObject({
      projectTitle: project.title,
      projectOwnerId: owner.id,
      canClaim: true,
      canManage: false,
      featuredAsQuickTask: true,
      assignedToName: null,
      createdByName: null,
    })
    expect(view.predecessors).toEqual([
      expect.objectContaining({ predecessorId: a.id, predecessorTitle: a.title, lagDays: 0 }),
    ])
    expect(view.siblingTasks).toEqual([{ id: a.id, title: a.title }])
    expect(
      (await clientAs(owner).projects.getTask({ projectId: project.id, taskId: b.id })).canManage,
    ).toBe(true)

    const team = await createTeam()
    const teamP = await createProject({ teamId: team.id })
    const t = await createTask(teamP.id)
    await expect(
      clientAs(me).projects.getTask({ projectId: teamP.id, taskId: t.id }),
    ).rejects.toMatchObject({ message: 'Task not found' })
  })
})

describe('projects.createTask / reorderTasks / deleteTask', () => {
  it('manages the backlog as owner, draft creator or admin', async () => {
    const owner = await createVolunteer()
    const other = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const c = clientAs(owner)
    await expect(c.projects.createTask({ projectId: 999_999, title: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      clientAs(other).projects.createTask({ projectId: project.id, title: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const t1 = await c.projects.createTask({ projectId: project.id, title: 'First' })
    const t2 = await c.projects.createTask({
      projectId: project.id,
      title: 'Second',
      description: 'd',
      estimatedHours: 2,
      deadline: new Date('2026-09-01T00:00:00Z'),
      featuredAsQuickTask: true,
      startDate: new Date('2026-08-01T00:00:00Z'),
      durationDays: 3,
    })
    expect((await task(t1.id)).sortOrder).toBe(1)
    expect(await task(t2.id)).toMatchObject({
      sortOrder: 2,
      estimatedHours: 2,
      featuredAsQuickTask: true,
      durationDays: 3,
    })

    await expect(
      clientAs(other).projects.reorderTasks({ projectId: project.id, items: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(c.projects.reorderTasks({ projectId: 999_999, items: [] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      await c.projects.reorderTasks({
        projectId: project.id,
        items: [
          { id: t1.id, sortOrder: 5 },
          { id: t2.id, sortOrder: 4 },
        ],
      }),
    ).toEqual({ success: true })
    expect((await task(t1.id)).sortOrder).toBe(5)

    await expect(
      clientAs(other).projects.deleteTask({ projectId: project.id, taskId: t1.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.deleteTask({ projectId: 999_999, taskId: t1.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      c.projects.deleteTask({ projectId: project.id, taskId: 999_999 }),
    ).rejects.toMatchObject({ message: 'Task not found' })
    // The task can vanish between the permission check and the delete.
    vi.spyOn(prisma.workItem, 'deleteMany').mockResolvedValueOnce({ count: 0 })
    await expect(
      c.projects.deleteTask({ projectId: project.id, taskId: t1.id }),
    ).rejects.toMatchObject({ message: 'Task not found' })
    expect(await c.projects.deleteTask({ projectId: project.id, taskId: t1.id })).toEqual({
      message: 'Task deleted',
    })

    const draft = await createProject({ status: 'draft', creatorId: other.id })
    expect(
      (await clientAs(other).projects.createTask({ projectId: draft.id, title: 'Draft task' }))
        .message,
    ).toBe('Task created')
  })
})

describe('projects.setBaseline', () => {
  it('copies the current schedule onto the baseline for scheduled items', async () => {
    const owner = await createVolunteer()
    const other = await createVolunteer()
    const project = await createProject({
      assigneeId: owner.id,
      startDate: new Date('2026-01-01T00:00:00Z'),
      durationDays: 10,
    })
    const scheduled = await createTask(project.id, { durationDays: 2 })
    const unscheduled = await createTask(project.id)
    await expect(
      clientAs(other).projects.setBaseline({ projectId: project.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      clientAs(owner).projects.setBaseline({ projectId: 999_999 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await clientAs(owner).projects.setBaseline({ projectId: project.id })).toEqual({
      message: 'Baseline updated',
    })
    expect(await task(project.id)).toMatchObject({
      baselineStartDate: new Date('2026-01-01T00:00:00Z'),
      baselineDurationDays: 10,
    })
    expect((await task(scheduled.id)).baselineDurationDays).toBe(2)
    expect((await task(unscheduled.id)).baselineSetAt).toBeNull()
    await prisma.workItem.update({ where: { id: scheduled.id }, data: { durationDays: 5 } })
    await clientAs(owner).projects.setBaseline({ projectId: project.id, includeTasks: false })
    expect((await task(scheduled.id)).baselineDurationDays).toBe(2)
  })
})

describe('projects.ganttOverview', () => {
  it('places visible projects with their edges and task counts', async () => {
    const me = await createVolunteer()
    const team = await createTeam()
    const a = await createProject({
      title: 'gantt a',
      durationDays: 3,
      country: 'UK',
      localGroup: 'L',
    })
    const b = await createProject({ title: 'gantt b', status: 'in_progress', assigneeId: me.id })
    await createTask(b.id)
    await createTask(b.id)
    const hidden = await createProject({ teamId: team.id })
    const done = await createProject({ status: 'completed' })
    await prisma.workItemDependency.createMany({
      data: [
        { predecessorId: a.id, successorId: b.id },
        { predecessorId: hidden.id, successorId: b.id },
      ],
    })

    const res = await clientAs(me).projects.ganttOverview({})
    const idsSeen = res.projects.map((p) => p.id)
    expect(idsSeen).toEqual(expect.arrayContaining([a.id, b.id]))
    expect(idsSeen).not.toContain(hidden.id)
    expect(idsSeen).not.toContain(done.id)
    expect(res.projects.find((p) => p.id === b.id)).toMatchObject({ taskCount: 2 })
    expect(res.projects.find((p) => p.id === a.id)!.placement).not.toBeNull()
    expect(res.dependencies).toEqual([
      expect.objectContaining({ predecessorId: a.id, successorId: b.id }),
    ])

    expect(
      (await clientAs(me).projects.ganttOverview({ statuses: ['completed'] })).projects.map(
        (p) => p.id,
      ),
    ).toEqual([done.id])
    expect(
      (await clientAs(me).projects.ganttOverview({ country: 'UK', localGroup: 'L' })).projects.map(
        (p) => p.id,
      ),
    ).toEqual([a.id])
    await prisma.teamMembership.create({ data: { teamId: team.id, volunteerId: me.id } })
    expect(
      (await clientAs(me).projects.ganttOverview({ teamId: team.id })).projects.map((p) => p.id),
    ).toEqual([hidden.id])
    expect(
      (await clientAs(await createAdmin()).projects.ganttOverview({ teamId: team.id })).projects,
    ).toHaveLength(1)
  })
})

describe('projects.updateTask', () => {
  it('lets the owner edit any field and tracks actual start/finish', async () => {
    const owner = await createVolunteer()
    const helper = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const t = await createTask(project.id)
    const c = clientAs(owner)
    await expect(
      c.projects.updateTask({ projectId: project.id, taskId: 999_999, data: {} }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await c.projects.updateTask({
      projectId: project.id,
      taskId: t.id,
      data: {
        title: 'T2',
        description: 'd',
        estimatedHours: 1,
        deadline: new Date('2026-10-01T00:00:00Z'),
        featuredAsQuickTask: true,
        isAnchor: true,
        startDate: new Date('2026-09-01T00:00:00Z'),
        durationDays: 2,
        assigneeId: helper.id,
        status: 'in_progress',
      },
    })
    const after = await task(t.id)
    expect(after).toMatchObject({
      title: 'T2',
      assigneeId: helper.id,
      status: 'in_progress',
      isAnchor: true,
      durationDays: 2,
    })
    expect(after.startedAt).not.toBeNull()
    const started = after.startedAt
    await c.projects.updateTask({
      projectId: project.id,
      taskId: t.id,
      data: { status: 'in_progress' },
    })
    expect((await task(t.id)).startedAt).toEqual(started)
    await c.projects.updateTask({
      projectId: project.id,
      taskId: t.id,
      data: { status: 'completed' },
    })
    expect((await task(t.id)).completedAt).not.toBeNull()
    await c.projects.updateTask({ projectId: project.id, taskId: t.id, data: { status: 'open' } })
    expect(await task(t.id)).toMatchObject({ assigneeId: null, completedAt: null, startedAt: null })
  })

  it('allows self-claim and marking done, but nothing more, for non-owners', async () => {
    const owner = await createVolunteer()
    const me = await createVolunteer()
    const rival = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const t = await createTask(project.id)
    const c = clientAs(me)
    await expect(
      c.projects.updateTask({ projectId: project.id, taskId: t.id, data: { title: 'x' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.updateTask({
        projectId: project.id,
        taskId: t.id,
        data: { status: 'in_progress', assigneeId: me.id, title: 'sneaky' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await c.projects.updateTask({
        projectId: project.id,
        taskId: t.id,
        data: { status: 'in_progress', assigneeId: me.id },
      }),
    ).toEqual({ message: 'Task updated' })
    expect(await task(t.id)).toMatchObject({ assigneeId: me.id, status: 'in_progress' })
    expect(
      await prisma.workItemInterest.findFirst({
        where: { workItemId: project.id, volunteerId: me.id },
      }),
    ).toMatchObject({ status: 'accepted', message: `${me.name} has claimed '${t.title}' task` })
    // Rival cannot claim an already-claimed task (status is no longer open → not a self-claim).
    await expect(
      clientAs(rival).projects.updateTask({
        projectId: project.id,
        taskId: t.id,
        data: { status: 'in_progress', assigneeId: rival.id },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // Marking done is allowed for the task assignee only.
    await expect(
      clientAs(rival).projects.updateTask({
        projectId: project.id,
        taskId: t.id,
        data: { status: 'completed' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await c.projects.updateTask({
      projectId: project.id,
      taskId: t.id,
      data: { status: 'completed' },
    })
    expect((await task(t.id)).status).toBe('completed')

    // A second self-claim on another task reuses the existing interest row.
    const t2 = await createTask(project.id)
    await c.projects.updateTask({
      projectId: project.id,
      taskId: t2.id,
      data: { status: 'in_progress', assigneeId: me.id },
    })
    expect(
      await prisma.workItemInterest.count({
        where: { workItemId: project.id, volunteerId: me.id },
      }),
    ).toBe(1)

    // Declined volunteers cannot claim; team outsiders cannot reach the project.
    await prisma.workItemInterest.update({
      where: { volunteerId_workItemId: { volunteerId: me.id, workItemId: project.id } },
      data: { status: 'declined' },
    })
    const t3 = await createTask(project.id)
    await expect(
      c.projects.updateTask({
        projectId: project.id,
        taskId: t3.id,
        data: { status: 'in_progress', assigneeId: me.id },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('no longer contributing') })
    const team = await createTeam()
    const teamP = await createProject({
      teamId: team.id,
      status: 'in_progress',
      assigneeId: owner.id,
    })
    const tt = await createTask(teamP.id)
    await expect(
      clientAs(rival).projects.updateTask({
        projectId: teamP.id,
        taskId: tt.id,
        data: { status: 'in_progress', assigneeId: rival.id },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // Claim race: the guarded update finds the task already taken.
    const t4 = await createTask(project.id)
    const spy = vi.spyOn(prisma.workItem, 'updateMany').mockResolvedValueOnce({ count: 0 })
    await expect(
      clientAs(rival).projects.updateTask({
        projectId: project.id,
        taskId: t4.id,
        data: { status: 'in_progress', assigneeId: rival.id },
      }),
    ).rejects.toMatchObject({ message: 'This task has already been claimed' })
    spy.mockRestore()

    // The creator of a draft may edit its tasks.
    const draft = await createProject({ status: 'draft', creatorId: me.id })
    const dt = await createTask(draft.id)
    await c.projects.updateTask({ projectId: draft.id, taskId: dt.id, data: { title: 'edited' } })
    expect((await task(dt.id)).title).toBe('edited')
  })
})

describe('projects.assignTask', () => {
  it('assigns an approved volunteer to an unfinished task and notifies them', async () => {
    const owner = await createVolunteer()
    const other = await createVolunteer()
    const vol = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const t = await createTask(project.id)
    const c = clientAs(owner)
    await expect(
      c.projects.assignTask({ projectId: project.id, taskId: 999_999, assigneeId: vol.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      clientAs(other).projects.assignTask({
        projectId: project.id,
        taskId: t.id,
        assigneeId: vol.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.projects.assignTask({ projectId: project.id, taskId: t.id, assigneeId: 999_999 }),
    ).rejects.toMatchObject({ message: 'Volunteer not found' })
    const pending = await createVolunteer({ approvalStatus: 'pending' })
    await expect(
      c.projects.assignTask({ projectId: project.id, taskId: t.id, assigneeId: pending.id }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not yet approved') })
    expect(
      await c.projects.assignTask({ projectId: project.id, taskId: t.id, assigneeId: vol.id }),
    ).toEqual({ message: 'Task assigned' })
    const first = await task(t.id)
    expect(first).toMatchObject({ assigneeId: vol.id, status: 'in_progress' })
    await vi.waitFor(async () =>
      expect(
        await prisma.notification.count({ where: { volunteerId: vol.id, type: 'task_assigned' } }),
      ).toBe(1),
    )
    await c.projects.assignTask({ projectId: project.id, taskId: t.id, assigneeId: other.id })
    expect((await task(t.id)).startedAt).toEqual(first.startedAt)
    await prisma.workItem.update({ where: { id: t.id }, data: { status: 'completed' } })
    await expect(
      c.projects.assignTask({ projectId: project.id, taskId: t.id, assigneeId: vol.id }),
    ).rejects.toMatchObject({ message: 'Cannot assign a completed task' })
  })
})
