import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { idempotencyKeys, tasks } from "@trigger.dev/sdk"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { armarCarruselTask } from "@/trigger/armar-carrusel"
import type { grabarPiezaTask } from "@/trigger/grabar-pieza"
import type { grabarVozTask } from "@/trigger/grabar-voz"
import type { motorManualTask } from "@/trigger/motor-semanal"
import type { procesarMaterialTask } from "@/trigger/procesar-material"
import type { producirPiezaTask } from "@/trigger/producir-pieza"
import { claveMotor, claveProcesarMaterial, type Disparos, type DisparosDeBiblioteca } from "./disparos"

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
    async grabar(piezaId, clave, intento, retraso) {
      await tasks.trigger<typeof grabarPiezaTask>(
        "grabar-pieza",
        { piezaId, intento },
        // A delayed run waits in DELAYED; the key still dedupes a second signature of the same text.
        { idempotencyKey: await claveGlobal(clave), ...(retraso ? { delay: retraso } : {}) },
      )
    },
    async voz(piezaId, clave, nueva) {
      await tasks.trigger<typeof grabarVozTask>(
        "grabar-voz",
        { piezaId, nueva },
        // One voice at a time per piece: two taps or two devices cannot call ElevenLabs at once.
        { idempotencyKey: await claveGlobal(clave), concurrencyKey: piezaId },
      )
    },
    async armar(piezaId, clave) {
      await tasks.trigger<typeof armarCarruselTask>(
        "armar-carrusel",
        { piezaId },
        { idempotencyKey: await claveGlobal(clave) },
      )
    },
  }
}

/** For local E2E runs: writes one JSON line per run it would have started, and calls nothing. */
function disparosDePrueba(archivo: string): Disparos {
  const anotar = (linea: Record<string, unknown>) => appendFileSync(archivo, `${JSON.stringify(linea)}\n`)
  return {
    producir: async (piezaId, clave) => anotar({ tarea: "producir", piezaId, clave }),
    grabar: async (piezaId, clave, intento, retraso) =>
      anotar({ tarea: "grabar", piezaId, clave, intento, ...(retraso ? { retraso } : {}) }),
    voz: async (piezaId, clave, nueva) => anotar({ tarea: "voz", piezaId, clave, nueva }),
    armar: async (piezaId, clave) => anotar({ tarea: "armar", piezaId, clave }),
  }
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
    throw new FallaDeConfiguracion("Falta TRIGGER_SECRET_KEY: la app no puede iniciar tareas en segundo plano.")
  }
}

/** Trigger.dev in production; a file when `DISPARO_DE_PRUEBA=1`, which a deployed app refuses. */
export function disparosDeEntorno(entorno: Entorno = process.env): Disparos {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) return disparosDePrueba(archivo)
  exigirLlaveDeTrigger(entorno)
  return disparosReales()
}

function disparosDeBibliotecaReales(): DisparosDeBiblioteca {
  return {
    async material(materialId, intento) {
      await tasks.trigger<typeof procesarMaterialTask>(
        "procesar-material",
        { materialId },
        { idempotencyKey: await claveGlobal(claveProcesarMaterial(materialId, intento)), idempotencyKeyTTL: "10m" },
      )
    },
    async motor(semana, intento) {
      await tasks.trigger<typeof motorManualTask>(
        "motor-manual",
        { manual: true },
        { idempotencyKey: await claveGlobal(claveMotor(semana, intento)), idempotencyKeyTTL: "10m" },
      )
    },
  }
}

function disparosDeBibliotecaDePrueba(archivo: string): DisparosDeBiblioteca {
  const anotar = (linea: Record<string, unknown>) => appendFileSync(archivo, `${JSON.stringify(linea)}\n`)
  return {
    material: async (materialId, intento) =>
      anotar({ tarea: "procesar-material", materialId, clave: claveProcesarMaterial(materialId, intento) }),
    motor: async (semana, intento) => anotar({ tarea: "motor-manual", semana, clave: claveMotor(semana, intento) }),
  }
}

/** Trigger.dev in production; a file when `DISPARO_DE_PRUEBA=1`, which a deployed app refuses. */
export function disparosDeBibliotecaDeEntorno(entorno: Entorno = process.env): DisparosDeBiblioteca {
  const archivo = archivoDeDisparoDePrueba(entorno)
  if (archivo) return disparosDeBibliotecaDePrueba(archivo)
  exigirLlaveDeTrigger(entorno)
  return disparosDeBibliotecaReales()
}
