import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Integration tests share one seeded database, so they must not interleave.
    fileParallelism: false,
    include: [
      "lib/**/*.test.ts",
      "components/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
