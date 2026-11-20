import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Fresh database for integration tests.
 * Default: SQLite file prisma/test.sqlite.
 * With TEST_DATABASE_URL=postgresql://... (see `npm run test:postgres`):
 * the production migrations are applied to that (empty, test-only) Postgres
 * database; each test clears the tables it uses.
 */
export default function setup() {
  const pg = process.env.TEST_DATABASE_URL;
  if (pg?.startsWith("postgres")) {
    execSync("npx prisma migrate deploy --schema prisma/postgres/schema.prisma", {
      env: { ...process.env, DATABASE_URL: pg },
      stdio: "ignore",
    });
    return;
  }
  const file = path.resolve("prisma/test.sqlite");
  for (const f of [file, `${file}-journal`]) fs.rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:test.sqlite" },
    stdio: "ignore",
  });
}
