export async function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev'
  return Response.json({ sha })
}
