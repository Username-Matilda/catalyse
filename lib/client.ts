import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '@/server/router'
import { OUTREACH_TOKEN_HEADER, OUTREACH_TOKEN_STORAGE_KEY } from '@/lib/journalist-outreach'

const link = new RPCLink({
  url:
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/rpc`
      : 'http://localhost/api/rpc',
  headers: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    const outreachToken =
      typeof window !== 'undefined' ? localStorage.getItem(OUTREACH_TOKEN_STORAGE_KEY) : null
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(outreachToken ? { [OUTREACH_TOKEN_HEADER]: outreachToken } : {}),
    }
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
