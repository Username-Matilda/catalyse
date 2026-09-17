import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('resolveDbUrl', () => {
  it('uses the Railway volume in production', async () => {
    vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', '/data')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    const { resolveDbUrl, resolveDbPath } = await import('./db-url')
    expect(resolveDbUrl()).toBe('file:/data/catalyse.db')
    expect(resolveDbPath()).toBe('/data/catalyse.db')
  })

  it('resolves a relative file URL against cwd and passes others through', async () => {
    vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', '')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', '')
    vi.stubEnv('DATABASE_URL', 'file:./x.db')
    const { resolveDbUrl, resolveDbPath } = await import('./db-url')
    expect(resolveDbUrl()).toBe(`file:${path.resolve(process.cwd(), 'x.db')}`)
    vi.stubEnv('DATABASE_URL', 'postgres://host/db')
    expect(resolveDbUrl()).toBe('postgres://host/db')
    expect(resolveDbPath()).toBeNull()
    vi.stubEnv('DATABASE_URL', 'file:/abs.db')
    expect(resolveDbUrl()).toBe('file:/abs.db')
  })

  it('falls back to the default when DATABASE_URL is unset', async () => {
    vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', '')
    delete process.env.DATABASE_URL
    const origCwd = process.cwd()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dburl-'))
    process.chdir(dir)
    try {
      const { resolveDbUrl } = await import('./db-url')
      expect(resolveDbUrl()).toBe(`file:${path.resolve(process.cwd(), 'db/catalyse.db')}`)
      expect(resolveDbUrl('file:/other.db')).toBe('file:/other.db')
    } finally {
      process.chdir(origCwd)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('.env loading', () => {
  let dir: string
  const origCwd = process.cwd()
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dburl-'))
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.DBURL_TEST_A
    delete process.env.DBURL_TEST_B
    delete process.env.DBURL_TEST_C
  })

  it('reads .env then .env.local without overriding existing values', async () => {
    fs.writeFileSync('.env', '# comment\n\nDBURL_TEST_A="a"\nDBURL_TEST_B=b\nnot-a-pair\n')
    fs.writeFileSync('.env.local', "DBURL_TEST_B='local'\nDBURL_TEST_C=c\n")
    process.env.DBURL_TEST_C = 'shell'
    await import('./db-url')
    expect(process.env.DBURL_TEST_A).toBe('a')
    expect(process.env.DBURL_TEST_B).toBe('b')
    expect(process.env.DBURL_TEST_C).toBe('shell')
  })
})
