import path from "node:path"
import { defineConfig } from "vitest/config"

// Evals call the real Claude API and cost money: no MSW here, and `pnpm test:eval` still skips them
// unless RUN_EVALS=1 and ANTHROPIC_API_KEY are set.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
})
