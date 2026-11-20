import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("prisma/postgres/schema.prisma", () => {
  it("is in sync with prisma/schema.prisma (run: npm run db:sync-postgres)", () => {
    const main = fs.readFileSync("prisma/schema.prisma", "utf8");
    const pg = fs.readFileSync("prisma/postgres/schema.prisma", "utf8");
    const expected = main.replace('provider = "sqlite"', 'provider = "postgresql"');
    expect(pg.slice(pg.indexOf("\n") + 1)).toBe(expected);
  });
});
