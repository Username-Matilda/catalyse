import { RPCHandler } from '@orpc/server/fetch'
import { createContext } from '@/server/context'
import { appRouter } from '@/server/router'

const handler = new RPCHandler(appRouter)

async function handle(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/api',
    context: await createContext(request),
  })
  return response ?? new Response('Not found', { status: 404 })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
