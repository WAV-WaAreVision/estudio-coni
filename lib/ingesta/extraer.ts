import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import mammoth from "mammoth"
import { extractText, getDocumentProxy } from "unpdf"
import { Falla } from "@/lib/dominio/falla"

export type PaginaExtraida = { pagina: number | null; texto: string }

/** Nothing readable came out of the source: Coni sees this as-is. */
export class SinTexto extends Falla {
  constructor() {
    super("No encontré texto en el archivo.")
    this.name = "SinTexto"
  }
}

function conTexto(paginas: PaginaExtraida[]): PaginaExtraida[] {
  const utiles = paginas.filter((p) => p.texto.trim() !== "")
  if (utiles.length === 0) throw new SinTexto()
  return utiles
}

export async function extraerPdf(bytes: Uint8Array): Promise<PaginaExtraida[]> {
  // unpdf transfers the buffer to its worker, so hand it a copy to leave the caller's bytes intact.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  return conTexto(text.map((texto, i) => ({ pagina: i + 1, texto: texto.trim() })))
}

export async function extraerDocx(bytes: Uint8Array): Promise<PaginaExtraida[]> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return conTexto([{ pagina: null, texto: value.trim() }])
}

export function extraerTexto(bytes: Uint8Array): PaginaExtraida[] {
  return conTexto([{ pagina: null, texto: new TextDecoder("utf-8").decode(bytes).trim() }])
}

export async function extraerArticulo(
  html: string,
  url: string,
): Promise<{ titulo: string | null; paginas: PaginaExtraida[] }> {
  const dom = new JSDOM(html, { url })
  try {
    const articulo = new Readability(dom.window.document).parse()
    const texto = articulo?.textContent?.trim() ?? ""
    const paginas = conTexto([{ pagina: null, texto }])
    return { titulo: articulo?.title?.trim() || null, paginas }
  } finally {
    dom.window.close()
  }
}
