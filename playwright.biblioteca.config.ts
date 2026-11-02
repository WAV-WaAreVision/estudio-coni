import { join } from "node:path"
import { defineConfig } from "@playwright/test"
import base, { iphone } from "./playwright.config"
import {
  CLAVE_ANONIMA,
  CLAVE_DE_SERVICIO,
  CORREO_DE_CONI,
  CORREO_DEL_MANTENEDOR,
  PUERTO_DE_INGESTA,
  SUPABASE_URL,
  URL_DE_INGESTA,
  URL_DE_LA_APP,
  URL_DIRECTA_DE_INGESTA,
  URL_SEGURA_DE_LA_APP,
} from "./tests/e2e/entorno"

// Conidolly's Biblioteca tab end to end: this app and an Ingesta checkout with the bridge, both against the local stack.
const DIRECTORIO_DE_INGESTA = process.env.E2E_INGESTA_DIR
if (!DIRECTORIO_DE_INGESTA) {
  throw new Error(
    "Falta E2E_INGESTA_DIR: la ruta de un checkout de conidolly-ingesta con el puente (pnpm install hecho).",
  )
}

/** The https front of one app (tests/e2e-biblioteca/frente-tls.ts): it answers its own health check. */
function frenteTls(seguro: string, directo: string) {
  return {
    command: "node --import tsx tests/e2e-biblioteca/frente-tls.ts",
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 3000 },
    url: `${seguro}/__tls`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 60_000,
    env: { PUERTO_TLS: new URL(seguro).port, DESTINO_TLS: directo },
  }
}

export default defineConfig({
  ...base,
  testDir: "./tests/e2e-biblioteca",
  projects: [{ name: "biblioteca", use: { ...iphone, baseURL: URL_SEGURA_DE_LA_APP, ignoreHTTPSErrors: true } }],
  webServer: [
    ...[base.webServer ?? []].flat(),
    {
      command: `pnpm exec next build && node node_modules/next/dist/bin/next start -p ${PUERTO_DE_INGESTA}`,
      cwd: DIRECTORIO_DE_INGESTA,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      url: `${URL_DIRECTA_DE_INGESTA}/ingreso`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: CLAVE_ANONIMA,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: CLAVE_DE_SERVICIO,
        CORREO_CONI: CORREO_DE_CONI,
        CORREO_WAV: CORREO_DEL_MANTENEDOR,
        // The only Origin Ingesta's bridge accepts: the address the browser of this run has Conidolly at.
        CONIDOLLY_URL: URL_SEGURA_DE_LA_APP,
        // Nothing real is reachable from this run: Ingesta writes the runs it would start to a file.
        DISPARO_DE_PRUEBA: "1",
        DISPARO_DE_PRUEBA_ARCHIVO: join(process.cwd(), "test-results", "disparos-ingesta.jsonl"),
      },
    },
    frenteTls(URL_SEGURA_DE_LA_APP, URL_DE_LA_APP),
    frenteTls(URL_DE_INGESTA, URL_DIRECTA_DE_INGESTA),
  ],
})
