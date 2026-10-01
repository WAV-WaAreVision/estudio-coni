import type { BuildExtension } from "@trigger.dev/build"
import { additionalFiles, ffmpeg } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk"

/**
 * `pg_dump` 17 for the nightly backup. `pg_dump` refuses a server newer than itself and Supabase runs Postgres 17
 * (supabase/config.toml), so the distribution's own client would fail the first night; this adds the PostgreSQL
 * project's apt repository (https://www.postgresql.org/download/linux/debian/) and installs its client.
 * NOT exercised: it only runs on a Trigger.dev deploy, and the base image is not documented.
 */
function postgresClient17(): BuildExtension {
  return {
    name: "postgresql-client-17",
    onBuildComplete(context) {
      if (context.target === "dev") return
      context.addLayer({
        id: "postgresql-client-17",
        image: {
          instructions: [
            "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*",
            "RUN install -d /usr/share/postgresql-common/pgdg && curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc",
            'RUN . /etc/os-release && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main" > /etc/apt/sources.list.d/pgdg.list',
            "RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 && rm -rf /var/lib/apt/lists/*",
          ],
        },
      })
    },
  }
}

export default defineConfig({
  // The real project ref arrives with the WAV Trigger.dev project; until then this placeholder keeps tsc and builds green.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_estudio_coni_local",
  // The default runtime is Node 21, which Trigger.dev stops deploying on 2026-10-05; match the app's Node 24 LTS.
  runtime: "node-24",
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
      postgresClient17(),
    ],
  },
})
