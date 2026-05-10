export function fieldError(field: string, msg: string) {
  return { loc: ['body', field], msg, type: 'value_error' }
}

export function validationError(errors: ReturnType<typeof fieldError>[]) {
  return Response.json({ detail: errors }, { status: 422 })
}
