import { describe, it, expect } from 'vitest'
import { createVolunteer } from '@/test/factories'
import { createSession } from '@/lib/auth'
import { createContext } from './context'

describe('createContext', () => {
  it('resolves the volunteer and raw token from the Authorization header', async () => {
    const vol = await createVolunteer()
    const token = await createSession(vol.id)
    const req = new Request('http://localhost/api/rpc', {
      headers: { authorization: `Bearer ${token}` },
    })
    const ctx = await createContext(req)
    expect(ctx.volunteer?.id).toBe(vol.id)
    expect(ctx.token).toBe(token)
    expect(ctx.request).toBe(req)
    const anon = await createContext(new Request('http://localhost/api/rpc'))
    expect(anon).toMatchObject({ volunteer: null, token: null })
  })
})
