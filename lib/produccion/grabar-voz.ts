// lib/produccion/grabar-voz.ts
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, leerPieza, leerProduccion } from "@/lib/datos/repositorio"
import { ArtefactoCambio, type Evento, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { hashPuerta1, puedeGrabarVoz } from "@/lib/dominio/puertas"
import { artefactoAprobado } from "@/lib/produccion/aprobacion"
import { avisarTope, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"
import { asegurarVoz, type DepsVoz, leerLlaveDeVoz } from "@/lib/produccion/voz"
import type { Notificador } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"

export interface DepsGrabarVoz extends DepsVoz {
  avisos: Notificador
}

export type ResultadoVoz =
  | { resultado: "lista"; audioId: string }
  | { resultado: "nada_que_hacer" }
  | { resultado: "sin_aprobacion" }
  | { resultado: "tope" }
  | { resultado: "falla" }

const TEXTO_GUION_CAMBIO = "El guion cambió después de aprobarlo. Vuelve a aprobarlo antes de grabar la voz."

async function escribir(deps: DepsGrabarVoz, fila: FilaDePieza, evento: Evento): Promise<void> {
  const { pieza } = transicionar(piezaDesdeFila(fila), evento)
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  // A plain Error: Trigger.dev retries, and the retry reads the piece again.
  if (!guardada) throw piezaCambio()
}

/**
 * Speaks the approved script with Coni's voice and hands the piece back to her in `guion_aprobado`. It spends only
 * after checking gate 1 against the row, reuses a take of the same text unless she asked for a new one, and never
 * approves anything. Safe to run again: the take of this attempt is found in the store.
 */
export async function grabarVoz(
  deps: DepsGrabarVoz,
  entrada: { piezaId: string; nueva: boolean },
): Promise<ResultadoVoz> {
  const fila = await leerPieza(deps.db, entrada.piezaId)
  if (!fila) throw new FallaDeConfiguracion(`No existe la pieza ${entrada.piezaId}.`)
  if (fila.estado !== "grabando_voz") return { resultado: "nada_que_hacer" }

  const artefacto = fila.guion === null ? null : artefactoAprobado(fila, fila.guion)
  if (fila.guion === null || artefacto === null || !puedeGrabarVoz(piezaDesdeFila(fila), hashPuerta1(artefacto)).ok) {
    await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_GUION_CAMBIO })
    return { resultado: "sin_aprobacion" }
  }

  const config = leerConfigProduccion(await leerProduccion(deps.db))
  try {
    const voz = await asegurarVoz(deps, {
      fila,
      guion: fila.guion,
      config: config.elevenlabs,
      llave: () => leerLlaveDeVoz(deps.db, config),
      nueva: entrada.nueva,
    })
    if (voz.tipo === "tope") {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_TOPE })
      await avisarTope(deps, fila)
      return { resultado: "tope" }
    }
    await escribir(deps, fila, { tipo: "voz_lista", audioId: voz.audioId })
    return { resultado: "lista", audioId: voz.audioId }
  } catch (error) {
    // The piece moving under the run (discarded, or handed back by maintenance) is not a failure of the voice.
    if (error instanceof TransicionInvalida || error instanceof ArtefactoCambio) throw error
    if (error instanceof Falla) {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: error.message })
      return { resultado: "falla" }
    }
    throw error
  }
}
