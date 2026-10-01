import { HttpResponse, http } from "msw"
import { servidor } from "./msw"

const BASE = "https://graph.instagram.com"
export const VERSION = "v25.0"

export interface CuerpoDeContenedor {
  media_type?: string
  video_url?: string
  caption?: string
  is_ai_generated?: boolean
  access_token?: string
}

export interface EstadoSimulado {
  status_code: string
  status?: string
}

export interface OpcionesInstagram {
  cuenta: string
  /** The answers of the status call, in order, for the whole run; the last one repeats. */
  estados?: (string | EstadoSimulado)[]
  /** Replaces the answer of the container creation. */
  crear?: () => Response | Promise<Response>
  /** Replaces the answer of `media_publish`. */
  publicar?: () => Response | Promise<Response>
  /** Changes what the read-back returns, given what Instagram would honestly return for the last container. */
  leer?: (honesta: Record<string, unknown>) => Record<string, unknown>
}

export interface SimulacionInstagram {
  contenedores: CuerpoDeContenedor[]
  publicaciones: { creation_id?: string; access_token?: string }[]
  consultasDeEstado: string[]
  lecturas: string[]
  renovaciones: string[]
}

/** The Instagram Graph API of the tests: what it was asked for is recorded, and nothing leaves the machine. */
export function simularInstagram(opciones: OpcionesInstagram): SimulacionInstagram {
  const simulacion: SimulacionInstagram = {
    contenedores: [],
    publicaciones: [],
    consultasDeEstado: [],
    lecturas: [],
    renovaciones: [],
  }
  const estados = opciones.estados ?? ["FINISHED"]
  let consultas = 0
  servidor.use(
    http.post(`${BASE}/${VERSION}/${opciones.cuenta}/media`, async ({ request }) => {
      const cuerpo = (await request.json()) as CuerpoDeContenedor
      simulacion.contenedores.push(cuerpo)
      if (opciones.crear) return opciones.crear()
      return HttpResponse.json({ id: `contenedor_${simulacion.contenedores.length}` })
    }),
    http.post(`${BASE}/${VERSION}/${opciones.cuenta}/media_publish`, async ({ request }) => {
      simulacion.publicaciones.push((await request.json()) as { creation_id?: string })
      if (opciones.publicar) return opciones.publicar()
      return HttpResponse.json({ id: `media_${simulacion.publicaciones.length}` })
    }),
    http.get(`${BASE}/${VERSION}/:id`, ({ request, params }) => {
      const id = String(params.id)
      const campos = new URL(request.url).searchParams.get("fields") ?? ""
      if (campos.includes("status_code")) {
        simulacion.consultasDeEstado.push(id)
        const siguiente = estados[Math.min(consultas, estados.length - 1)] ?? "FINISHED"
        consultas += 1
        const estado = typeof siguiente === "string" ? { status_code: siguiente } : siguiente
        return HttpResponse.json({ id, ...estado })
      }
      simulacion.lecturas.push(id)
      const ultimo = simulacion.contenedores.at(-1)
      const honesta: Record<string, unknown> = {
        id,
        caption: ultimo?.caption,
        permalink: `https://www.instagram.com/reel/${id}/`,
        media_product_type: "REELS",
        ...(ultimo?.is_ai_generated === undefined ? {} : { is_ai_generated: ultimo.is_ai_generated }),
      }
      return HttpResponse.json(opciones.leer ? opciones.leer(honesta) : honesta)
    }),
    http.get(`${BASE}/refresh_access_token`, ({ request }) => {
      simulacion.renovaciones.push(new URL(request.url).searchParams.get("access_token") ?? "")
      return HttpResponse.json({ access_token: "IGAA_renovado", token_type: "bearer", expires_in: 5183944 })
    }),
  )
  return simulacion
}
