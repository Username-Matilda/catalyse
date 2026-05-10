export async function GET() {
  return Response.json({ client_id: process.env.GOOGLE_CLIENT_ID || '' })
}
