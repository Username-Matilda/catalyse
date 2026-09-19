import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { isMaintenanceMode, canBypassMaintenance } from './maintenance'

describe('maintenance', () => {
  it('reads the platform settings flag, treating a missing row as off', async () => {
    expect(await isMaintenanceMode()).toBe(false)
    await prisma.platformSettings.update({ where: { id: 1 }, data: { maintenanceMode: true } })
    expect(await isMaintenanceMode()).toBe(true)
    await prisma.platformSettings.delete({ where: { id: 1 } })
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('only super admins with a confirmed address bypass', () => {
    expect(canBypassMaintenance(null)).toBe(false)
    expect(canBypassMaintenance({ email: 'someone@example.com', emailConfirmed: true })).toBe(false)
    expect(canBypassMaintenance({ email: 'admin@example.com', emailConfirmed: false })).toBe(false)
    expect(canBypassMaintenance({ email: 'admin@example.com', emailConfirmed: true })).toBe(true)
  })
})
