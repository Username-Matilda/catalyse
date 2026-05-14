import { execSync } from 'child_process'
import { resolveDbUrl } from '../lib/db-url'

process.env.DATABASE_URL = resolveDbUrl()
execSync('npx prisma migrate deploy', { stdio: 'inherit' })
