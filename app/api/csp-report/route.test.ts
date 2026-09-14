import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const rateLimit = vi.hoisted(() => ({ allowed: true }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/rate-limit')>()
  return {
    ...original,
    checkRateLimit: () =>
      rateLimit.allowed
        ? { allowed: true, retryAfterMs: 0 }
        : { allowed: false, retryAfterMs: 1500 },
  }
})

const post = (body: string | null, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report', ...headers },
    body,
  })

const count = async () =>
  (await prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } })).cspViolationCount

describe('POST /api/csp-report', () => {
  it('counts each report whatever its shape, and logs the violation', async () => {
    const { POST } = await import('./route')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = await count()

    const legacy = await POST(post(JSON.stringify({ 'csp-report': { 'blocked-uri': 'evil' } })))
    expect(legacy.status).toBe(204)
    expect(error).toHaveBeenLastCalledWith('[CSP VIOLATION]', '{"blocked-uri":"evil"}')

    await POST(post(JSON.stringify([{ body: { blockedURL: 'evil2' } }])))
    expect(error).toHaveBeenLastCalledWith('[CSP VIOLATION]', '{"blockedURL":"evil2"}')

    await POST(post(JSON.stringify({ loose: true })))
    expect(error).toHaveBeenLastCalledWith('[CSP VIOLATION]', '{"loose":true}')

    await POST(post('not json'))
    expect(error).toHaveBeenLastCalledWith('[CSP VIOLATION]', '{}')

    expect(await count()).toBe(before + 4)
    error.mockRestore()
  })

  it('rejects oversized bodies and rate-limited callers, and survives a failed count', async () => {
    const { POST } = await import('./route')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = await count()

    expect((await POST(post('{}', { 'content-length': '9000' }))).status).toBe(413)

    rateLimit.allowed = false
    const limited = await POST(post('{}'))
    expect(limited.status).toBe(429)
    rateLimit.allowed = true

    vi.spyOn(prisma.platformSettings, 'update').mockRejectedValueOnce(new Error('db down'))
    expect((await POST(post('{}'))).status).toBe(204)
    expect(error).toHaveBeenLastCalledWith(
      '[CSP VIOLATION] Failed to record count:',
      expect.any(Error),
    )

    expect(await count()).toBe(before)
    error.mockRestore()
  })
})
