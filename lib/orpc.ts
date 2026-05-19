import { createORPCReactQueryUtils } from '@orpc/react-query'
import { client } from './client'

// Widen ThrowableError from Error to unknown so mutationOptions() spreads
// cleanly into useMutation without throwOnError callback type conflicts.
declare module '@orpc/shared' {
  interface Registry {
    throwableError: unknown
  }
}

export const orpc = createORPCReactQueryUtils(client)
