import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { idempotencyKeys, tasks } from "@trigger.dev/sdk"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { grabarPiezaTask } from "@/trigger/grabar-pieza"
import type { producirPiezaTask } from "@/trigger/producir-pieza"
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

/** Trigger.dev in production; a file when `DISPARO_DE_PRUEBA=1`, which a deployed app refuses. */
export function disparosDeEntorno(entorno: Entorno = process.env): Disparos {
  if (entorno.DISPARO_DE_PRUEBA === "1") {
    if (entorno.VERCEL) {
      throw new FallaDeConfiguracion("DISPARO_DE_PRUEBA no puede estar activo en Vercel: no se grabaría ningún video.")
    }
    return disparosDePrueba(entorno.DISPARO_DE_PRUEBA_ARCHIVO || join(tmpdir(), "estudio-coni-disparos.jsonl"))
  }
  if (!entorno.TRIGGER_SECRET_KEY) {
    throw new FallaDeConfiguracion("Falta TRIGGER_SECRET_KEY: la app no puede iniciar la escritura ni la grabación.")
  }
  return disparosReales()
}
