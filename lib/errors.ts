import { z } from 'zod'

export function fieldError(field: string, msg: string) {
  return { loc: ['body', field], msg, type: 'value_error' }
}

export function validationError(errors: ReturnType<typeof fieldError>[]) {
  return Response.json({ detail: errors }, { status: 422 })
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, data: result.data }
  const errors = result.error.issues.map((issue) => ({
    loc: ['body', ...issue.path.map(String)],
    msg: issue.message,
    type: 'value_error',
  }))
  return { success: false, response: Response.json({ detail: errors }, { status: 422 }) }
}
