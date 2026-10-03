import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { idempotencyKeys, tasks } from "@trigger.dev/sdk"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { grabarPiezaTask } from "@/trigger/grabar-pieza"
import type { procesarMaterialTask } from "@/trigger/procesar-material"
import type { producirPiezaTask } from "@/trigger/producir-pieza"
import type { sintetizarTeoriaTask } from "@/trigger/sintetizar-teoria"
import type { Disparos } from "./disparos"

type Entorno = Record<string, string | undefined>

// `scope: "global"`: the key is the same whichever request asks, so two devices or a double tap start one run.
const claveGlobal = (clave: string) => idempotencyKeys.create(clave, { scope: "global" })

function disparosReales(): Disparos {
  return {
    async producir(piezaId, clave) {
      await tasks.trigger<typeof producirPiezaTask>(
        "producir-pieza",
        { piezaId },
        { idempotencyKey: await claveGlobal(clave) },
      )
    },
    async grabar(piezaId, clave) {
      await tasks.trigger<typeof grabarPiezaTask>(
        "grabar-pieza",
        { piezaId },
        { idempotencyKey: await claveGlobal(clave) },
      )
    },
  }
}

/** For local E2E runs: writes one JSON line per run it would have started, and calls nothing. */
function disparosDePrueba(archivo: string): Disparos {
  const anotar = (tarea: "producir" | "grabar") => async (piezaId: string, clave: string) => {
    appendFileSync(archivo, `${JSON.stringify({ tarea, piezaId, clave })}\n`)
  }
  return { producir: anotar("producir"), grabar: anotar("grabar") }
}

/** The file the runs are written to in test mode, null when the runs are real. A deployed app refuses test mode. */
function archivoDeDisparoDePrueba(entorno: Entorno): string | null {
  if (entorno.DISPARO_DE_PRUEBA !== "1") return null
  if (entorno.VERCEL) {
    throw new FallaDeConfiguracion("DISPARO_DE_PRUEBA no puede estar activo en Vercel: no se grabaría ningún video.")
  }
  return entorno.DISPARO_DE_PRUEBA_ARCHIVO || join(tmpdir(), "estudio-coni-disparos.jsonl")
}

function exigirLlaveDeTrigger(entorno: Entorno): void {
  if (!entorno.TRIGGER_SECRET_KEY) {
    throw new FallaDeConfiguracion("Falta TRIGGER_SECRET_KEY: la app no puede iniciar la escritura ni la grabación.")
  }
}

/** Trigger.dev in production; a file when `DISPARO_DE_PRUEBA=1`, which a deployed app refuses. */
export function disparosDeEntorno(entorno: Entorno = process.env): Disparos {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) return disparosDePrueba(archivo)
  exigirLlaveDeTrigger(entorno)
  return disparosReales()
}

/**
 * Starts the processing of an uploaded material. The key holds for ten minutes: a double tap starts one run, and
 * the retry of a failed material a while later starts a new one.
 */
export async function dispararProcesarMaterial(materialId: string, entorno: Entorno = process.env): Promise<void> {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) {
    appendFileSync(archivo, `${JSON.stringify({ tarea: "procesar-material", materialId })}\n`)
    return
  }
  exigirLlaveDeTrigger(entorno)
  await tasks.trigger<typeof procesarMaterialTask>(
    "procesar-material",
    { materialId },
    { idempotencyKey: await claveGlobal(`procesar-material:${materialId}`), idempotencyKeyTTL: "10m" },
  )
}

/**
 * Starts the synthesis of a theory. The key holds for ten minutes: a double tap starts one run. A retry passes its
 * own `intento`, so the failed run is never reused.
 */
export async function dispararSintetizarTeoria(
  teoriaId: string,
  entorno: Entorno = process.env,
  intento?: string,
): Promise<void> {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) {
    appendFileSync(
      archivo,
      `${JSON.stringify({ tarea: "sintetizar-teoria", teoriaId, ...(intento ? { intento } : {}) })}\n`,
    )
    return
  }
  exigirLlaveDeTrigger(entorno)
  await tasks.trigger<typeof sintetizarTeoriaTask>(
    "sintetizar-teoria",
    { teoriaId },
    {
      idempotencyKey: await claveGlobal(`sintetizar-teoria:${teoriaId}${intento ? `:${intento}` : ""}`),
      idempotencyKeyTTL: "10m",
    },
  )
}
