import { HttpResponse, http } from "msw"
import { servidor } from "./msw"

export const OAUTH = "https://www.linkedin.com"
export const API = "https://api.linkedin.com"
export const SUBIDAS = "https://www.linkedin.com/dms-uploads"
export const PARTE = 4_194_304
export const DOCUMENTO = "urn:li:document:D5510AQprueba"
const SUBIDA_DOCUMENTO = `${SUBIDAS}/D5510AQprueba/ads-uploadedDocument/0`

export interface OpcionesLinkedin {
  /** Answers of GET /rest/videos/{urn}, in order; the last one repeats. */
  estados?: string[]
  token?: () => Response
  userinfo?: () => Response
  iniciar?: () => Response
  parte?: (indice: number) => Response
  finalizar?: () => Response
  video?: () => Response
  post?: () => Response
  /** Answers of GET /rest/documents/{urn}, in order; the last one repeats. */
  documentos?: string[]
  iniciarDocumento?: () => Response
  subidaDeDocumento?: () => Response
  /** Replaces the document read; may do work first (a test changes the database while LinkedIn processes). */
  documento?: () => Response | Promise<Response>
}

export interface SimulacionLinkedin {
  tokens: URLSearchParams[]
  iniciadas: unknown[]
  partes: { indice: number; bytes: number }[]
  finalizadas: unknown[]
  consultasDeVideo: string[]
  posts: Record<string, unknown>[]
  cabeceras: Record<string, string | null>[]
  documentosIniciados: unknown[]
  subidasDeDocumento: { datos: Uint8Array; autorizacion: string | null }[]
  consultasDeDocumento: string[]
}

/** LinkedIn for the tests: records what it was asked and never leaves the machine. */
export function simularLinkedin(opciones: OpcionesLinkedin = {}): SimulacionLinkedin {
  const sim: SimulacionLinkedin = {
    tokens: [],
    iniciadas: [],
    partes: [],
    finalizadas: [],
    consultasDeVideo: [],
    posts: [],
    cabeceras: [],
    documentosIniciados: [],
    subidasDeDocumento: [],
    consultasDeDocumento: [],
  }
  const estados = opciones.estados ?? ["AVAILABLE"]
  let consultas = 0
  let bytesDelVideo = 0
  const estadosDeDocumento = opciones.documentos ?? ["AVAILABLE"]
  let consultasDoc = 0
  const guardarCabeceras = (request: Request) =>
    sim.cabeceras.push({
      autorizacion: request.headers.get("authorization"),
      version: request.headers.get("linkedin-version"),
      protocolo: request.headers.get("x-restli-protocol-version"),
    })

  servidor.use(
    http.post(`${OAUTH}/oauth/v2/accessToken`, async ({ request }) => {
      sim.tokens.push(new URLSearchParams(await request.text()))
      return (
        opciones.token?.() ??
        HttpResponse.json({
          access_token: "AQV_token_de_prueba",
          expires_in: 5_184_000,
          scope: "openid,profile,w_member_social",
        })
      )
    }),
    http.get(`${API}/v2/userinfo`, ({ request }) => {
      guardarCabeceras(request)
      return opciones.userinfo?.() ?? HttpResponse.json({ sub: "abc123XYZ", name: "Coni del Rosario" })
    }),
    http.post(`${API}/rest/videos`, async ({ request }) => {
      guardarCabeceras(request)
      const accion = new URL(request.url).searchParams.get("action")
      const cuerpo = (await request.json()) as Record<string, { fileSizeBytes?: number }>
      if (accion === "initializeUpload") {
        sim.iniciadas.push(cuerpo)
        if (opciones.iniciar) return opciones.iniciar()
        bytesDelVideo = cuerpo.initializeUploadRequest?.fileSizeBytes ?? 0
        const partes = Math.max(1, Math.ceil(bytesDelVideo / PARTE))
        return HttpResponse.json({
          value: {
            video: "urn:li:video:C5505AQprueba",
            uploadToken: "",
            uploadUrlsExpireAt: 4_102_444_800_000,
            uploadInstructions: Array.from({ length: partes }, (_, i) => ({
              uploadUrl: `${SUBIDAS}/C5505AQprueba/parte/${i}`,
              firstByte: i * PARTE,
              lastByte: Math.min(bytesDelVideo, (i + 1) * PARTE) - 1,
            })),
          },
        })
      }
      sim.finalizadas.push(cuerpo)
      return opciones.finalizar?.() ?? new HttpResponse(null, { status: 200 })
    }),
    http.put(`${SUBIDAS}/C5505AQprueba/parte/:indice`, async ({ request, params }) => {
      const indice = Number(params.indice)
      sim.partes.push({ indice, bytes: (await request.arrayBuffer()).byteLength })
      return opciones.parte?.(indice) ?? new HttpResponse(null, { status: 200, headers: { etag: `"etag-${indice}"` } })
    }),
    http.get(`${API}/rest/videos/:urn`, ({ request, params }) => {
      guardarCabeceras(request)
      sim.consultasDeVideo.push(String(params.urn))
      if (opciones.video) return opciones.video()
      const estado = estados[Math.min(consultas, estados.length - 1)]
      consultas += 1
      return HttpResponse.json({
        id: "urn:li:video:C5505AQprueba",
        status: estado,
        ...(estado === "PROCESSING_FAILED" ? { processingFailureReason: "Formato no soportado" } : {}),
      })
    }),
    http.post(`${API}/rest/documents`, async ({ request }) => {
      guardarCabeceras(request)
      sim.documentosIniciados.push(await request.json())
      return (
        opciones.iniciarDocumento?.() ??
        HttpResponse.json({
          value: { uploadUrlExpiresAt: 4_102_444_800_000, uploadUrl: SUBIDA_DOCUMENTO, document: DOCUMENTO },
        })
      )
    }),
    http.put(SUBIDA_DOCUMENTO, async ({ request }) => {
      sim.subidasDeDocumento.push({
        datos: new Uint8Array(await request.arrayBuffer()),
        autorizacion: request.headers.get("authorization"),
      })
      return opciones.subidaDeDocumento?.() ?? new HttpResponse(null, { status: 201 })
    }),
    http.get(`${API}/rest/documents/:urn`, async ({ request, params }) => {
      guardarCabeceras(request)
      sim.consultasDeDocumento.push(String(params.urn))
      if (opciones.documento) return opciones.documento()
      const estado = estadosDeDocumento[Math.min(consultasDoc, estadosDeDocumento.length - 1)]
      consultasDoc += 1
      return HttpResponse.json({ id: DOCUMENTO, owner: "urn:li:person:abc123XYZ", status: estado })
    }),
    http.post(`${API}/rest/posts`, async ({ request }) => {
      guardarCabeceras(request)
      sim.posts.push((await request.json()) as Record<string, unknown>)
      return (
        opciones.post?.() ??
        new HttpResponse(null, { status: 201, headers: { "x-restli-id": `urn:li:share:7${sim.posts.length}` } })
      )
    }),
  )
  return sim
}
