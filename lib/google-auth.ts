import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto'
import { env } from './env'

// Google ID tokens are verified locally: fetch Google's public keys, check the RS256
// signature ourselves, then check the claims. The previous implementation POSTed the
// credential to the deprecated /tokeninfo endpoint and trusted the JSON it got back,
// which meant a network-level failure mode decided who was signed in, and `iss` was
// never checked at all.

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000
// Tolerance for clock skew between Google and this server, in seconds.
const CLOCK_SKEW_S = 300

type Jwk = { kid?: string; kty: string; alg?: string; n: string; e: string }

let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null

async function googleSigningKeys(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys

  const res = await fetch(GOOGLE_JWKS_URL)
  if (!res.ok) throw new Error(`Google JWKS fetch failed: ${res.status}`)
  const { keys } = (await res.json()) as { keys?: Jwk[] }
  if (!keys?.length) throw new Error('Google JWKS response contained no keys')

  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')
  const ttl = maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_JWKS_TTL_MS
  jwksCache = { keys, expiresAt: Date.now() + ttl }
  return keys
}

type IdTokenClaims = {
  iss?: string
  aud?: string
  exp?: number
  iat?: number
  email?: string
  email_verified?: boolean | string
  name?: string
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

/**
 * Returns the verified account, or null if the credential is missing, malformed,
 * expired, signed by an unknown key, or issued for a different client.
 */
export async function verifyGoogleToken(
  credential: string,
): Promise<{ email: string; name: string } | null> {
  const clientId = env.GOOGLE_CLIENT_ID
  if (!clientId || !credential) return null

  try {
    const [headerB64, payloadB64, signatureB64, ...rest] = credential.split('.')
    if (!headerB64 || !payloadB64 || !signatureB64 || rest.length > 0) return null

    const header = decodeSegment(headerB64) as { alg?: string; kid?: string }
    if (header.alg !== 'RS256' || !header.kid) return null

    const jwk = (await googleSigningKeys()).find((k) => k.kid === header.kid)
    if (!jwk) return null

    const signatureValid = createVerify('RSA-SHA256')
      .update(`${headerB64}.${payloadB64}`)
      .verify(
        createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' }),
        Buffer.from(signatureB64, 'base64url'),
      )
    if (!signatureValid) return null

    const claims = decodeSegment(payloadB64) as IdTokenClaims
    if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) return null
    if (claims.aud !== clientId) return null

    const now = Math.floor(Date.now() / 1000)
    if (typeof claims.exp !== 'number' || claims.exp <= now - CLOCK_SKEW_S) return null
    if (typeof claims.iat === 'number' && claims.iat > now + CLOCK_SKEW_S) return null

    // Google sends this as a boolean in the ID token; older docs show the string form.
    if (claims.email_verified !== true && claims.email_verified !== 'true') return null
    if (!claims.email) return null

    return { email: claims.email, name: claims.name || claims.email.split('@')[0] }
  } catch {
    return null
  }
}
