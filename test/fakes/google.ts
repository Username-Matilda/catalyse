import { GoogleTokenVerifier, type GoogleAccount } from '@/lib/google-auth'

/**
 * Accepts only the credentials a test has registered with `accept`, so "signing in with
 * Google" is a string the test chooses. `test/setup-db.ts` installs one per test file and
 * forgets every credential before each test.
 */
export class FakeGoogleVerifier extends GoogleTokenVerifier {
  private readonly accounts = new Map<string, GoogleAccount>()

  async verify(credential: string): Promise<GoogleAccount | null> {
    return this.accounts.get(credential) ?? null
  }

  /** Makes `credential` verify as `account` for the rest of the test. */
  accept(credential: string, account: GoogleAccount): void {
    this.accounts.set(credential, account)
  }

  reset(): void {
    this.accounts.clear()
  }
}

export const google = new FakeGoogleVerifier()
