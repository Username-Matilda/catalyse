import { QueryClient } from '@tanstack/react-query'
import { ORPCError } from '@orpc/client'

/**
 * Whether a failed query is worth another attempt. A client error (a missing row, a forbidden
 * page, bad input) will fail the same way every time, so the page shows its error state at
 * once instead of after the default three retries with backoff.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ORPCError && error.status >= 400 && error.status < 500) return false
  return failureCount < 3
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
})
