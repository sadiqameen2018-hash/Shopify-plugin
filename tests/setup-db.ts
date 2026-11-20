import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Fresh SQLite database for integration tests (prisma/test.sqlite). */
export default function setup() {
  const file = path.resolve("prisma/test.sqlite");
  for (const f of [file, `${file}-journal`]) fs.rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:test.sqlite" },
    stdio: "ignore",
  });
}
