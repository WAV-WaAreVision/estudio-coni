import { additionalFiles, ffmpeg } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  // The real project ref arrives with the WAV Trigger.dev project; until then this placeholder keeps tsc and builds green.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_estudio_coni_local",
  dirs: ["./trigger"],
  maxDuration: 900,
  // With process.cwd() as the build folder in dev as in production, `assets/fuentes` is found the same way in both.
  legacyDevProcessCwdBehaviour: false,
  retries: {
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, randomize: true },
  },
  build: {
    extensions: [
      // ffmpeg and ffprobe with libass (apt), and the FFMPEG_PATH and FFPROBE_PATH that lib/video/ffmpeg.ts looks for.
      ffmpeg(),
      // The Montserrat Bold of the subtitles (assets/fuentes/README.md), at the same path under process.cwd().
      additionalFiles({ files: ["./assets/fuentes/**"] }),
    ],
  },
})
