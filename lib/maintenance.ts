import { prisma } from './prisma'
import { isSuperAdmin, type EmailIdentity } from './auth'

// Toggled by a super admin on the platform settings page. Consulted on every RPC, so a
// missing settings row means "open" rather than a crash.
export async function isMaintenanceMode(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: 1 },
    select: { maintenanceMode: true },
  })
  return settings?.maintenanceMode ?? false
}

export function canBypassMaintenance(volunteer: EmailIdentity | null): boolean {
  return isSuperAdmin(volunteer)
}
