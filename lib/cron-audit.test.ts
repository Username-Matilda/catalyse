import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { recordCronRun } from './cron-audit'

describe('recordCronRun', () => {
  it('records a successful run with a JSON summary, defaulting to the cron trigger', async () => {
    const result = await recordCronRun('digest', async () => ({ sent: 3 }))
    expect(result).toEqual({ sent: 3 })
    const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
    expect(run).toMatchObject({
      jobName: 'digest',
      status: 'success',
      triggeredBy: 'cron',
      summary: '{"sent":3}',
    })
    expect(run.finishedAt).not.toBeNull()
  })

  it('records an admin-triggered run whose result cannot be JSON-serialised', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await recordCronRun('backup', async () => circular, 'admin')
    const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
    expect(run).toMatchObject({ triggeredBy: 'admin', summary: '[object Object]' })
  })

  it('stringifies an undefined result', async () => {
    await recordCronRun('nudges', async () => undefined)
    const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
    expect(run.summary).toBe('undefined')
  })

  it('records the error message and rethrows when the job fails', async () => {
    await expect(
      recordCronRun('nudges', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
    expect(run).toMatchObject({ status: 'error', summary: 'boom' })
  })

  it('stringifies non-Error failures', async () => {
    await expect(
      recordCronRun('nudges', async () => {
        throw 'string failure'
      }),
    ).rejects.toBe('string failure')
    const run = await prisma.cronJobRun.findFirstOrThrow({ orderBy: { id: 'desc' } })
    expect(run.summary).toBe('string failure')
  })
})
