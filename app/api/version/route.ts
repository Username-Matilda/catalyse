export async function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev'
  const env = process.env.RAILWAY_ENVIRONMENT_NAME ?? null
  return Response.json({ sha, env })
}
