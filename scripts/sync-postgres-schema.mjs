// Generates prisma/postgres/schema.prisma from prisma/schema.prisma.
// Local development uses SQLite; production (Docker / Render) uses PostgreSQL.
// Run after every change to prisma/schema.prisma:
//   node scripts/sync-postgres-schema.mjs
//   npx prisma migrate diff --from-migrations prisma/postgres/migrations \
//     --to-schema-datamodel prisma/postgres/schema.prisma --script \
//     --shadow-database-url "$SHADOW_POSTGRES_URL" > prisma/postgres/migrations/<timestamp>_<name>/migration.sql
import fs from "node:fs";

const src = fs.readFileSync("prisma/schema.prisma", "utf8");
const out = src.replace('provider = "sqlite"', 'provider = "postgresql"');
if (out === src) throw new Error('provider = "sqlite" not found in prisma/schema.prisma');
const header = "// GENERATED from prisma/schema.prisma by scripts/sync-postgres-schema.mjs. Do not edit.\n";
fs.writeFileSync("prisma/postgres/schema.prisma", header + out);
console.log("Wrote prisma/postgres/schema.prisma");
