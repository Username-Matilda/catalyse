import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { AppRouter } from '@/server/router'

const link = new RPCLink({
  url: '/api',
  headers: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
})

export const client = createORPCClient<AppRouter>(link)
