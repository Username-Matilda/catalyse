import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '@/server/router'

const link = new RPCLink({
  url:
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/rpc`
      : 'http://localhost/api/rpc',
  headers: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        if (
          error instanceof ORPCError &&
          error.code === 'UNAUTHORIZED' &&
          typeof window !== 'undefined'
        ) {
          window.dispatchEvent(new Event('auth:expired'))
        }
        throw error
      }
    },
  ],
})

export const client = createORPCClient<RouterClient<typeof appRouter>>(link)
