import { runBackup } from '@/lib/backup'

export async function runBackupJob() {
  const result = await runBackup()
  console.log(`[CRON BACKUP] local=${result.local} b2=${result.b2}`)
  return result
}
