import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { pedirJson, sumarUso, type UsoClaude } from "./nucleo"

const IMAGENES_POR_PEDIDO = 20

const SalidaTextoEnImagenes = z.object({
  lecturas: z.array(z.object({ id: z.string(), texto: z.string(), idioma: z.string() })),
})

export interface TextoLeido {
  id: string
  texto: string
  idioma: string
}

const GUIA_DE_LECTURA = `Eres un lector de texto en imágenes. Recibes capturas de un video o fotos y copias el texto que aparece escrito en ellas: subtítulos quemados, rótulos, titulares, texto superpuesto.

REGLAS
- Transcribe solo el texto visible, de forma literal y en su idioma original, tal como está escrito.
- Sin describir la imagen, sin traducir, sin resumir y sin corregir.
- Si una imagen no tiene texto, devuelve una cadena vacía en texto y en idioma.
- Devuelve el idioma de cada texto como código ISO 639-1 en minúsculas (por ejemplo es, en, pt).
- Devuelve exactamente una lectura por imagen, con el mismo id que se te dio.`

function pedidoDeLectura(
  lote: readonly { id: string; jpeg: Uint8Array }[],
): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  return [
    { type: "text", text: "Lee el texto de cada una de estas imágenes. Cada imagen va precedida de su id." },
    ...lote.flatMap(({ id, jpeg }): Anthropic.Beta.Messages.BetaContentBlockParam[] => [
      { type: "text", text: `Imagen con id "${id}":` },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(jpeg).toString("base64") },
      },
    ]),
  ]
}

function exigirMismosIds(pedidos: readonly string[], lecturas: readonly TextoLeido[]): void {
  const recibidos = new Set(lecturas.map((l) => l.id))
  const coinciden =
    lecturas.length === pedidos.length && recibidos.size === pedidos.length && pedidos.every((id) => recibidos.has(id))
  if (!coinciden) {
    throw new Error("Claude devolvió ids de imagen que no coinciden con los pedidos.")
  }
}

/** Transcribes the text burned on screen in each image, in batches of 20. The ids of the answer must match the request. */
export async function leerTextoEnImagenes(entrada: {
  cliente: Anthropic
  imagenes: readonly { id: string; jpeg: Uint8Array }[]
}): Promise<{ lecturas: TextoLeido[]; uso: UsoClaude }> {
  const lecturas: TextoLeido[] = []
  let uso: UsoClaude = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  for (let desde = 0; desde < entrada.imagenes.length; desde += IMAGENES_POR_PEDIDO) {
    const lote = entrada.imagenes.slice(desde, desde + IMAGENES_POR_PEDIDO)
    const { salida, uso: usoDelLote } = await pedirJson(entrada.cliente, "leerTextoEnImagenes", {
      guia: GUIA_DE_LECTURA,
      usuario: pedidoDeLectura(lote),
      esquema: SalidaTextoEnImagenes,
    })
    exigirMismosIds(
      lote.map((i) => i.id),
      salida.lecturas,
    )
    const porId = new Map(salida.lecturas.map((l) => [l.id, l]))
    for (const { id } of lote) {
      const lectura = porId.get(id)
      if (lectura) lecturas.push(lectura)
    }
    uso = sumarUso(uso, usoDelLote)
  }
  return { lecturas, uso }
}
