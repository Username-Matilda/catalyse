import { config } from "dotenv";
// Capture shell-provided env vars before dotenv can override them.
// .env.local should win over .env, but shell env always wins over both.
const shellEnv = { ...process.env };
config(); // loads .env
config({ path: ".env.local", override: true }); // .env.local takes priority over .env
Object.assign(process.env, shellEnv); // restore shell vars — they take highest priority
import { defineConfig } from "prisma/config";
import { resolveDbUrl } from "./lib/db-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: resolveDbUrl(),
  },
});
