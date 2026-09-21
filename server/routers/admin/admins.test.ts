import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createAdmin, createSuperAdmin } from '@/test/factories'
import { clientAs } from '@/test/rpc'

describe('admin.admins', () => {
  it('lists admins and toggles the technical flag', async () => {
    const sa = await createSuperAdmin()
    const admin = await createAdmin({ name: 'Zed' })
    await createAdmin({ deletedAt: new Date() })
    const c = clientAs(sa)
    const list = await c.admin.admins.list()
    expect(list.map((a) => a.id)).toEqual(expect.arrayContaining([sa.id, admin.id]))
    expect(list.map((a) => a.name)).toEqual([...list.map((a) => a.name)].sort())
    expect(list.find((a) => a.id === admin.id)?.isTechnicalAdmin).toBe(false)
    expect(
      await c.admin.admins.setTechnicalAdmin({ id: admin.id, isTechnicalAdmin: true }),
    ).toEqual({
      message: 'Zed will now be notified of bug reports',
    })
    expect(
      await c.admin.admins.setTechnicalAdmin({ id: admin.id, isTechnicalAdmin: false }),
    ).toEqual({
      message: 'Zed will no longer be notified of bug reports',
    })
    await expect(
      c.admin.admins.setTechnicalAdmin({ id: 999_999, isTechnicalAdmin: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('revokes another admin but never yourself', async () => {
    const sa = await createSuperAdmin()
    const admin = await createAdmin({ name: 'Ann' })
    const c = clientAs(sa)
    await expect(c.admin.admins.revoke({ id: sa.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(c.admin.admins.revoke({ id: 999_999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await c.admin.admins.revoke({ id: admin.id })).toEqual({
      message: 'Admin access revoked for Ann',
    })
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: admin.id } })).isAdmin).toBe(
      false,
    )
  })

  it('invites, lists, revokes and accepts invites', async () => {
    const sa = await createSuperAdmin()
    const c = clientAs(sa)
    const existingAdmin = await createAdmin()
    await expect(c.admin.admins.invite({ email: existingAdmin.email! })).rejects.toMatchObject({
      message: 'This person is already an admin',
    })

    const result = await c.admin.admins.invite({ email: 'New@Example.com' })
    expect(result.message).toBe('Invite sent for new@example.com')
    expect(result._dev_invite_url).toContain('/accept-invite?token=')
    await expect(c.admin.admins.invite({ email: 'new@example.com' })).rejects.toMatchObject({
      message: 'An invite is already pending for this email',
    })

    const invites = await c.admin.admins.listInvites()
    expect(invites[0]).toMatchObject({
      email: 'new@example.com',
      status: 'pending',
      invitedByName: sa.name,
    })
    expect(invites[0]).not.toHaveProperty('inviteToken')

    const token = result._dev_invite_token as string
    const wrongPerson = await createVolunteer()
    await expect(
      clientAs(wrongPerson).admin.admins.acceptInvite({ inviteToken: token }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      clientAs(wrongPerson).admin.admins.acceptInvite({ inviteToken: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // A forwarded link is not enough: the account must have proven the invited address.
    const invitee = await createVolunteer({ email: 'New@example.com', emailConfirmed: false })
    await expect(
      clientAs(invitee).admin.admins.acceptInvite({ inviteToken: token }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining('Confirm') })
    const proven = await prisma.volunteer.update({
      where: { id: invitee.id },
      data: { emailConfirmed: true },
    })
    expect(await clientAs(proven).admin.admins.acceptInvite({ inviteToken: token })).toEqual({
      message: 'You are now an admin!',
    })
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: invitee.id } })).isAdmin).toBe(
      true,
    )
    await expect(
      clientAs(invitee).admin.admins.acceptInvite({ inviteToken: token }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'This invite has already been used.' })

    const second = await c.admin.admins.invite({ email: 'second@example.com' })
    const id = (await c.admin.admins.listInvites()).find(
      (i) => i.email === 'second@example.com',
    )!.id
    expect(await c.admin.admins.revokeInvite({ id })).toEqual({ message: 'Invite revoked' })
    await expect(c.admin.admins.revokeInvite({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    void second
  })
})
