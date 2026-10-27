import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/** Under the fonts folder (`CONI_FONTSDIR` or `assets/fuentes`): see assets/fuentes/README.md. */
export const ARCHIVO_DE_LA_FUENTE = "carrusel/Newsreader.ttf"

/** The committed serif as a data URL for the template. A missing file is a configuration error: no retry fixes it. */
export async function fuenteDelCarrusel(carpeta: string): Promise<string> {
  const ruta = join(carpeta, ARCHIVO_DE_LA_FUENTE)
  let bytes: Buffer
  try {
    bytes = await readFile(ruta)
  } catch (error) {
    throw new FallaDeConfiguracion(
      `Falta la letra del carrusel en ${ruta}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return `data:font/ttf;base64,${bytes.toString("base64")}`
}
