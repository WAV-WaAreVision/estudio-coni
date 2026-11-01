import type { AnotarBorrado } from "@/lib/datos-personales/borrados"
import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Notificador } from "@/lib/proveedores/avisos"

export interface DepsRespaldo {
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
  /** The gzipped `pg_dump` of the database (`volcarConPgDump` in production). */
  volcarBase: () => Promise<Uint8Array>
  /** The deletion log (`registro_de_borrados`). */
  anotarBorrado: AnotarBorrado
}

export type ResultadoRespaldo =
  | { estado: "guardado"; clave: string; bytes: number }
  | { estado: "mas_chico"; clave: string; bytes: number }
  | { estado: "vacio" }
  | { estado: "fallo" }

const PREFIJO = "respaldos/"
const SUFIJO = ".sql.gz"
const DIAS_DE_HISTORIA = REGLAS_DE_BORRADO.respaldos
const DIA_MS = 86_400_000
/** Design D6: a dump under 80% of the previous one is as suspicious as an empty one. */
const PROPORCION_MINIMA = 0.8
const CLAVE_CON_FECHA = /^respaldos\/(\d{4}-\d{2}-\d{2})\.sql\.gz$/

/** The calendar day in America/Santiago (design Q4): `en-CA` formats as YYYY-MM-DD. */
function fechaEnSantiago(instante: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante))
}

function fechaDe(clave: string): string | null {
  return CLAVE_CON_FECHA.exec(clave)?.[1] ?? null
}

/**
 * The nightly backup of the database (design D6): `respaldos/AAAA-MM-DD.sql.gz` in R2, as many days of history as
 * `REGLAS_DE_BORRADO.respaldos`, and an alert for WAV when the dump fails, comes out empty or weighs under 80% of the
 * previous one. An empty dump is not stored, so it never becomes the file the next night is compared with.
 */
export async function respaldarBase(deps: DepsRespaldo): Promise<ResultadoRespaldo> {
  const ahora = Date.parse(deps.ahora())
  const hoy = fechaEnSantiago(ahora)
  const clave = `${PREFIJO}${hoy}${SUFIJO}`

  let volcado: Uint8Array
  try {
    volcado = await deps.volcarBase()
  } catch (error) {
    if (!(error instanceof Error)) throw error
    await deps.avisos.aWav("Falló el respaldo de la base", `No pude volcar la base el ${hoy}: ${error.message}`)
    return { estado: "fallo" }
  }
  if (volcado.byteLength === 0) {
    await deps.avisos.aWav(
      "El respaldo de la base salió vacío",
      `El volcado del ${hoy} no tiene contenido y no lo guardé.`,
    )
    return { estado: "vacio" }
  }

  const existentes = await deps.almacen.listar(PREFIJO)
  const anterior = existentes
    .flatMap((objeto) => {
      const fecha = fechaDe(objeto.clave)
      return fecha !== null && fecha < hoy ? [{ fecha, bytes: objeto.bytes }] : []
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .at(-1)

  await deps.almacen.subir(clave, volcado, "application/gzip")

  // Older than the history: dated keys only, whatever else lives under the prefix stays.
  const corte = fechaEnSantiago(ahora - DIAS_DE_HISTORIA * DIA_MS)
  let borrados = 0
  try {
    for (const objeto of existentes) {
      const fecha = fechaDe(objeto.clave)
      if (fecha !== null && fecha < corte) {
        await deps.almacen.borrar(objeto.clave)
        borrados += 1
      }
    }
  } catch (error) {
    // What was already deleted stays deleted: write it down, then fail with the store's own error.
    if (borrados > 0) {
      try {
        await deps.anotarBorrado("respaldos", borrados)
      } catch (falloDelRegistro) {
        throw new AggregateError([error, falloDelRegistro], "Falló el borrado de respaldos y también su registro.")
      }
    }
    throw error
  }

  let resultado: ResultadoRespaldo = { estado: "guardado", clave, bytes: volcado.byteLength }
  if (anterior && volcado.byteLength < anterior.bytes * PROPORCION_MINIMA) {
    await deps.avisos.aWav(
      "El respaldo de la base pesa mucho menos que el anterior",
      `El volcado del ${hoy} pesa ${volcado.byteLength} bytes y el del ${anterior.fecha} pesaba ${anterior.bytes}: menos del 80 %.`,
    )
    resultado = { estado: "mas_chico", clave, bytes: volcado.byteLength }
  }
  // Last, so a failed log fails the step after the backup and its alerts are done; the deletion stands.
  if (borrados > 0) await deps.anotarBorrado("respaldos", borrados)
  return resultado
}
