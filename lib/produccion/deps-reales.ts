import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import type { DepsResumen } from "@/lib/avisos/resumen"
import { leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import { resolverDns } from "@/lib/ingesta/red-segura"
import type { DepsTeoria } from "@/lib/ingesta/teoria"
import type { DepsFrecuente, DepsNocturno } from "@/lib/mantenimiento/ejecutar"
import { volcarConPgDump } from "@/lib/mantenimiento/pg-dump"
import { almacenReal } from "@/lib/proveedores/almacen"
import { avisosReales, canalReal } from "@/lib/proveedores/avisos"
import type { DepsPublicacion } from "@/lib/publicacion/publicar"
import type { Database } from "@/lib/supabase/database.types"
import { buscarFfmpeg, buscarFfprobe, exigirMontserratBold, quemarSubtitulos, sondear } from "@/lib/video/ffmpeg"
import type { DepsFalla } from "./fallas"
import type { DepsGrabacion } from "./grabar"
import type { DepsProduccion } from "./producir"

// Three calls of at most two attempts each must fit in the task's 900 s (trigger.config.ts), unlike the SDK's
// default of 10 minutes and two retries, where one hung call would end the run.
const CLAUDE_ESPERA_MS = 120_000

/** The dependencies of a Trigger.dev run. Cheap checks come first, so a missing setting fails before any spend. */
export async function depsReales(): Promise<DepsProduccion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  const db = createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    avisos: avisosReales(),
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    ahora: () => new Date().toISOString(),
  }
}

/** Where the subtitle fonts are: `CONI_FONTSDIR`, or `assets/fuentes` under the working directory, where Trigger.dev's `additionalFiles` puts them. */
function carpetaDeFuentes(): string {
  return process.env.CONI_FONTSDIR || join(process.cwd(), "assets/fuentes")
}

/**
 * The dependencies of a `grabar-pieza` run. Everything that can be wrong with the container (the R2 variables, an
 * ffmpeg with libass, the Montserrat face) fails here, before the run reserves or spends anything.
 */
export async function depsGrabacion(
  espera: { callbackUrl: string; esperarRender: (videoId: string) => Promise<void> },
  opciones: { ffmpegFijos?: readonly string[] } = {},
): Promise<DepsGrabacion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  const almacen = almacenReal()
  const ffmpeg = await buscarFfmpeg(process.env, opciones.ffmpegFijos)
  if (!ffmpeg) {
    throw new FallaDeConfiguracion(
      "Ningún ffmpeg tiene libass (el filtro subtitles). En el contenedor lo instala la extensión ffmpeg() de trigger.config.ts; en tu máquina: brew install ffmpeg-full.",
    )
  }
  const fontsdir = carpetaDeFuentes()
  await exigirMontserratBold({ ffmpeg, fontsdir })
  const ffprobe = await buscarFfprobe(ffmpeg)
  return {
    db: createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } }),
    avisos: avisosReales(),
    almacen,
    quemar: ({ video, ass }) => quemarSubtitulos({ ffmpeg, video, ass, fontsdir }),
    sondear: (bytes) => sondear({ ffprobe, bytes }),
    esperarRender: espera.esperarRender,
    callbackUrl: espera.callbackUrl,
    ahora: () => new Date().toISOString(),
  }
}

// Instagram asks to read the container status about once a minute, for no more than five minutes.
const SONDEO_INSTAGRAM = { cadaMs: 60_000, veces: 5 }

/** The dependencies of a `publicar-pendientes` run. A missing R2 setting fails before a piece is taken. */
export function depsPublicacion(): DepsPublicacion {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  return {
    db: createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } }),
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    // A plain sleep, not `wait.for`: a waiting run gives up its place in the queue, and this one must keep it.
    dormir: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    sondeo: SONDEO_INSTAGRAM,
  }
}

/** What the `onFailure` hooks need: the database and the alerts. */
export function depsFalla(): DepsFalla {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  return {
    db: createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } }),
    avisos: avisosReales(),
  }
}

function clienteDeServicio() {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  return createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** The dependencies of the ten-minute maintenance run. The two starters come from the task: they need the task objects. */
export function depsFrecuente(
  dispararGrabacion: DepsFrecuente["dispararGrabacion"],
  dispararProduccion: DepsFrecuente["dispararProduccion"],
  corrida: string,
): DepsFrecuente {
  return {
    db: clienteDeServicio(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    dispararGrabacion,
    dispararProduccion,
    vinculos: () => depsVinculos(corrida),
  }
}

/**
 * What the embeddings and links sweep needs, or null when it has nothing to work with: without the Voyage key there is
 * no embedding to make, and without Claude's key (Coni has not entered it) no card can exist yet.
 */
async function depsVinculos(corrida: string): Promise<DepsProcesar | null> {
  if (!process.env.VOYAGE_API_KEY) return null
  const llave = await leerSecreto(clienteDeServicio(), "anthropic")
  if (!llave) return null
  return depsProcesar(corrida)
}

/** The dependencies of the 08:30 summary: the channel, not the notifier that stores notices (the summary stores none). */
export function depsResumen(): DepsResumen {
  return { db: clienteDeServicio(), canal: canalReal(), ahora: () => new Date().toISOString() }
}

/** The dependencies of the nightly run. A missing database URL is the backup's failure, and WAV is told by it. */
export function depsNocturno(): DepsNocturno {
  return {
    db: clienteDeServicio(),
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    volcarBase: () => volcarConPgDump(exigirEnv("RESPALDO_DB_URL", process.env.RESPALDO_DB_URL)),
  }
}

/**
 * The dependencies of a `procesar-material` run. Claude's key and ffmpeg are checked here, before the run spends
 * anything; ElevenLabs' key is read only when a material has audio to transcribe.
 */
export async function depsProcesar(corrida: string): Promise<DepsProcesar> {
  const db = clienteDeServicio()
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  const ffmpeg = await buscarFfmpegBasico()
  if (!ffmpeg) {
    throw new FallaDeConfiguracion(
      "No encuentro ffmpeg para leer los materiales. En el contenedor lo instala la extensión ffmpeg() de trigger.config.ts.",
    )
  }
  return {
    db,
    almacen: almacenReal(),
    fetch: (entrada, init) => fetch(entrada, init),
    resolver: resolverDns,
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    llaveElevenlabs: async () => {
      const llave = await leerSecreto(db, "elevenlabs")
      if (!llave) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de ElevenLabs en Ajustes.")
      return llave
    },
    llaveVoyage: () => process.env.VOYAGE_API_KEY || undefined,
    avisos: avisosReales(),
    ffmpeg,
    ahora: () => new Date().toISOString(),
    corrida,
  }
}

/** The dependencies of a `sintetizar-teoria` run: Claude's key is checked before the run spends anything. */
export async function depsTeoria(): Promise<DepsTeoria> {
  const db = clienteDeServicio()
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    almacen: almacenReal(),
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    ahora: () => new Date().toISOString(),
  }
}
