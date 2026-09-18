import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('resolveDbUrl', () => {
  it('returns DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://host/db')
    const { resolveDbUrl } = await import('./db-url')
    expect(resolveDbUrl()).toBe('postgres://host/db')
  })

  it('throws when DATABASE_URL is empty', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { resolveDbUrl } = await import('./db-url')
    expect(() => resolveDbUrl()).toThrow('DATABASE_URL is not set')
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

  it('tolerates a missing .env file', async () => {
    fs.writeFileSync('.env', 'DBURL_TEST_A=a\n')
    await import('./db-url')
    expect(process.env.DBURL_TEST_A).toBe('a')
    expect(process.env.DBURL_TEST_B).toBeUndefined()
  })
})
