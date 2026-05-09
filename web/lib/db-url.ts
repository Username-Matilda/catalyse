import path from "node:path";

export function resolveDbUrl(fallback = "file:../anonymised_prod.db"): string {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mountPath) return `file:${path.join(mountPath, "catalyse.db")}`;

  const rawUrl = process.env.DATABASE_URL ?? fallback;
  if (rawUrl.startsWith("file:") && !path.isAbsolute(rawUrl.slice(5))) {
    return `file:${path.resolve(process.cwd(), rawUrl.slice(5))}`;
  }
  return rawUrl;
}
