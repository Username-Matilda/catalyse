import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '@/server/router'

type ApiResponse<T = unknown> = { status: number; body: T }

function wrapClient(orpcVal: unknown): unknown {
  return new Proxy(function () {} as object, {
    get(_, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
      return wrapClient((orpcVal as Record<string | symbol, unknown>)[prop])
    },
    apply(_, __, args) {
      const arg = args[0] as
        | { body?: Record<string, unknown>; params?: Record<string, unknown> }
        | undefined
      let input: unknown
      if (arg === undefined || arg === null) {
        input = undefined
      } else if (typeof arg === 'object' && ('body' in arg || 'params' in arg)) {
        const merged = { ...(arg.params ?? {}), ...(arg.body ?? {}) }
        input = merged
      } else {
        input = arg
      }
      return (orpcVal as (...a: unknown[]) => Promise<unknown>)(input)
        .then((result): ApiResponse => ({ status: 200, body: result }))
        .catch((err: unknown): ApiResponse => {
          if (err && typeof err === 'object' && 'status' in err) {
            const { status, message } = err as { status: number; message?: string }
            return { status, body: { message: message ?? 'Error' } }
          }
          throw err
        })
    },
  })
}

export function createApiClient(
  baseUrl: string,
  token?: string | null,
): RouterClient<typeof appRouter> {
  const link = new RPCLink({
    url: `${baseUrl}/api/rpc`,
    headers: () => (token ? { Authorization: `Bearer ${token}` } : {}),
  })
  const orpcClient = createORPCClient<RouterClient<typeof appRouter>>(link)
  return wrapClient(orpcClient) as RouterClient<typeof appRouter>
}
