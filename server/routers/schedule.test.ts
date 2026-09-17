import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createVolunteer,
  createAdmin,
  createProject,
  createTask,
  createQuickTask,
} from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('schedule.rescheduleItems', () => {
  it('writes start/duration for tasks and projects the caller manages', async () => {
    const owner = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id })
    const task = await createTask(project.id, { durationDays: 2 })
    const result = await clientAs(owner).schedule.rescheduleItems({
      items: [
        { id: task.id, startDate: new Date('2026-06-01T00:00:00Z'), durationDays: 5 },
        { id: project.id, startDate: null },
      ],
    })
    expect(result).toEqual({ count: 2 })
    const after = await prisma.workItem.findUniqueOrThrow({ where: { id: task.id } })
    expect(after).toMatchObject({ startDate: new Date('2026-06-01T00:00:00Z'), durationDays: 5 })
    expect(after.scheduleUpdatedAt).not.toBeNull()
  })

  it('rejects unknown ids, quick tasks, and projects the caller cannot manage', async () => {
    const owner = await createVolunteer()
    const other = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id })
    const task = await createTask(project.id)
    const qt = await createQuickTask()
    const c = clientAs(other)
    await expect(
      c.schedule.rescheduleItems({ items: [{ id: 999_999, startDate: null }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      c.schedule.rescheduleItems({ items: [{ id: qt.id, startDate: null }] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      c.schedule.rescheduleItems({ items: [{ id: task.id, startDate: null }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // An admin can reschedule anything.
    expect(
      await clientAs(await createAdmin()).schedule.rescheduleItems({
        items: [{ id: task.id, startDate: null }],
      }),
    ).toEqual({ count: 1 })
  })
})
