import { PrismaClient } from '@/app/generated/prisma/client'
import path from 'node:path'

const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
const datasourceUrl = mountPath
  ? `file:${path.join(mountPath, 'catalyse.db')}`
  : undefined // falls back to DATABASE_URL from environment

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
