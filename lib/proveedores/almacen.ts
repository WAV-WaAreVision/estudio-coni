import { createHash } from "node:crypto"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/** Private object storage. The R2 implementation arrives in Plan 3b; tasks and tests only see this port. */
export interface Almacen {
  subir(clave: string, datos: Uint8Array, tipo: string): Promise<void>
  urlFirmada(clave: string, segundos: number): Promise<string>
}

export interface ObjetoAlmacenado {
  datos: Uint8Array
  tipo: string
}

export interface AlmacenEnMemoria extends Almacen {
  obtener(clave: string): ObjetoAlmacenado | undefined
  claves(): string[]
}

/** A test double with the same contract as the real store, plus a way to look inside. */
export function almacenEnMemoria(): AlmacenEnMemoria {
  const objetos = new Map<string, ObjetoAlmacenado>()
  return {
    async subir(clave, datos, tipo) {
      // Copied, as a real upload would: the caller may reuse its buffer afterwards.
      objetos.set(clave, { datos: new Uint8Array(datos), tipo })
    },
    async urlFirmada(clave, segundos) {
      if (!(segundos > 0)) {
        throw new Error(`Una URL firmada necesita una vigencia positiva: ${segundos}`)
      }
      if (!objetos.has(clave)) {
        throw new Error(`No existe el objeto ${clave}`)
      }
      return `https://almacen.test/${clave}?expira=${segundos}`
    },
    obtener: (clave) => objetos.get(clave),
    claves: () => [...objetos.keys()],
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Content-addressed: a regenerated voice has other bytes, so it gets another key, and since the key is the
 * `audio_id` that gate 1 binds, the approval of the old voice no longer applies.
 */
export function claveAudio(piezaId: string, mp3: Uint8Array): string {
  if (!UUID.test(piezaId)) {
    throw new Error(`El id de la pieza no es un UUID: ${piezaId}`)
  }
  return `voces/${piezaId}/${createHash("sha256").update(mp3).digest("hex")}.mp3`
}

/**
 * The store the tasks use in production. Plan 3b replaces the body with the R2 client; until then it fails before
 * the task has spent anything.
 */
export function almacenReal(): Almacen {
  throw new FallaDeConfiguracion(
    "El almacenamiento privado (R2) llega con el Plan 3b: esta tarea todavía no puede correr.",
  )
}
