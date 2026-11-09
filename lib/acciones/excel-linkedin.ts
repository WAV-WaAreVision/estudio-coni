import { z } from "zod"
import { guardarExcelDeLinkedin, leerPublicacionesDeLinkedin } from "@/lib/datos/excel-linkedin"
import { leerZona } from "@/lib/datos/metricas"
import { Falla } from "@/lib/dominio/falla"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { cruzarConPiezas, type Dudoso } from "@/lib/metricas/excel-linkedin/cruzar"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"
import {
  ERROR_MUY_GRANDE,
  ERROR_NO_ES_EL_EXCEL,
  resumenDeDudosos,
  resumenDeImportacion,
  TAMANO_MAXIMO,
} from "@/lib/metricas/excel-linkedin/resumen"
import type { Notificador } from "@/lib/proveedores/avisos"
import { avisarErrorDePantalla } from "./error-de-pantalla"
import type { DepsAcciones } from "./piezas"
import { aResultado, ERROR_GENERICO, type Resultado } from "./resultado"

export interface DepsExcelDeLinkedin extends Pick<DepsAcciones, "db" | "ahora"> {
  avisos: () => Notificador
}

export interface ImportacionDeLinkedin {
  /** The day the readings carry: the last day of the Excel's period. */
  medidoEn: string
  resumen: string[]
  dudosos: Dudoso[]
}

/** The line WAV reads in the email, as the error screens pass theirs (letters and spaces only). */
export const REGISTRO_DEL_IMPORTADOR = "Importar Excel de LinkedIn"

/** The Monday of a calendar day: noon UTC keeps the day whatever the zone. */
export const lunesDe = (dia: string): string => lunesDeLaSemana(Date.parse(`${dia}T12:00:00Z`), "UTC")

/** A failure of ours reaches WAV through the screen error notice (spec, Errors); hers (a wrong file) does not. */
export async function avisandoAWav<T extends object>(
  deps: DepsExcelDeLinkedin,
  resultado: Resultado<T>,
): Promise<Resultado<T>> {
  if (resultado.ok || resultado.error !== ERROR_GENERICO) return resultado
  const aviso = await avisarErrorDePantalla(deps, { registro: REGISTRO_DEL_IMPORTADOR })
  if (!aviso.ok) console.error("No pude avisarle a WAV del Excel de LinkedIn", aviso.error)
  return resultado
}

/** Decision 4: save directly what is safe, then summarise; the doubtful hand uploads go back for her to pick. */
export async function importarExcelDeLinkedin(
  deps: DepsExcelDeLinkedin,
  archivo: Blob,
): Promise<Resultado<ImportacionDeLinkedin>> {
  const resultado = await aResultado("importarExcelDeLinkedin", async () => {
    if (archivo.size > TAMANO_MAXIMO) throw new Falla(ERROR_MUY_GRANDE)
    const leidas = await leerHojas(archivo)
    if (!leidas.ok) throw new Falla(ERROR_NO_ES_EL_EXCEL)
    const lectura = leerExcelDeLinkedin(leidas.hojas)
    if (!lectura.ok) {
      // Same words for Coni whatever the cause; the cause stays in the log for WAV.
      console.warn(`El Excel de LinkedIn no se pudo leer: ${lectura.error}`)
      throw new Falla(ERROR_NO_ES_EL_EXCEL)
    }
    const { excel } = lectura
    const [zona, publicaciones] = await Promise.all([leerZona(deps.db), leerPublicacionesDeLinkedin(deps.db)])
    const cruce = cruzarConPiezas(excel, publicaciones, zona)
    const medidoEn = excel.periodo.hasta
    const guardadas = await guardarExcelDeLinkedin(deps.db, {
      medidoEn,
      semana: lunesDe(medidoEn),
      posts: cruce.seguros,
      seguidores: excel.seguidores,
    })
    return {
      medidoEn,
      dudosos: cruce.dudosos,
      resumen: resumenDeImportacion({
        guardadas,
        coincidentes: cruce.seguros.length,
        seguidores: excel.seguidores,
        ajenas: cruce.ajenas,
        faltanEnElPeriodo: cruce.faltanEnElPeriodo,
        llegoAlTope: excel.llegoAlTope,
        dudosos: cruce.dudosos.length,
      }),
    }
  })
  return avisandoAWav(deps, resultado)
}

const CIFRA = z.number().int().min(0).max(999_999_999).nullable()

/** Her picks for the doubtful hand uploads: each piece once, each Excel post for one piece. */
export const ESQUEMA_DE_DUDOSOS = z.object({
  medidoEn: z.iso.date(),
  elegidos: z
    .array(
      z.object({
        piezaId: z.uuid(),
        clave: z.string().regex(/^(share|ugcPost):\d{1,20}$/),
        impresiones: CIFRA,
        interacciones: CIFRA,
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (elegidos) => new Set(elegidos.map((e) => e.piezaId)).size === elegidos.length,
      "Una publicación va una vez.",
    )
    .refine(
      (elegidos) => new Set(elegidos.map((e) => e.clave)).size === elegidos.length,
      "Un post va con una publicación.",
    ),
})

export const ERROR_MISMO_POST =
  "Elegiste el mismo post del Excel para dos publicaciones. Elige uno distinto para cada una."

/** Saves what she picked through the same RPC as the import; the followers were already saved then. */
export async function guardarDudososDeLinkedin(
  deps: DepsExcelDeLinkedin,
  entrada: z.output<typeof ESQUEMA_DE_DUDOSOS>,
): Promise<Resultado<{ resumen: string[] }>> {
  const resultado = await aResultado("guardarDudososDeLinkedin", async () => {
    if (new Set(entrada.elegidos.map((e) => e.clave)).size !== entrada.elegidos.length) {
      throw new Falla(ERROR_MISMO_POST)
    }
    const guardadas = await guardarExcelDeLinkedin(deps.db, {
      medidoEn: entrada.medidoEn,
      semana: lunesDe(entrada.medidoEn),
      posts: entrada.elegidos.map(({ piezaId, impresiones, interacciones }) => ({
        piezaId,
        impresiones,
        interacciones,
      })),
      seguidores: null,
    })
    return { resumen: resumenDeDudosos(guardadas) }
  })
  return avisandoAWav(deps, resultado)
}
