import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type Almacen, almacenReal } from "@/lib/proveedores/almacen"

const UNA_HORA_S = 60 * 60
/** A download link is for one tap: ten minutes is plenty and a copied link dies quickly. */
const DIEZ_MINUTOS_S = 10 * 60

/** For the local E2E run only (the same switch as the recorded runs): signs nothing, the test serves the files. */
const almacenDePrueba: Pick<Almacen, "urlFirmada"> = {
  async urlFirmada(clave, segundos, opciones = {}) {
    // The plain link stays as it was for the screens that only play the file.
    if (!opciones.descargarComo) return `https://almacen.test/${clave}`
    return `https://almacen.test/${clave}?expira=${segundos}&descarga=${opciones.descargarComo}`
  },
}

function almacenDePantallas(entorno: Record<string, string | undefined>): Pick<Almacen, "urlFirmada"> {
  if (entorno.DISPARO_DE_PRUEBA === "1") {
    if (entorno.VERCEL) throw new FallaDeConfiguracion("DISPARO_DE_PRUEBA no puede estar activo en Vercel.")
    return almacenDePrueba
  }
  return almacenReal()
}

/**
 * A link to play a stored voice or video for an hour. The signature is the only secret in it; the R2 keys stay on
 * the server. Null when it cannot be signed (the screen then says so and blocks the approval).
 */
export async function urlParaVer(clave: string | null, entorno: Record<string, string | undefined> = process.env) {
  if (clave === null) return null
  try {
    return await almacenDePantallas(entorno).urlFirmada(clave, UNA_HORA_S)
  } catch (error) {
    console.error(`No pude firmar el enlace de ${clave}`, error)
    return null
  }
}

/**
 * A signed link that downloads the file with a name she will recognise. It goes straight to R2 from her phone; the
 * video never passes through a function of ours. Null when it cannot be signed.
 */
export async function urlParaDescargar(
  clave: string,
  nombreDeArchivo: string,
  entorno: Record<string, string | undefined> = process.env,
) {
  try {
    return await almacenDePantallas(entorno).urlFirmada(clave, DIEZ_MINUTOS_S, { descargarComo: nombreDeArchivo })
  } catch (error) {
    console.error(`No pude firmar la descarga de ${clave}`, error)
    return null
  }
}
