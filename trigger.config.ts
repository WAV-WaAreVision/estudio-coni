import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  // The real project ref arrives with the WAV Trigger.dev project; until then this placeholder keeps tsc and builds green.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_estudio_coni_local",
  dirs: ["./trigger"],
  maxDuration: 900,
  retries: {
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, randomize: true },
  },
})
