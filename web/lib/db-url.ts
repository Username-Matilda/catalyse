import path from "node:path";

export function resolveDbUrl(fallback = "file:../catalyse.db"): string {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mountPath) return `file:${path.join(/*turbopackIgnore: true*/ mountPath, "catalyse.db")}`;

  const rawUrl = process.env.DATABASE_URL ?? fallback;
  if (rawUrl.startsWith("file:") && !path.isAbsolute(rawUrl.slice(5))) {
    return `file:${path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawUrl.slice(5))}`;
  }
  return rawUrl;
}
