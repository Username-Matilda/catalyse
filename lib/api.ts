export class ApiError extends Error {
  fieldErrors?: Record<string, string>
  constructor(
    public status: number,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.fieldErrors = fieldErrors
  }
}

export async function apiRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`
    let fieldErrors: Record<string, string> | undefined
    try {
      const body = await res.json()
      if (typeof body?.error === 'string') {
        message = body.error
      } else if (typeof body?.detail === 'string') {
        message = body.detail
      } else if (Array.isArray(body?.detail)) {
        fieldErrors = {}
        for (const e of body.detail as Array<{ loc: string[]; msg: string }>) {
          const field = e.loc?.[e.loc.length - 1]
          if (field) fieldErrors[field] = e.msg
        }
        message = Object.values(fieldErrors).join(', ')
      }
    } catch {}
    throw new ApiError(res.status, message, fieldErrors)
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}
