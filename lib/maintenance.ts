import { prisma } from './prisma'
import { isSuperAdmin } from './auth'

export const MAINTENANCE_MESSAGE = 'Catalyse is down for maintenance. Please check back soon.'

// Toggled by a super admin on the platform settings page. Consulted on every RPC, so a
// missing settings row means "open" rather than a crash.
export async function isMaintenanceMode(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: 1 },
    select: { maintenanceMode: true },
  })
  return settings?.maintenanceMode ?? false
}

export function canBypassMaintenance(volunteer: { email: string | null } | null): boolean {
  return isSuperAdmin(volunteer?.email)
}
