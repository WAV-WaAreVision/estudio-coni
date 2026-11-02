import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts", "./tests/setup-msw.ts"],
    globals: true,
    exclude: ["tests/integration/**", "tests/e2e/**", "tests/e2e-biblioteca/**", "node_modules/**", ".worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
