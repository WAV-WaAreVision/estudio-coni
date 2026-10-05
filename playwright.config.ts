import { defineConfig, devices } from "@playwright/test"
import { generateVAPIDKeys } from "web-push"
import {
  ARCHIVO_DE_DISPAROS,
  CLAVE_ANONIMA,
  CLAVE_DE_SERVICIO,
  CORREO_DE_CONI,
  ESTADO_DE_SESION,
  PUERTO,
  PUERTO_SERVICIOS,
  SUPABASE_URL,
  URL_DE_LA_APP,
  URL_SERVICIOS,
} from "./tests/e2e/entorno"

// Throwaway VAPID keys for this run only: the app signs its test push with them and the fake push service ignores them.
const vapid = generateVAPIDKeys()

// An iPhone-sized phone on Chromium: the same layout and touch settings, without installing WebKit.
// PLAYWRIGHT_CHROMIUM_PATH points at a Chromium already on the machine when the one this Playwright version wants is
// not installed (`playwright install` downloads it).
const iphone = {
  ...devices["iPhone 14"],
  defaultBrowserType: "chromium" as const,
  // The device descriptor stops at 664 px (Safari without its bars); the design is checked at 390 x 844.
  viewport: { width: 390, height: 844 },
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/limpiar.ts",
  // One database and one mailbox: the specs run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  // A run that stops answering (a browser that will not close after a failure) ends instead of waiting for ever.
  globalTimeout: 600_000,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    baseURL: URL_DE_LA_APP,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "ingreso", testMatch: /ingreso\.setup\.ts/, use: iphone },
    {
      name: "app",
      dependencies: ["ingreso"],
      testMatch: /.*\.spec\.ts/,
      use: { ...iphone, storageState: ESTADO_DE_SESION },
    },
  ],
  // Built and started here so the public variables are inlined with the local stack's values. No real service is
  // reachable from this run: DISPARO_DE_PRUEBA writes the runs to a file instead of calling Trigger.dev.
  webServer: [
    {
      // The outside world: nothing real is reachable from this run.
      command: "node --import tsx tests/e2e/servicios-falsos.ts",
      gracefulShutdown: { signal: "SIGTERM", timeout: 3000 },
      url: `${URL_SERVICIOS}/__salud`,
      env: { PUERTO_SERVICIOS_FALSOS: String(PUERTO_SERVICIOS) },
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 60_000,
    },
    {
      command: `pnpm exec next build && node node_modules/next/dist/bin/next start -p ${PUERTO}`,
      // `next start` runs the server as its own child: a SIGTERM lets it pass the signal on; a SIGKILL would orphan it.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      url: `${URL_DE_LA_APP}/ingreso`,
      // E2E_REUSE_SERVER=1 keeps a server you started yourself on this port while you iterate on a spec.
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: CLAVE_ANONIMA,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: CLAVE_DE_SERVICIO,
        CORREO_CONI: CORREO_DE_CONI,
        // `next start` runs in production mode, where the click counter of /l needs its secret.
        SAL_DE_CLICS: "secreto-de-prueba-que-solo-vive-en-el-e2e",
        DISPARO_DE_PRUEBA: "1",
        DISPARO_DE_PRUEBA_ARCHIVO: ARCHIVO_DE_DISPAROS,
        ANTHROPIC_BASE_URL: URL_SERVICIOS,
        HEYGEN_BASE_URL: URL_SERVICIOS,
        ELEVENLABS_BASE_URL: URL_SERVICIOS,
        INSTAGRAM_OAUTH_BASE_URL: URL_SERVICIOS,
        INSTAGRAM_GRAPH_BASE_URL: URL_SERVICIOS,
        PUSH_BASE_URL: URL_SERVICIOS,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:wav@estudio.test",
        META_APP_ID: "1234567890",
        META_APP_SECRET: "secreto-de-la-app-e2e",
        META_REDIRECT_URI: `${URL_DE_LA_APP}/api/meta/callback`,
      },
    },
  ],
})
