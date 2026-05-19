import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '@/server/router'
import { BASE_URL } from './data'

export function createDemoApiClient(token?: string | null): RouterClient<typeof appRouter> {
  const link = new RPCLink({
    url: `${BASE_URL}/api/rpc`,
    headers: () => (token ? { Authorization: `Bearer ${token}` } : {}),
  })
  return createORPCClient<RouterClient<typeof appRouter>>(link)
}
