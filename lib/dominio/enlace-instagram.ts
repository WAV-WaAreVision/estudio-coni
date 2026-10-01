import { Falla } from "@/lib/dominio/falla"

const SERVIDORES = new Set(["instagram.com", "www.instagram.com"])

/**
 * The address of a reel Coni pasted after uploading it by hand. It is only read as text (never fetched): it is kept if it
 * is an https address on instagram.com, without credentials, port or tracking parameters. Empty means "no link".
 */
export function enlaceDeInstagram(texto: string): string | null {
  const limpio = texto.trim()
  if (limpio === "") return null
  const invalido = new Falla("Ese enlace no parece de Instagram. Pégalo tal como lo copiaste desde la app.")
  let url: URL
  try {
    url = new URL(limpio)
  } catch (error) {
    if (error instanceof TypeError) throw invalido
    throw error
  }
  if (url.protocol !== "https:" || !SERVIDORES.has(url.hostname) || url.port !== "" || url.username || url.password) {
    throw invalido
  }
  return `${url.origin}${url.pathname}`
}
