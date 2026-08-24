import { test, expect } from '../fixtures'
import { createApiClient } from '../client'

test.describe('Sessions (API)', () => {
  test('Logging out other sessions kills every other token but keeps the caller signed in', async ({
    volunteer,
    baseUrl,
  }) => {
    const anonApi = createApiClient(baseUrl)

    const loginA = await anonApi.auth.login({
      body: { email: volunteer.email, password: volunteer.password },
    })
    expect(loginA.status).toBe(200)
    const tokenA = (loginA.body as { token: string }).token

    const loginB = await anonApi.auth.login({
      body: { email: volunteer.email, password: volunteer.password },
    })
    expect(loginB.status).toBe(200)
    const tokenB = (loginB.body as { token: string }).token

    // Both sessions independently authenticated before either is touched.
    const apiA = createApiClient(baseUrl, tokenA)
    const apiB = createApiClient(baseUrl, tokenB)
    expect((await apiA.auth.me()).status).toBe(200)
    expect((await apiB.auth.me()).status).toBe(200)

    const result = await apiA.auth.logoutOtherSessions()
    expect(result.status).toBe(200)

    // The session that made the call survives...
    expect((await apiA.auth.me()).status).toBe(200)
    // ...but every other session for that volunteer is gone.
    expect((await apiB.auth.me()).status).toBe(401)

    // A new login afterwards is unaffected.
    const loginC = await anonApi.auth.login({
      body: { email: volunteer.email, password: volunteer.password },
    })
    expect(loginC.status).toBe(200)
    const tokenC = (loginC.body as { token: string }).token
    const apiC = createApiClient(baseUrl, tokenC)
    expect((await apiC.auth.me()).status).toBe(200)
  })

  test('logoutOtherSessions requires authentication', async ({ baseUrl }) => {
    const anonApi = createApiClient(baseUrl)
    const result = await anonApi.auth.logoutOtherSessions()
    expect(result.status).toBe(401)
  })
})
