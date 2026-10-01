import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { z } from "zod"

const EstadoLocal = z.object({
  API_URL: z.string().url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
  MAILPIT_URL: z.string().url(),
})

function leerEstadoLocal() {
  const salida = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return EstadoLocal.parse(JSON.parse(salida))
}

const estado = leerEstadoLocal()

export const PUERTO = 3200
export const URL_DE_LA_APP = `http://127.0.0.1:${PUERTO}`
export const CORREO_DE_CONI = "coni@estudio.test"
export const CORREO_DEL_MANTENEDOR = "wav@estudio.test"
export const SUPABASE_URL = estado.API_URL
export const CLAVE_ANONIMA = estado.ANON_KEY
export const CLAVE_DE_SERVICIO = estado.SERVICE_ROLE_KEY
export const BUZON = estado.MAILPIT_URL

/** Where the app writes the runs it would have started: the test reads it instead of calling Trigger.dev. */
export const ARCHIVO_DE_DISPAROS = join(process.cwd(), "test-results", "disparos.jsonl")
export const CARPETA_DE_CAPTURAS = process.env.CAPTURAS_E2E ?? join(process.cwd(), "test-results", "capturas")
export const ESTADO_DE_SESION = join(process.cwd(), "tests", "e2e", ".auth", "coni.json")

/** The fake Anthropic, HeyGen, ElevenLabs and Instagram of the run (tests/e2e/servicios-falsos.ts). */
export const PUERTO_SERVICIOS = 3201
export const URL_SERVICIOS = `http://127.0.0.1:${PUERTO_SERVICIOS}`
