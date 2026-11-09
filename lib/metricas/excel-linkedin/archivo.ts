import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError } from "read-excel-file/node"
import type { HojasDelExcel } from "./leer"

export type HojasLeidas = { ok: true; hojas: HojasDelExcel } | { ok: false; error: "no_es_el_excel" }

/** LinkedIn writes every value as text; a cell some other tool typed is read the same way. Blank is "". */
function comoTexto(celda: unknown): string {
  if (celda === null || celda === undefined) return ""
  if (celda instanceof Date) return `${celda.getUTCDate()}/${celda.getUTCMonth() + 1}/${celda.getUTCFullYear()}`
  return String(celda).trim()
}

/** The uploaded file as text rows per sheet. A file that is not an .xlsx is an answer for Coni, not a failure. */
export async function leerHojas(archivo: Blob): Promise<HojasLeidas> {
  let hojas: Awaited<ReturnType<typeof readXlsxFile>>
  try {
    hojas = await readXlsxFile(Buffer.from(await archivo.arrayBuffer()))
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof InvalidSpreadsheetError) {
      return { ok: false, error: "no_es_el_excel" }
    }
    throw error
  }
  return { ok: true, hojas: new Map(hojas.map(({ sheet, data }) => [sheet, data.map((fila) => fila.map(comoTexto))])) }
}
