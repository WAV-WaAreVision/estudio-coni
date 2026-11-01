import { diaEnPalabras, instanteEnPalabras } from "./fechas"
import type { BorradoAnotado, RegistroDeDatos } from "./leer"
import { discrepanciaDeRegla, esReglaDeBorrado, type ReglaDeBorrado, textoDeDiscrepancia } from "./reglas"

export interface TarjetaDeDato {
  clave: string
  dato: string
  paraQue: string
  /** Provider and country: «HeyGen, Estados Unidos (por confirmar)», or «Supabase, país por confirmar». */
  donde: string
  plazo: string
  /** «No coincide con lo que la app borra (30 días)», or null. */
  discrepancia: string | null
}

export interface VistaDelRegistro {
  tarjetas: TarjetaDeDato[]
  borrados: { id: string; frase: string }[]
  revision: { ultima: string | null; vence: string }
}

const POR_CONFIRMAR = /^por confirmar$/i

/** A country still unknown reads «país por confirmar», so the provider is not taken for a place. */
export function paisEnPalabras(pais: string, confirmado: boolean): string {
  const limpio = pais.trim()
  if (POR_CONFIRMAR.test(limpio)) return "país por confirmar"
  return confirmado ? limpio : `${limpio} (por confirmar)`
}

const NOMBRES: Record<ReglaDeBorrado, readonly [uno: string, varios: string]> = {
  videos_de_piezas: ["archivo de video o voz", "archivos de videos y voces"],
  respaldos: ["respaldo de la base", "respaldos de la base"],
  huella_de_visitas: ["huella de visitas", "huellas de visitas"],
}

/** «Se borraron 3 archivos de videos y voces el 2 de noviembre.» */
export function fraseDeBorrado(borrado: BorradoAnotado, zona: string): string {
  const [uno, varios] = esReglaDeBorrado(borrado.regla)
    ? NOMBRES[borrado.regla]
    : ([`elemento de ${borrado.regla}`, `elementos de ${borrado.regla}`] as const)
  const cuando = instanteEnPalabras(borrado.borradoEn, zona, { anio: false })
  return borrado.cantidad === 1
    ? `Se borró 1 ${uno} el ${cuando}.`
    : `Se borraron ${borrado.cantidad} ${varios} el ${cuando}.`
}

/** The screen's words for the register, computed on the server so the client renders what the server rendered. */
export function presentarRegistro(registro: RegistroDeDatos): VistaDelRegistro {
  return {
    tarjetas: registro.filas.map((fila) => {
      const discrepancia = discrepanciaDeRegla(fila)
      return {
        clave: fila.clave,
        dato: fila.dato,
        paraQue: fila.para_que,
        donde: `${fila.proveedor}, ${paisEnPalabras(fila.pais, fila.pais_confirmado)}`,
        plazo: fila.plazo,
        discrepancia: discrepancia ? textoDeDiscrepancia(discrepancia) : null,
      }
    }),
    borrados: registro.borrados.map((borrado) => ({ id: borrado.id, frase: fraseDeBorrado(borrado, registro.zona) })),
    revision: {
      ultima: registro.ultimaRevision
        ? instanteEnPalabras(registro.ultimaRevision, registro.zona, { anio: true })
        : null,
      vence: diaEnPalabras(registro.vence),
    },
  }
}
