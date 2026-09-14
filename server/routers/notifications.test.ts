import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin } from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('notifications', () => {
  it('lists with filters and paging, hiding admin-only types from admins', async () => {
    const vol = await createVolunteer()
    await prisma.notification.createMany({
      data: [
        { volunteerId: vol.id, type: 'a', title: '1' },
        { volunteerId: vol.id, type: 'b', title: '2', readAt: new Date() },
        { volunteerId: vol.id, type: 'new_bug_report', title: '3' },
      ],
    })
    const c = clientAs(vol)
    expect((await c.notifications.list({})).total).toBe(3)
    expect((await c.notifications.list({ filter: 'unread' })).total).toBe(2)
    expect(
      (await c.notifications.list({ filter: 'read' })).notifications.map((n) => n.title),
    ).toEqual(['2'])
    expect((await c.notifications.list({ limit: 1, offset: 1 })).notifications).toHaveLength(1)

    const admin = await createAdmin()
    await prisma.notification.createMany({
      data: [
        { volunteerId: admin.id, type: 'a', title: 'mine' },
        { volunteerId: admin.id, type: 'new_bug_report', title: 'admin-only' },
      ],
    })
    const ac = clientAs(admin)
    expect((await ac.notifications.list({})).notifications.map((n) => n.title)).toEqual(['mine'])
    await ac.notifications.readAll()
    const unread = await prisma.notification.findMany({
      where: { volunteerId: admin.id, readAt: null },
    })
    expect(unread.map((n) => n.title)).toEqual(['admin-only'])
  })

  it('marks one read/unread only for the owner, and readAll for a volunteer', async () => {
    const vol = await createVolunteer()
    const other = await createVolunteer()
    const n = await prisma.notification.create({
      data: { volunteerId: vol.id, type: 'a', title: '1' },
    })
    const c = clientAs(vol)
    expect(await c.notifications.markRead({ id: n.id })).toEqual({ message: 'Marked as read' })
    expect(await c.notifications.markUnread({ id: n.id })).toEqual({ message: 'Marked as unread' })
    await expect(clientAs(other).notifications.markRead({ id: n.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(clientAs(other).notifications.markUnread({ id: n.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await c.notifications.readAll()).toEqual({ message: 'All marked as read' })
    expect((await c.notifications.list({ filter: 'unread' })).total).toBe(0)
  })
})
