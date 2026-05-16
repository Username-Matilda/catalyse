// instrumentation.ts is Next.js's server startup hook — the only place that
// runs eagerly after runtime env vars are injected but before the first request.
// next.config.ts runs at build time (env vars not yet available on Railway),
// and top-level module side effects run lazily. This is the right mechanism
// even though it was originally designed for observability tools like OTel.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env')
    validateEnv()
  }
}
