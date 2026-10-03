import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import { type AlmacenEnMemoria, almacenEnMemoria, claveMaterial } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"

const ejecutar = promisify(execFile)

export const URL_CLAUDE = "https://api.anthropic.com/v1/messages"
export const URL_SCRIBE = "https://api.elevenlabs.io/v1/speech-to-text"
export const USO = {
  input_tokens: 1000,
  output_tokens: 100,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
/** What one Opus call of `USO` costs (the card). */
export const COSTO_CLAUDE = 0.006
/** What one Sonnet call of `USO` costs (vision, translation). */
export const COSTO_CLAUDE_SONNET = 0.003

// No accents: the test PDFs are written in a Latin-1 font that mangles them.
export const TEXTO_CHILENO =
  "El deseo sexual cambia a lo largo de la vida de una pareja y eso es parte de lo que pasa en la casa. Hablar de lo que cada persona necesita ayuda a que la conversacion sea mas facil para todos."

const materiales: string[] = []

export async function limpiar(): Promise<void> {
  for (const id of materiales.splice(0)) {
    await pool.query("delete from public.gastos where clave like $1", [`material:${id}:%`])
    await pool.query("delete from public.materiales where id = $1", [id])
  }
}

export interface ArchivoDePrueba {
  extension: string
  datos: Uint8Array
  tipo?: string
}

export interface MaterialDePrueba {
  tipo: "documento" | "link" | "audio" | "video" | "imagen" | "post"
  titulo?: string | null
  autor?: string | null
  origen_url?: string | null
  texto_pegado?: string | null
  archivo?: ArchivoDePrueba
  /** Image files in upload order. */
  archivos?: ArchivoDePrueba[]
}

export async function crearMaterial(almacen: AlmacenEnMemoria, datos: MaterialDePrueba): Promise<string> {
  const id = crypto.randomUUID()
  const categoria = await pool.query<{ id: string }>("select id from public.categorias where slug = 'general'")
  const categoriaId = categoria.rows[0]?.id
  if (!categoriaId) throw new Error("Falta la categoría general")
  let archivoClave: string | null = null
  if (datos.archivo) {
    archivoClave = claveMaterial(id, datos.archivo.extension)
    await almacen.subir(archivoClave, datos.archivo.datos, datos.archivo.tipo ?? "application/octet-stream")
  }
  // The table requires some content on the row; an image set points at its first file, like an upload would.
  const primera = datos.archivos?.[0]
  if (!archivoClave && primera) archivoClave = claveMaterial(id, primera.extension, 1)
  await pool.query(
    `insert into public.materiales (id, tipo, titulo, autor, categoria_id, origen_url, archivo_clave, texto_pegado,
       declaracion_sin_pacientes_en, subido_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)`,
    [
      id,
      datos.tipo,
      datos.titulo ?? null,
      datos.autor ?? null,
      categoriaId,
      datos.origen_url ?? null,
      archivoClave,
      datos.texto_pegado ?? null,
      CONI,
    ],
  )
  materiales.push(id)
  for (const [i, archivo] of (datos.archivos ?? []).entries()) {
    const clave = claveMaterial(id, archivo.extension, i + 1)
    await almacen.subir(clave, archivo.datos, archivo.tipo ?? "application/octet-stream")
    await pool.query("insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1, $2, $3)", [
      id,
      i + 1,
      clave,
    ])
  }
  return id
}

export interface FilaMaterial {
  estado: string
  motivo_fallo: string | null
  texto_clave: string | null
  idioma_original: string | null
  autor: string | null
  titulo: string | null
}

export async function material(id: string): Promise<FilaMaterial> {
  const { rows } = await pool.query<FilaMaterial>(
    "select estado, motivo_fallo, texto_clave, idioma_original, autor, titulo from public.materiales where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe el material ${id}`)
  return fila
}

export interface FilaFicha {
  resumen: string
  ideas_clave: string[]
  citas: unknown[]
  fuente: { autor: string | null; anio: number | null; enlace: string | null }
}

export async function ficha(id: string): Promise<FilaFicha | undefined> {
  const { rows } = await pool.query<FilaFicha>(
    "select resumen, ideas_clave, citas, fuente from public.fichas where material_id = $1",
    [id],
  )
  return rows[0]
}

export interface FilaGasto {
  proveedor: string
  paso: string
  estado: string
  real: number | null
}

export async function gastos(id: string): Promise<FilaGasto[]> {
  const { rows } = await pool.query<FilaGasto>(
    `select proveedor, paso, estado, real_usd::float8 as real from public.gastos where clave like $1 order by id`,
    [`material:${id}:%`],
  )
  return rows
}

export function texto(almacen: AlmacenEnMemoria, id: string, nombre: string): string | undefined {
  const objeto = almacen.obtener(`materiales/${id}/${nombre}`)
  return objeto ? new TextDecoder().decode(objeto.datos) : undefined
}

export async function deps(almacen: AlmacenEnMemoria, extra: Partial<DepsProcesar> = {}): Promise<DepsProcesar> {
  return {
    db: clienteDeServicio(),
    almacen,
    fetch: (entrada, init) => fetch(entrada, init),
    resolver: async () => ["93.184.216.34"],
    claude: new Anthropic({ apiKey: "sk-ant-de-prueba", maxRetries: 0 }),
    llaveElevenlabs: async () => "sk_eleven_de_prueba",
    ffmpeg: await ffmpegDePrueba(),
    ahora: () => new Date().toISOString(),
    corrida: `run_${crypto.randomUUID()}`,
    ...extra,
  }
}

export { almacenEnMemoria }

async function ffmpegDePrueba(): Promise<string | undefined> {
  const { buscarFfmpegBasico } = await import("@/lib/ingesta/fotogramas")
  return (await buscarFfmpegBasico()) ?? undefined
}

function mensajeClaude(salida: unknown) {
  return {
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(salida) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USO,
  }
}

interface CuerpoClaude {
  messages: { content: unknown }[]
}

export interface OpcionesClaude {
  autorSugerido?: string | null
  /** Idioma que Claude dice reconocer en la detección. */
  idioma?: string
  fichaFalla?: boolean
  /** The model "adapts" the parts but loses one, which the adapter step rejects. */
  adaptacionRota?: boolean
  /** What the vision call reads in the image with this id. */
  lectura?: (id: string) => string
}

export interface LlamadasClaude {
  fichas: string[]
  visiones: string[][]
  adaptaciones: string[]
  idiomas: number
  total: number
}

export function simularClaude(opciones: OpcionesClaude = {}): LlamadasClaude {
  const llamadas: LlamadasClaude = { fichas: [], visiones: [], adaptaciones: [], idiomas: 0, total: 0 }
  servidor.use(
    http.post<never, CuerpoClaude>(URL_CLAUDE, async ({ request }) => {
      llamadas.total += 1
      const cuerpo = await request.json()
      const contenido = cuerpo.messages[0]?.content
      const texto = typeof contenido === "string" ? contenido : JSON.stringify(contenido)
      if (texto.includes("Lee el texto de cada una")) {
        const ids = [...texto.matchAll(/Imagen con id \\"([^\\"]+)\\"/g)].map((m) => m[1] ?? "")
        llamadas.visiones.push(ids)
        const leer = opciones.lectura ?? ((id) => `texto ${id}`)
        return HttpResponse.json(mensajeClaude({ lecturas: ids.map((id) => ({ id, texto: leer(id), idioma: "es" })) }))
      }
      if (texto.includes("Adapta estas partes")) {
        const partes: { texto: string; ubicacion: unknown }[] = JSON.parse(
          (typeof contenido === "string" ? contenido : "").split("<fuente>\n")[1]?.split("\n</fuente>")[0] ?? "[]",
        )
        llamadas.adaptaciones.push(...partes.map((p) => p.texto))
        const adaptadas = partes.map((p) => ({ texto: `[adaptado] ${p.texto}`, ubicacion: p.ubicacion }))
        return HttpResponse.json(
          mensajeClaude({
            idioma_original: opciones.idioma ?? "es",
            partes: opciones.adaptacionRota ? adaptadas.slice(1) : adaptadas,
          }),
        )
      }
      if (texto.includes("¿En qué idioma está este texto?")) {
        llamadas.idiomas += 1
        return HttpResponse.json(mensajeClaude({ idioma: opciones.idioma ?? "es" }))
      }
      llamadas.fichas.push(texto)
      if (opciones.fichaFalla)
        return HttpResponse.json({ error: { type: "api_error", message: "boom" } }, { status: 500 })
      return HttpResponse.json(
        mensajeClaude({
          resumen: "Un resumen de la fuente.",
          ideasClave: ["Idea uno.", "Idea dos.", "Idea tres.", "Idea cuatro.", "Idea cinco."],
          citas: [],
          fuente: { autor: null, anio: null, enlace: null },
          autorSugerido: opciones.autorSugerido ?? null,
        }),
      )
    }),
  )
  return llamadas
}

export interface LlamadasScribe {
  n: number
  llaves: (string | null)[]
}

/** `palabras` are [texto, segundo]; no words means Scribe heard no speech. */
export function simularScribe(idioma: string, palabras: [string, number][]): LlamadasScribe {
  const llamadas: LlamadasScribe = { n: 0, llaves: [] }
  servidor.use(
    http.post(URL_SCRIBE, ({ request }) => {
      llamadas.n += 1
      llamadas.llaves.push(request.headers.get("xi-api-key"))
      return HttpResponse.json({
        language_code: idioma,
        words: palabras.map(([text, start]) => ({ text, start, type: "word" })),
      })
    }),
  )
  return llamadas
}

/** A one-page-per-string PDF, like tests/fixtures/ingesta/generar.ts. */
export function pdfDe(paginas: string[]): Uint8Array {
  const objetos: string[] = []
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objetos[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${paginas.length} >>`
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  for (const [i, pagina] of paginas.entries()) {
    const flujo = `BT /F1 12 Tf 20 700 Td (${pagina}) Tj ET`
    objetos[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`
    objetos[5 + i * 2] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`
  }
  let salida = "%PDF-1.4\n"
  const posiciones: number[] = []
  for (let id = 1; id < objetos.length; id++) {
    posiciones[id] = salida.length
    salida += `${id} 0 obj\n${objetos[id]}\nendobj\n`
  }
  const xref = salida.length
  salida += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objetos.length; id++) salida += `${String(posiciones[id]).padStart(10, "0")} 00000 n \n`
  salida += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(salida, "latin1"))
}

export async function fixture(nombre: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(__dirname, "../fixtures/ingesta", nombre)))
}

/** Runs ffmpeg on a scratch folder; `trabajo` receives the folder and returns the file to read back. */
export async function conFfmpeg(
  ffmpeg: string,
  args: string[],
  salida: string,
  entrada?: Uint8Array,
): Promise<Uint8Array> {
  const carpeta = await mkdtemp(join(tmpdir(), "procesar-prueba-"))
  try {
    if (entrada) await writeFile(join(carpeta, "entrada.mp4"), entrada)
    await ejecutar(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args, salida], { cwd: carpeta, timeout: 60_000 })
    return new Uint8Array(await readFile(join(carpeta, salida)))
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
}
