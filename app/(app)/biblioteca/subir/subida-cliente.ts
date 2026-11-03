// Ported from Ingesta's lib/ingesta/subida-cliente.ts. The bytes never pass through a server action.
import type { SubidaFirmada } from "@/lib/dominio/biblioteca/subir"

interface Pedido {
  subidas: SubidaFirmada[]
  /** In the same order as `subidas`. */
  archivos: readonly File[]
  enviar?: typeof fetch
  alAvanzar?: (hechos: number, total: number) => void
}

/** Puts each file straight to the store, one after another, with the content type that was signed into its URL. */
export async function subirArchivos({ subidas, archivos, enviar = fetch, alAvanzar }: Pedido): Promise<void> {
  alAvanzar?.(0, subidas.length)
  for (const [indice, subida] of subidas.entries()) {
    const archivo = archivos[indice]
    if (!archivo) throw new Error(`Falta el archivo ${subida.orden} para subirlo.`)
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
    alAvanzar?.(indice + 1, subidas.length)
  }
}
