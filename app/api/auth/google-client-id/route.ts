const STUB_GOOGLE =
  !process.env.GOOGLE_CLIENT_ID && process.env.NODE_ENV !== 'production'

export async function GET() {
  return Response.json({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    stub: STUB_GOOGLE,
  })
}
