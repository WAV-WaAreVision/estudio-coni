import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import type { DepsResumen } from "@/lib/avisos/resumen"
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import { leerSecreto } from "@/lib/datos/repositorio"
import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import { resolverDns } from "@/lib/ingesta/red-segura"
import type { DepsFrecuente, DepsNocturno } from "@/lib/mantenimiento/ejecutar"
import { volcarConPgDump } from "@/lib/mantenimiento/pg-dump"
import type { DepsMantenimientoTemas } from "@/lib/mantenimiento/temas"
import type { DepsDelMotor } from "@/lib/motor/semanal"
import { almacenReal } from "@/lib/proveedores/almacen"
import { avisosReales, canalReal } from "@/lib/proveedores/avisos"
import type { DepsPublicacion } from "@/lib/publicacion/publicar"
import type { Database } from "@/lib/supabase/database.types"
import { buscarFfmpeg, buscarFfprobe, exigirMontserratBold, quemarSubtitulos, sondear } from "@/lib/video/ffmpeg"
import type { DepsArmado } from "./armar-carrusel"
import type { DepsFalla } from "./fallas"
import type { DepsGrabacion } from "./grabar"
import type { DepsGrabarVoz } from "./grabar-voz"
import type { DepsProduccion } from "./producir"

// Three calls of at most two attempts each (720 s) must fit in producir-pieza's 1200 s together with the voice of the
// draft (ElevenLabs waits up to 300 s), unlike the SDK's default of 10 minutes and two retries, where one hung call
// would end the run.
const CLAUDE_ESPERA_MS = 120_000

/**
 * The engine writes up to 8 crossings in 3 sequential batches of one non-streaming Opus call each (about 4.5k output
 * tokens, 1 to 2 minutes). 180 s is generous per call, and with no SDK retry (a retry would silently double the
 * call and its cost) the worst case is 3 x 180 s = 540 s, inside the task's 900 s.
 */
export const CLAUDE_ESPERA_MOTOR_MS = 180_000

export function clienteDelMotor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: CLAUDE_ESPERA_MOTOR_MS, maxRetries: 0 })
}

/** The dependencies of a `grabar-voz` run: the database, the store and the notices. Nothing of the video container. */
export function depsVoz(): DepsGrabarVoz {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  return {
    db: createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } }),
    avisos: avisosReales(),
    almacen: almacenReal(),
    ahora: () => new Date().toISOString(),
  }
}

/** The dependencies of a Trigger.dev run. Cheap checks come first, so a missing setting fails before any spend. */
export async function depsReales(): Promise<DepsProduccion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  // The writer stores her voice of the draft: a missing R2 setting fails here, before any key is read.
  const almacen = almacenReal()
  const db = createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    avisos: avisosReales(),
    almacen,
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
  espera: {
    callbackUrl: string
    esperarRender: (videoId: string) => Promise<void>
    esperar: (ms: number) => Promise<void>
  },
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
    esperar: espera.esperar,
    callbackUrl: espera.callbackUrl,
    ahora: () => new Date().toISOString(),
  }
}

// Instagram asks to read the container status about once a minute, for no more than five minutes.
const SONDEO_INSTAGRAM = { cadaMs: 60_000, veces: 5 }
// LinkedIn gives no advice: a short reel usually processes within a minute or two, and the next tick resumes the rest.
const SONDEO_LINKEDIN = { cadaMs: 15_000, veces: 8 }

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
    sondeoLinkedin: SONDEO_LINKEDIN,
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

/** The dependencies of the ten-minute maintenance run. The starters come from the task: they need the task objects. */
export function depsFrecuente(
  dispararGrabacion: DepsFrecuente["dispararGrabacion"],
  dispararProduccion: DepsFrecuente["dispararProduccion"],
  dispararArmado: DepsFrecuente["dispararArmado"],
): DepsFrecuente {
  return {
    db: clienteDeServicio(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    dispararGrabacion,
    dispararProduccion,
    dispararArmado,
    temas: depsTemas,
  }
}

/** The dependencies of an `armar-carrusel` run. Claude is read only if a slide has to be shortened. */
export async function depsArmado(): Promise<DepsArmado> {
  const db = clienteDeServicio()
  return {
    db,
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora: () => new Date().toISOString(),
    // Loaded only when a render runs: every other task imports this file and must not load playwright.
    renderizar: async (entrada) => {
      const { abrirPaginaDeChromium } = await import("@/lib/carrusel/navegador")
      return renderizarCarrusel(abrirPaginaDeChromium, entrada)
    },
    fuente: () => fuenteDelCarrusel(carpetaDeFuentes()),
    claude: async () => {
      const llave = await leerSecreto(db, "anthropic")
      if (!llave) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
      return new Anthropic({ apiKey: llave, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 })
    },
  }
}

/**
 * What the topic jobs need, or null when Coni has not entered Claude's key yet. Without the Voyage key the jobs still
 * run: they only skip the embeddings. No ffmpeg: this is not `depsProcesar`.
 */
export async function depsTemas(): Promise<DepsMantenimientoTemas | null> {
  const db = clienteDeServicio()
  const llave = await leerSecreto(db, "anthropic")
  if (!llave) return null
  return {
    db,
    almacen: almacenReal(),
    claude: new Anthropic({ apiKey: llave, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    ahora: () => new Date().toISOString(),
    llaveVoyage: () => process.env.VOYAGE_API_KEY || undefined,
  }
}

/** The dependencies of the weekly engine, or null when Coni has not entered Claude's key yet. */
export async function depsMotor(): Promise<DepsDelMotor | null> {
  const db = clienteDeServicio()
  const llave = await leerSecreto(db, "anthropic")
  if (!llave) return null
  return {
    db,
    almacen: almacenReal(),
    claude: clienteDelMotor(llave),
    ahora: () => new Date().toISOString(),
  }
}

/** The dependencies of the 08:30 summary: the channel, not the notifier that stores notices (the summary stores none). */
export function depsResumen(): DepsResumen {
  return { db: clienteDeServicio(), canal: canalReal(), ahora: () => new Date().toISOString() }
}

/** The dependencies of the nightly run. A missing database URL is the backup's failure, and WAV is told by it. */
export function depsNocturno(): DepsNocturno {
  const db = clienteDeServicio()
  const ahora = () => new Date().toISOString()
  return {
    db,
    almacen: almacenReal(),
    avisos: avisosReales(),
    ahora,
    anotarBorrado: anotadorDeBorrados(db, ahora),
    volcarBase: () => volcarConPgDump(exigirEnv("RESPALDO_DB_URL", process.env.RESPALDO_DB_URL)),
    temas: depsTemas,
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
    ffmpeg,
    ahora: () => new Date().toISOString(),
    corrida,
  }
}
