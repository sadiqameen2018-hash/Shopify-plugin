import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests don't load the React Router plugin.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup-db.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || "file:test.sqlite" },
    // Integration tests share one SQLite file.
    fileParallelism: false,
  },
});
