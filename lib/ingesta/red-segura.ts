import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Falla } from "@/lib/dominio/falla"

/*
 * SSRF guard for the links Coni uploads. The task runs inside WAV's network, so a link must never reach loopback,
 * private, link-local or metadata addresses, neither directly nor through a redirect or a DNS answer.
 *
 * Choice on DNS rebinding: the host is resolved and every address validated immediately before each hop (the
 * resolver is injected), then the request goes out through `fetch`. `fetch` resolves the name again on its own, so a
 * hostile DNS server that answers differently between the two lookups could still win a very narrow race. Closing it
 * means pinning the connection to the validated IP (an undici dispatcher), which needs `undici` as a direct
 * dependency and is not worth it here: the task holds no secret a private address could return that WAV's other
 * defences (no cookies sent, response only parsed as text, never echoed back) do not already cover.
 */

/** The link is not something we may open: Coni sees this as-is. */
export class EnlaceNoPermitido extends Falla {
  constructor(motivo: string) {
    super(`Ese link no se puede abrir (${motivo}). Sube el texto o el archivo.`)
    this.name = "EnlaceNoPermitido"
  }
}

/** The page is bigger than we read: Coni sees this as-is. */
export class EnlaceDemasiadoGrande extends Falla {
  constructor(maximoMb: number) {
    super(`El link pesa más de ${maximoMb} MB. Sube el texto o el archivo.`)
    this.name = "EnlaceDemasiadoGrande"
  }
}

export type Resolver = (anfitrion: string) => Promise<string[]>
/** The system resolver: every address of the host, IPv4 and IPv6. */
export const resolverDns: Resolver = async (anfitrion) =>
  (await lookup(anfitrion, { all: true, verbatim: true })).map((a) => a.address)

export type FetchDeEnlace = (entrada: string | URL | Request, init?: RequestInit) => Promise<Response>

function ipv4(ip: string): number[] | null {
  const partes = ip.split(".")
  if (partes.length !== 4) return null
  const octetos = partes.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN))
  return octetos.every((o) => o >= 0 && o <= 255) ? octetos : null
}

function ipv4EsPublica([a = 0, b = 0, c = 0]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return a < 224
}

