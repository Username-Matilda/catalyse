import { config } from "dotenv";
// Capture shell-provided env vars before dotenv can override them.
// .env.local should win over .env, but shell env always wins over both.
const shellEnv = { ...process.env };
config(); // loads .env
config({ path: ".env.local", override: true }); // .env.local takes priority over .env
Object.assign(process.env, shellEnv); // restore shell vars — they take highest priority
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
