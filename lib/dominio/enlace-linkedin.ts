import { Falla } from "@/lib/dominio/falla"

const SERVIDORES = new Set(["linkedin.com", "www.linkedin.com"])
// What LinkedIn copies for a post: /posts/<author>_<text>-activity-<id> or /feed/update/<urn>.
const RUTAS = ["/posts/", "/feed/update/"]

/**
 * The address of a post Coni pasted after uploading it to LinkedIn by hand. It is only read as text (never fetched): it
 * is kept if it is an https address of a post on linkedin.com, without credentials, port or tracking parameters. Empty
 * means "no link".
 */
export function enlaceDeLinkedIn(texto: string): string | null {
  const limpio = texto.trim()
  if (limpio === "") return null
  const invalido = new Falla("Ese enlace no parece de LinkedIn. Puedes dejarlo vacío.")
  let url: URL
  try {
    url = new URL(limpio)
  } catch (error) {
    if (error instanceof TypeError) throw invalido
    throw error
  }
  const esDeUnPost = RUTAS.some((ruta) => url.pathname.startsWith(ruta))
  if (
    url.protocol !== "https:" ||
    !SERVIDORES.has(url.hostname) ||
    url.port !== "" ||
    url.username ||
    url.password ||
    !esDeUnPost
  ) {
    throw invalido
  }
  return `${url.origin}${url.pathname}`
}
