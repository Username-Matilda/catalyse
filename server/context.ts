import { getCurrentVolunteer } from '@/lib/auth'

export async function createContext(request: Request) {
  const authorization = request.headers.get('authorization')
  const volunteer = await getCurrentVolunteer(authorization)
  return { volunteer }
}

export type Context = Awaited<ReturnType<typeof createContext>>
