import path from "node:path";

export function resolveDbUrl(fallback = "file:./db/catalyse.db"): string {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  if (mountPath && isProduction) return `file:${path.join(/*turbopackIgnore: true*/ mountPath, "catalyse.db")}`;

  const rawUrl = process.env.DATABASE_URL ?? fallback;
  if (rawUrl.startsWith("file:") && !path.isAbsolute(rawUrl.slice(5))) {
    return `file:${path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawUrl.slice(5))}`;
  }
  return rawUrl;
}
