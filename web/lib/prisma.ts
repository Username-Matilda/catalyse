import { PrismaClient } from '@/app/generated/prisma/client'
import { resolveDbUrl } from '@/lib/db-url'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: resolveDbUrl() })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
