import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { almacenReal } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { buscarFfmpeg, buscarFfprobe, exigirMontserratBold, quemarSubtitulos, sondear } from "@/lib/video/ffmpeg"
import type { DepsGrabacion } from "./grabar"
import type { DepsProduccion } from "./producir"

// Three calls of at most two attempts each must fit in the task's 900 s (trigger.config.ts), unlike the SDK's
// default of 10 minutes and two retries, where one hung call would end the run.
const CLAUDE_ESPERA_MS = 120_000

/** The dependencies of a Trigger.dev run. Cheap checks come first, so a missing setting fails before any spend. */
export async function depsReales(): Promise<DepsProduccion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  const almacen = almacenReal()
  const db = createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    almacen,
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
    almacen,
    quemar: ({ video, ass }) => quemarSubtitulos({ ffmpeg, video, ass, fontsdir }),
    sondear: (bytes) => sondear({ ffprobe, bytes }),
    esperarRender: espera.esperarRender,
    callbackUrl: espera.callbackUrl,
    ahora: () => new Date().toISOString(),
  }
}