/** Eight 16-bit groups of an IPv6 address, or null when it is not one. */
function ipv6(ip: string): number[] | null {
  if (isIP(ip) !== 6) return null
  let texto = ip.split("%")[0] ?? ip
  const cola = texto.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (cola?.[1]) {
    const octetos = ipv4(cola[1])
    if (!octetos) return null
    const [a = 0, b = 0, c = 0, d = 0] = octetos
    texto = `${texto.slice(0, texto.length - cola[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [izquierda = "", derecha, resto] = texto.split("::")
  if (resto !== undefined) return null
  const lado = (s: string) => (s === "" ? [] : s.split(":").map((g) => Number.parseInt(g, 16)))
  const grupos =
    derecha === undefined
      ? lado(izquierda)
      : [
          ...lado(izquierda),
          ...Array.from({ length: 8 - lado(izquierda).length - lado(derecha).length }, () => 0),
          ...lado(derecha),
        ]
  return grupos.length === 8 && grupos.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? grupos : null
}

const aOctetos = (alto: number, bajo: number): number[] => [alto >> 8, alto & 0xff, bajo >> 8, bajo & 0xff]

function ipv6EsPublica(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return false
  // IPv4-mapped ::ffff:a.b.c.d is that IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) return ipv4EsPublica(aOctetos(g6, g7))
  // NAT64 well-known prefix 64:ff9b::/96 carries an IPv4 address; the local-use 64:ff9b:1::/48 is never public.
  if (g0 === 0x64 && g1 === 0xff9b)
    return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && ipv4EsPublica(aOctetos(g6, g7))
  // Only global unicast 2000::/3 is public.
  if ((g0 & 0xe000) !== 0x2000) return false
  // Documentation 2001:db8::/32 and Teredo 2001::/32.
  if (g0 === 0x2001 && (g1 === 0x0db8 || g1 === 0)) return false
  // 6to4 carries an IPv4 address.
  if (g0 === 0x2002) return ipv4EsPublica(aOctetos(g1, g2))
  return true
}

/** True only for a literal address that is globally routable. Anything else, a name included, is false. */
export function esDireccionPublica(ip: string): boolean {
  const cuatro = ipv4(ip)
  if (cuatro) return ipv4EsPublica(cuatro)
  const seis = ipv6(ip)
  return seis ? ipv6EsPublica(seis) : false
}

const PUERTOS_PERMITIDOS = new Set(["", "80", "443"])
const SUFIJOS_INTERNOS = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"]

function sinCorchetes(anfitrion: string): string {
  return anfitrion.replace(/^\[|\]$/g, "")
}

/** The URL if it is http(s) on a default port, without credentials and not pointing at an obviously internal name. */
export function validarUrlDeEnlace(texto: string): URL {
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    // `new URL` only says it failed; the reason Coni needs is the same whatever the malformed text was.
    throw new EnlaceNoPermitido("no es una dirección válida")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new EnlaceNoPermitido("solo links http o https")
  if (url.username !== "" || url.password !== "") throw new EnlaceNoPermitido("trae usuario y clave")
  if (!PUERTOS_PERMITIDOS.has(url.port)) throw new EnlaceNoPermitido("usa un puerto no permitido")
  const anfitrion = sinCorchetes(url.hostname).toLowerCase()
  if (anfitrion === "" || anfitrion === "localhost" || SUFIJOS_INTERNOS.some((s) => anfitrion.endsWith(s))) {
    throw new EnlaceNoPermitido("es una dirección interna")
  }
  if (isIP(anfitrion) !== 0 && !esDireccionPublica(anfitrion)) throw new EnlaceNoPermitido("es una dirección interna")
  return url
}

/** Resolves the host and requires every address it answers to be public. A literal address is checked as it is. */
async function exigirAnfitrionPublico(url: URL, resolver: Resolver): Promise<void> {
  const anfitrion = sinCorchetes(url.hostname)
  const direcciones = isIP(anfitrion) !== 0 ? [anfitrion] : await resolver(anfitrion)
  if (direcciones.length === 0) throw new EnlaceNoPermitido("no encuentro esa dirección")
  if (!direcciones.every(esDireccionPublica)) throw new EnlaceNoPermitido("es una dirección interna")
}

export interface RespuestaDeEnlace {
  estado: number
  /** The URL after the redirects. */
  url: string
  /** The media type without parameters, lowercased; empty when the server sent none. */
  tipo: string
  bytes: Uint8Array
}

export const ESPERA_ENLACE_MS = 15_000
export const MAXIMO_BYTES_ENLACE = 5 * 1024 * 1024
export const MAXIMO_REDIRECCIONES = 5
const ESTADOS_DE_REDIRECCION = new Set([301, 302, 303, 307, 308])

async function leerConTope(respuesta: Response, maximoBytes: number): Promise<Uint8Array> {
  const anunciado = Number(respuesta.headers.get("content-length"))
  const maximoMb = Math.round(maximoBytes / (1024 * 1024))
  if (Number.isFinite(anunciado) && anunciado > maximoBytes) {
    await respuesta.body?.cancel()
    throw new EnlaceDemasiadoGrande(maximoMb)
  }
  const lector = respuesta.body?.getReader()
  if (!lector) return new Uint8Array()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > maximoBytes) {
      await lector.cancel()
      throw new EnlaceDemasiadoGrande(maximoMb)
    }
    trozos.push(value)
  }
  const bytes = new Uint8Array(total)
  let desde = 0
  for (const trozo of trozos) {
    bytes.set(trozo, desde)
    desde += trozo.byteLength
  }
  return bytes
}

/**
 * GET with the guard: only http(s), every hop resolved and validated right before it is requested, redirects followed
 * by hand (at most 5), one 15 s deadline for the whole thing and a 5 MB cap on the body. A slow or failing network is
 * a plain Error (Trigger.dev retries it); a refused link is a Falla for Coni.
 */
export async function descargarEnlace(entrada: {
  url: string
  fetch: FetchDeEnlace
  resolver: Resolver
  esperaMs?: number
  maximoBytes?: number
  maximoRedirecciones?: number
}): Promise<RespuestaDeEnlace> {
  const maximoBytes = entrada.maximoBytes ?? MAXIMO_BYTES_ENLACE
  const maximoRedirecciones = entrada.maximoRedirecciones ?? MAXIMO_REDIRECCIONES
  const senal = AbortSignal.timeout(entrada.esperaMs ?? ESPERA_ENLACE_MS)
  let actual = validarUrlDeEnlace(entrada.url)
  for (let salto = 0; ; salto++) {
    await exigirAnfitrionPublico(actual, entrada.resolver)
    let respuesta: Response
    try {
      respuesta = await entrada.fetch(actual.href, {
        method: "GET",
        redirect: "manual",
        signal: senal,
        headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "user-agent": "ConidollyBot/1.0" },
      })
    } catch (error) {
      throw new Error("No pude abrir el link.", { cause: error })
    }
    const destino = ESTADOS_DE_REDIRECCION.has(respuesta.status) ? respuesta.headers.get("location") : null
    if (destino) {
      await respuesta.body?.cancel()
      if (salto >= maximoRedirecciones) throw new EnlaceNoPermitido("tiene demasiadas redirecciones")
      actual = validarUrlDeEnlace(new URL(destino, actual).href)
      continue
    }
    try {
      const bytes = await leerConTope(respuesta, maximoBytes)
      const tipo = (respuesta.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
      return { estado: respuesta.status, url: actual.href, tipo, bytes }
    } catch (error) {
      if (error instanceof Falla) throw error
      throw new Error("No pude leer el link.", { cause: error })
    }
  }
}
