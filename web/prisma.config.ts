import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const rawUrl = process.env.DATABASE_URL ?? "file:../anonymised_prod.db";

// Resolve relative file: URLs to absolute paths so the CLI finds the DB
// regardless of which subdirectory it is invoked from.
const datasourceUrl =
  rawUrl.startsWith("file:") && !path.isAbsolute(rawUrl.slice(5))
    ? `file:${path.resolve(process.cwd(), rawUrl.slice(5))}`
    : rawUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: datasourceUrl,
  },
});
