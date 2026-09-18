import { isMaintenanceMode } from '@/lib/maintenance'
import { publicProcedure } from '../procedures'

export const maintenanceRouter = {
  status: publicProcedure.handler(async () => ({ active: await isMaintenanceMode() })),
}
