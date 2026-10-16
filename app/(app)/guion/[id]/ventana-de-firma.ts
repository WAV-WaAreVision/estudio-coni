import { z } from "zod"
import { type Estado, restoDeVentana } from "@/lib/dominio/estados"
import { TEXTO_DESHECHO } from "./textos"

/** The version she signed at, from the address gate 1 opens after the signature; any other value is ignored. */
const versionFirmada = z.coerce.number().int().positive()

/**
 * The undo of a fresh signature on the video screen: the time left of the window, on the same server clock the undo
 * is checked against (0 once it is over, or on a render stopped with a reason), and the version the undo sends.
 */
export function ventanaDeDeshacer(
  fila: { estado: Estado; explicacion: string | null; version: number; firmaEn: string | null },
  firmada: string | undefined,
  ahora: string,
): { quedanMs: number; version: number } {
  const { firmaEn } = fila
  const enLaDireccion = versionFirmada.safeParse(firmada)
  return {
    quedanMs:
      fila.estado === "en_render" && fila.explicacion === null && firmaEn !== null ? restoDeVentana(firmaEn, ahora) : 0,
    version: enLaDireccion.success ? enLaDireccion.data : fila.version,
  }
}

/** The toast gate 1 opens with after an undo (`?deshecho=1`); only while the script is back at gate 1. */
export const avisoAlVolver = (deshecho: string | undefined, estado: Estado) =>
  deshecho === "1" && estado === "guion_por_aprobar" ? TEXTO_DESHECHO : null
