// Ported from Ingesta's lib/ingesta/subida-cliente.ts. The bytes never pass through a server action.
import type { SubidaFirmada } from "@/lib/dominio/biblioteca/subir"

export const NO_PUDE_SUBIR = "No pude subir tus archivos. Inténtalo de nuevo."

interface Pedido {
  subidas: SubidaFirmada[]
  /** In the order she gave them: the file with `orden` n is `archivos[n - 1]`. */
  archivos: readonly File[]
  enviar?: typeof fetch
  alAvanzar?: (hechos: number, total: number) => void
}

/** Each signed upload with its file, matched by `orden`; any mismatch means nothing is sent at all. */
function emparejar(subidas: readonly SubidaFirmada[], archivos: readonly File[]) {
  const ordenes = new Set(subidas.map((subida) => subida.orden))
  if (subidas.length !== archivos.length || ordenes.size !== subidas.length) throw new Error(NO_PUDE_SUBIR)
  return subidas.map((subida) => {
    const archivo = archivos[subida.orden - 1]
    if (!archivo) throw new Error(NO_PUDE_SUBIR)
    return { subida, archivo }
  })
}

/** Puts each file straight to the store, one after another, with the content type that was signed into its URL. */
export async function subirArchivos({ subidas, archivos, enviar = fetch, alAvanzar }: Pedido): Promise<void> {
  const pares = emparejar(subidas, archivos)
  alAvanzar?.(0, pares.length)
  for (const [indice, { subida, archivo }] of pares.entries()) {
    const mensaje = `No pude subir ${archivo.name}. Revisa tu conexión e inténtalo de nuevo.`
    let respuesta: Response
    try {
      respuesta = await enviar(subida.url, {
        method: "PUT",
        headers: { "Content-Type": subida.tipoContenido },
        body: archivo,
      })
    } catch (error) {
      throw new Error(mensaje, { cause: error })
    }
    if (!respuesta.ok) throw new Error(mensaje)
    alAvanzar?.(indice + 1, pares.length)
  }
}
