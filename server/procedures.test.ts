import { describe, it, expect } from 'vitest'
import { createVolunteer, createAdmin, createSuperAdmin } from '@/test/factories'
import { clientAs, anon } from '@/test/rpc'

/**
 * The four procedure tiers, exercised through one representative procedure each. The
 * per-router tests then only need to cover their own logic, not the gate.
 */
describe('procedure gates', () => {
  it('authedProcedure needs a session', async () => {
    await expect(anon().my.quickTasks()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const vol = await createVolunteer({ approvalStatus: 'pending' })
    expect(await clientAs(vol).my.quickTasks()).toEqual([])
  })

  it('approvedProcedure additionally needs approval, unless admin', async () => {
    await expect(anon().localGroups.getById({ id: 1 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    const pending = await createVolunteer({ approvalStatus: 'pending' })
    await expect(clientAs(pending).localGroups.getById({ id: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Your account is pending approval',
    })
    const pendingAdmin = await createAdmin({ approvalStatus: 'pending' })
    expect(await clientAs(pendingAdmin).localGroups.getById({ id: 1 })).toMatchObject({ id: 1 })
  })

  it('adminProcedure needs the admin flag', async () => {
    await expect(anon().admin.overview.counts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(clientAs(await createVolunteer()).admin.overview.counts()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await clientAs(await createAdmin()).admin.overview.counts()).toMatchObject({
      pendingTriage: 0,
    })
  })

  it('superAdminProcedure needs an email listed in ADMIN_EMAILS', async () => {
    await expect(anon().admin.platformSettings.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      clientAs(await createVolunteer()).admin.platformSettings.get(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(clientAs(await createAdmin()).admin.platformSettings.get()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const sa = await createSuperAdmin()
    expect(await clientAs(sa).admin.platformSettings.get()).toEqual({
      requireApplicationApproval: true,
    })
  })
})
