import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto'
import {
  JwksGoogleVerifier,
  googleVerifier,
  setGoogleVerifier,
  verifyGoogleToken,
} from './google-auth'
import { google } from '@/test/fakes/google'

let privateKey: KeyObject
let jwk: Record<string, unknown>

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  privateKey = pair.privateKey
  jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'RS256' }
})

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function token(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const h = b64({ alg: 'RS256', kid: 'kid-1', ...header })
  const p = b64(claims)
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')
  return `${h}.${p}.${sig}`
}

const now = () => Math.floor(Date.now() / 1000)
const good = () => ({
  iss: 'https://accounts.google.com',
  aud: 'client-id',
  exp: now() + 600,
  iat: now(),
  email: 'ann@example.com',
  email_verified: true,
  name: 'Ann',
})

function mockJwks(keys: unknown[] = [jwk], headers: Record<string, string> = {}, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ keys }),
    headers: new Headers(headers),
  } as Response)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** A fresh verifier (so an empty JWKS cache) under the given client id. */
function load(clientId = 'client-id') {
  vi.stubEnv('GOOGLE_CLIENT_ID', clientId)
  const verifier = new JwksGoogleVerifier()
  return (credential: string) => verifier.verify(credential)
}

describe('verifyGoogleToken', () => {
  it('goes through the process-wide verifier, which is built on first use and swappable', async () => {
    google.accept('cred', { email: 'a@b.c', name: 'A' })
    expect(await verifyGoogleToken('cred')).toEqual({ email: 'a@b.c', name: 'A' })
    expect(setGoogleVerifier(undefined)).toBe(google)
    const real = googleVerifier()
    expect(real).toBeInstanceOf(JwksGoogleVerifier)
    expect(googleVerifier()).toBe(real)
    expect(setGoogleVerifier(google)).toBe(real)
  })

  it('rejects without a client id or credential', async () => {
    expect(await load('')(token(good()))).toBeNull()
    expect(await load()('')).toBeNull()
  })

  it('accepts a valid token and caches the JWKS for the cache-control max-age', async () => {
    const fetchMock = mockJwks([jwk], { 'cache-control': 'public, max-age=3600' })
    const verify = load()
    expect(await verify(token(good()))).toEqual({ email: 'ann@example.com', name: 'Ann' })
    expect(await verify(token({ ...good(), name: undefined }))).toEqual({
      email: 'ann@example.com',
      name: 'ann',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The string form of email_verified is also accepted, as is the bare issuer.
    expect(
      await verify(token({ ...good(), email_verified: 'true', iss: 'accounts.google.com' })),
    ).not.toBeNull()
  })

  it('uses the default TTL without a max-age header', async () => {
    const fetchMock = mockJwks()
    const verify = load()
    expect(await verify(token(good()))).not.toBeNull()
    expect(await verify(token(good()))).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails closed on JWKS fetch problems', async () => {
    mockJwks([], {}, false)
    expect(await load()(token(good()))).toBeNull()
    vi.restoreAllMocks()
    mockJwks([])
    expect(await load()(token(good()))).toBeNull()
  })

  it('rejects malformed, wrongly signed, or unknown-key tokens', async () => {
    mockJwks()
    const verify = load()
    expect(await verify('a.b')).toBeNull()
    expect(await verify('a.b.c.d')).toBeNull()
    expect(await verify('not-json.x.y')).toBeNull()
    expect(await verify(token(good(), { alg: 'HS256' }))).toBeNull()
    expect(await verify(token(good(), { kid: 'unknown' }))).toBeNull()
    const [h, p] = token(good()).split('.')
    expect(await verify(`${h}.${p}.${Buffer.from('bad').toString('base64url')}`)).toBeNull()
  })

  it('rejects bad claims', async () => {
    mockJwks()
    const verify = load()
    expect(await verify(token({ ...good(), iss: 'https://evil' }))).toBeNull()
    expect(await verify(token({ ...good(), iss: undefined }))).toBeNull()
    expect(await verify(token({ ...good(), aud: 'other' }))).toBeNull()
    expect(await verify(token({ ...good(), exp: now() - 1000 }))).toBeNull()
    expect(await verify(token({ ...good(), exp: 'soon' }))).toBeNull()
    expect(await verify(token({ ...good(), iat: now() + 1000 }))).toBeNull()
    expect(await verify(token({ ...good(), email_verified: false }))).toBeNull()
    expect(await verify(token({ ...good(), email: undefined }))).toBeNull()
  })
})
