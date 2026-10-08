import { extname } from "node:path"
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { afirmarMaterial, autorDelMaterial, estimarAfirmaciones } from "@/lib/ingesta/afirmar"
import {
  extraerArticulo,
  extraerDocx,
  extraerPdf,
  extraerTexto,
  type PaginaExtraida,
  SinTexto,
} from "@/lib/ingesta/extraer"
import { MaterialNoProcesable, MOTIVO_GENERICO, marcarFallido, motivoDefinitivo } from "@/lib/ingesta/falla-material"
import {
  buscarFfmpegBasico,
  deduplicarFotogramas,
  extraerFotogramas,
  unirLineasDePantalla,
} from "@/lib/ingesta/fotogramas"
import {
  type Contexto,
  existeMaterial,
  falloDeBase,
  guardarJson,
  leerJson,
  MaterialBorrado,
  pagadoAntes,
  pagar,
  redondear,
  TOPE,
  type Tope,
} from "@/lib/ingesta/gasto-material"
import { idiomaPorHeuristica } from "@/lib/ingesta/idioma"
import { extraerAudio, imagenAJpeg, sondearMedio } from "@/lib/ingesta/medios"
import { Parte } from "@/lib/ingesta/partes"
import { descargarEnlace, type FetchDeEnlace, type Resolver } from "@/lib/ingesta/red-segura"
import { renderizarPartes } from "@/lib/ingesta/texto-material"
import type { Almacen } from "@/lib/proveedores/almacen"
import {
  costoClaude,
  escribirFicha,
  leerTextoEnImagenes,
  MODELO_POR_TAREA,
  type TextoLeido,
} from "@/lib/proveedores/anthropic"
import { estimarCostoTranscripcion, transcribir } from "@/lib/proveedores/elevenlabs"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>
type Material = Database["public"]["Tables"]["materiales"]["Row"]

export interface DepsProcesar {
  /** A `service_role` client: only the service updates the state and writes the cards. */
  db: Db
  almacen: Almacen
  fetch: FetchDeEnlace
  /** DNS, injected so the SSRF guard can be tested without a network. */
  resolver: Resolver
  claude: Anthropic
  /** Read only when there is audio to transcribe, so a PDF does not need the key. */
  llaveElevenlabs: () => Promise<string>
  /** The Voyage key (env `VOYAGE_API_KEY`); without it the claims are left without a vector and maintenance embeds them. */
  llaveVoyage?: () => string | undefined
  /** Any ffmpeg that runs (no libass needed); the first one found when absent. */
  ffmpeg?: string
  ahora: () => string
  /** The Trigger.dev run id: the claim on a material belongs to one run. */
  corrida: string
}

export type ResultadoProcesar =
  | { resultado: "listo" }
  | { resultado: "ya_listo" }
  | { resultado: "fallido"; motivo: string }
  | { resultado: "tope" }
  | { resultado: "en_curso" }
  | { resultado: "borrado" }
  | { resultado: "esperando_confirmacion" }

/** The task's `maxDuration` (1800 s) plus a margin: a claim older than this belongs to a run that is gone. */
export const VIGENCIA_DE_CORRIDA_SEGUNDOS = 1800 + 300
export const MOTIVO_TOPE = "Llegaste al tope de gasto del mes. Súbelo en Ajustes para seguir."
/** Above this estimate (the claims of every chunk, or the card, in USD) a person confirms the cost before the run spends it. */
export const UMBRAL_CONFIRMACION_USD = 1
const MOTIVO_SIN_ACCESO = "El link pide iniciar sesión o no tiene texto: sube el texto o el archivo"
const REDES_QUE_NO_SE_ABREN = ["instagram.com", "tiktok.com"]
const ANFITRIONES_DE_YOUTUBE = ["youtube.com", "youtu.be", "youtube-nocookie.com"]
const MOTIVO_YOUTUBE =
  "YouTube no deja leer lo que se dice en el video. Abre el video, toca «…más» y luego «Mostrar transcripción», cópiala y pégala como texto."
const IMAGENES_POR_LOTE = 20
const SEGUNDOS_ENTRE_FOTOGRAMAS = 1

// Costs are over-estimated on purpose when reserving; the real cost replaces them on confirming.
const TOKENS_FIJOS_FICHA = 1_500
const TOKENS_DE_SALIDA_FICHA = 2_500
const CARACTERES_POR_TOKEN = 3
const MAXIMO_CARACTERES_PARA_FICHA = 120_000
const TOKENS_POR_IMAGEN = 1_600
const TOKENS_DE_SALIDA_POR_IMAGEN = 300

/** Releases the claim of the run on a material. */
const LIBRE = { corrida_id: null, corrida_desde: null }

const claves = (id: string) => ({
  textoOriginal: `materiales/${id}/texto-original.txt`,
  partesOriginal: `materiales/${id}/partes-original.json`,
  transcripcion: `materiales/${id}/transcripcion.json`,
  lectura: (paso: "pantalla" | "imagen", n: number) => `materiales/${id}/${paso}-${n}.json`,
})

const Extraccion = z.object({ idioma: z.string().optional(), titulo: z.string().nullable(), partes: z.array(Parte) })
type Extraccion = z.infer<typeof Extraccion>

const Voz = z.object({
  idioma: z.string(),
  segmentos: z.array(z.object({ segundo: z.number(), texto: z.string() })),
})
type Voz = z.infer<typeof Voz>

const Lecturas = z.array(z.object({ id: z.string(), texto: z.string(), idioma: z.string() }))

async function leerMaterial(db: Db, id: string): Promise<Material> {
  const { data, error } = await db.from("materiales").select("*").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  if (!data) throw new FallaDeConfiguracion(`No existe el material ${id}.`)
  return data
}

async function actualizarMaterial(
  db: Db,
  id: string,
  cambios: Database["public"]["Tables"]["materiales"]["Update"],
): Promise<void> {
  const { error } = await db.from("materiales").update(cambios).eq("id", id)
  if (error) throw falloDeBase("No pude actualizar el material", error)
}

async function guardarTexto(almacen: Almacen, clave: string, texto: string): Promise<void> {
  await almacen.subir(clave, new TextEncoder().encode(texto), "text/plain; charset=utf-8")
}

async function ffmpegDe(deps: DepsProcesar): Promise<string> {
  const ffmpeg = deps.ffmpeg ?? (await buscarFfmpegBasico())
  if (!ffmpeg) throw new FallaDeConfiguracion("No encuentro ffmpeg para leer el material.")
  return ffmpeg
}

function extensionDe(clave: string): string {
  return extname(clave).slice(1).toLowerCase()
}

const aPartesDePagina = (paginas: PaginaExtraida[]): Parte[] =>
  paginas.map((p) => ({ texto: p.texto, ubicacion: { pagina: p.pagina } }))

const TIPO_DE_AUDIO: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" }

/** Scribe on the audio of `bytes`; null when there is no speech track to read (no audio stream). */
async function transcribirAudio(
  ctx: Contexto,
  entrada: { bytes: Uint8Array; esVideo: boolean; tipo: string },
): Promise<Tope | { tope: false; voz: Voz | null }> {
  const { deps } = ctx
  const archivo = claves(ctx.material.id).transcripcion
  const previo = await pagadoAntes(ctx, archivo, Voz)
  if (previo) return { tope: false, voz: previo }
  const ffmpeg = await ffmpegDe(deps)
  const info = await sondearMedio({ ffmpeg, bytes: entrada.bytes })
  if (!info.conAudio) return { tope: false, voz: null }
  const audio = entrada.esVideo ? await extraerAudio({ ffmpeg, video: entrada.bytes }) : entrada.bytes
  const costo = redondear(estimarCostoTranscripcion(info.duracion))
  const pagado = await pagar(ctx, {
    archivo,
    proveedor: "elevenlabs",
    paso: "transcripcion",
    estimadoUsd: costo,
    llamar: async () => ({
      datos: await transcribir({
        clave: await deps.llaveElevenlabs(),
        audio,
        tipo: entrada.esVideo ? "audio/mpeg" : entrada.tipo,
      }),
      realUsd: costo,
    }),
  })
  return pagado.tope ? TOPE : { tope: false, voz: pagado.datos }
}

const aPartesDeVoz = (voz: Voz | null): Parte[] =>
  (voz?.segmentos ?? [])
    .filter((s) => s.texto.trim() !== "")
    .map((s) => ({ texto: s.texto, ubicacion: { segundo: s.segundo, pista: "voz" } }))

export function estimarLectura(imagenes: number): number {
  return redondear(
    costoClaude(
      {
        input_tokens: 800 + TOKENS_POR_IMAGEN * imagenes,
        output_tokens: 150 + TOKENS_DE_SALIDA_POR_IMAGEN * imagenes,
      },
      MODELO_POR_TAREA.leerTextoEnImagenes.modelo,
    ),
  )
}

/** Claude vision over the images in batches of 20, each batch reserved, paid and kept on its own. */
async function leerImagenes(
  ctx: Contexto,
  paso: "pantalla" | "imagen",
  imagenes: readonly { id: string; jpeg: Uint8Array }[],
): Promise<Tope | { tope: false; lecturas: TextoLeido[] }> {
  const lecturas: TextoLeido[] = []
  for (let desde = 0, n = 0; desde < imagenes.length; desde += IMAGENES_POR_LOTE, n++) {
    const lote = imagenes.slice(desde, desde + IMAGENES_POR_LOTE)
    const archivo = claves(ctx.material.id).lectura(paso, n)
    const previo = await pagadoAntes(ctx, archivo, Lecturas)
    if (previo) {
      lecturas.push(...previo)
      continue
    }
    const pagado = await pagar(ctx, {
      archivo,
      proveedor: "anthropic",
      paso,
      estimadoUsd: estimarLectura(lote.length),
      llamar: async () => {
        const r = await leerTextoEnImagenes({ cliente: ctx.deps.claude, imagenes: lote })
        return { datos: r.lecturas, realUsd: costoClaude(r.uso, MODELO_POR_TAREA.leerTextoEnImagenes.modelo) }
      },
    })
    if (pagado.tope) return TOPE
    lecturas.push(...pagado.datos)
  }
  return { tope: false, lecturas }
}

/** The language most of the non-empty readings agree on, for the translation step to start from. */
function idiomaMasFrecuente(lecturas: readonly TextoLeido[]): string | undefined {
  const cuentas = new Map<string, number>()
  for (const l of lecturas) if (l.texto.trim() !== "") cuentas.set(l.idioma, (cuentas.get(l.idioma) ?? 0) + 1)
  return [...cuentas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

async function bajarArchivo(
  ctx: Contexto,
  clave: string | null,
  que: string,
): Promise<{ bytes: Uint8Array; clave: string }> {
  if (!clave) throw new MaterialNoProcesable(`Falta el archivo del ${que}. Súbelo de nuevo.`)
  return { bytes: await ctx.deps.almacen.bajar(clave), clave }
}

async function extraerDocumento(ctx: Contexto): Promise<Extraccion> {
  const { material } = ctx
  if (material.archivo_clave) {
    const { bytes, clave } = await bajarArchivo(ctx, material.archivo_clave, "documento")
    const extension = extensionDe(clave)
    const paginas =
      extension === "pdf"
        ? await extraerPdf(bytes)
        : extension === "docx"
          ? await extraerDocx(bytes)
          : extension === "txt"
            ? extraerTexto(bytes)
            : null
    if (!paginas)
      throw new MaterialNoProcesable("Ese tipo de archivo no se puede leer. Sube un PDF, un Word o un texto.")
    return { titulo: null, partes: aPartesDePagina(paginas) }
  }
  return { titulo: null, partes: aPartesDePagina(extraerTexto(new TextEncoder().encode(material.texto_pegado ?? ""))) }
}

const esAnfitrionDe = (dominios: string[], anfitrion: string) =>
  dominios.some((d) => anfitrion === d || anfitrion.endsWith(`.${d}`))

async function extraerLink(ctx: Contexto): Promise<Extraccion> {
  const { material, deps } = ctx
  if (!material.origen_url) {
    if (material.texto_pegado)
      return { titulo: null, partes: aPartesDePagina(extraerTexto(new TextEncoder().encode(material.texto_pegado))) }
    throw new MaterialNoProcesable("Falta el link del material.")
  }
  const anfitrion = (() => {
    try {
      return new URL(material.origen_url).hostname.toLowerCase()
    } catch {
      // A malformed link is reported by the guard below, with its own message.
      return ""
    }
  })()
  if (esAnfitrionDe(ANFITRIONES_DE_YOUTUBE, anfitrion)) {
    // Third-party video: it is never downloaded, only the transcript a person pastes is read.
    if (material.texto_pegado)
      return { titulo: null, partes: aPartesDePagina(extraerTexto(new TextEncoder().encode(material.texto_pegado))) }
    throw new MaterialNoProcesable(MOTIVO_YOUTUBE)
  }
  if (esAnfitrionDe(REDES_QUE_NO_SE_ABREN, anfitrion)) {
    throw new MaterialNoProcesable("Instagram y TikTok no dejan leer sus páginas: pega el texto o sube el archivo.")
  }
  const respuesta = await descargarEnlace({ url: material.origen_url, fetch: deps.fetch, resolver: deps.resolver })
  if (respuesta.estado === 401 || respuesta.estado === 403) throw new MaterialNoProcesable(MOTIVO_SIN_ACCESO)
  if (respuesta.estado >= 500 || respuesta.estado === 408 || respuesta.estado === 429) {
    throw new Error(`El link respondió HTTP ${respuesta.estado}.`)
  }
  if (respuesta.estado >= 400) {
    throw new MaterialNoProcesable(
      `No pude abrir el link (respondió HTTP ${respuesta.estado}). Sube el texto o el archivo.`,
    )
  }
  if (respuesta.tipo === "text/plain") return { titulo: null, partes: aPartesDePagina(extraerTexto(respuesta.bytes)) }
  if (respuesta.tipo !== "" && !/html|xml/.test(respuesta.tipo)) {
    throw new MaterialNoProcesable("El link no es una página con texto. Sube el texto o el archivo.")
  }
  try {
    const articulo = await extraerArticulo(new TextDecoder("utf-8").decode(respuesta.bytes), respuesta.url)
    return { titulo: articulo.titulo, partes: aPartesDePagina(articulo.paginas) }
  } catch (error) {
    if (error instanceof SinTexto) throw new MaterialNoProcesable(MOTIVO_SIN_ACCESO)
    throw error
  }
}

async function extraerAudioDeMaterial(ctx: Contexto): Promise<Tope | Extraccion> {
  const { bytes, clave } = await bajarArchivo(ctx, ctx.material.archivo_clave, "audio")
  const r = await transcribirAudio(ctx, {
    bytes,
    esVideo: false,
    tipo: TIPO_DE_AUDIO[extensionDe(clave)] ?? "audio/mpeg",
  })
  if (r.tope) return TOPE
  const partes = aPartesDeVoz(r.voz)
  if (partes.length === 0) throw new SinTexto()
  return { titulo: null, idioma: r.voz?.idioma, partes }
}

async function extraerVideo(ctx: Contexto): Promise<Tope | Extraccion> {
  const { deps, material } = ctx
  const { bytes } = await bajarArchivo(ctx, material.archivo_clave, "video")
  const voz = await transcribirAudio(ctx, { bytes, esVideo: true, tipo: "audio/mpeg" })
  if (voz.tope) return TOPE
  const ffmpeg = await ffmpegDe(deps)
  const fotogramas = await deduplicarFotogramas(
    await extraerFotogramas(bytes, { cadaSegundos: SEGUNDOS_ENTRE_FOTOGRAMAS, ffmpeg }),
    { ffmpeg },
  )
  const pantalla = await leerImagenes(
    ctx,
    "pantalla",
    fotogramas.map((f) => ({ id: String(f.segundo), jpeg: f.jpeg })),
  )
  if (pantalla.tope) return TOPE
  const lineas = unirLineasDePantalla(pantalla.lecturas.map((l) => ({ segundo: Number(l.id), texto: l.texto })))
  const partes: Parte[] = [
    ...aPartesDeVoz(voz.voz),
    ...lineas.map((l): Parte => ({ texto: l.texto, ubicacion: { segundo: l.desde, pista: "pantalla" } })),
  ]
  if (partes.length === 0) throw new MaterialNoProcesable("No encontré voz ni texto en el video")
  return { titulo: null, idioma: voz.voz?.idioma ?? idiomaMasFrecuente(pantalla.lecturas), partes }
}

async function archivosDeImagen(ctx: Contexto): Promise<{ orden: number; clave: string }[]> {
  const { data, error } = await ctx.deps.db
    .from("materiales_archivos")
    .select("orden, archivo_clave")
    .eq("material_id", ctx.material.id)
    .order("orden")
  if (error) throw falloDeBase("No pude leer las imágenes del material", error)
  if (data.length > 0) return data.map((a) => ({ orden: a.orden, clave: a.archivo_clave }))
  return ctx.material.archivo_clave ? [{ orden: 1, clave: ctx.material.archivo_clave }] : []
}

async function extraerImagenes(ctx: Contexto): Promise<Tope | Extraccion> {
  const archivos = await archivosDeImagen(ctx)
  if (archivos.length === 0) throw new MaterialNoProcesable("Faltan las imágenes del material. Súbelas de nuevo.")
  const ffmpeg = await ffmpegDe(ctx.deps)
  const imagenes: { id: string; jpeg: Uint8Array }[] = []
  for (const { orden, clave } of archivos) {
    const bytes = await ctx.deps.almacen.bajar(clave)
    imagenes.push({ id: String(orden), jpeg: await imagenAJpeg({ ffmpeg, bytes, extension: extensionDe(clave) }) })
  }
  const leidas = await leerImagenes(ctx, "imagen", imagenes)
  if (leidas.tope) return TOPE
  const partes = leidas.lecturas
    .filter((l) => l.texto.trim() !== "")
    .map((l): Parte => ({ texto: l.texto, ubicacion: { imagen: Number(l.id) } }))
  if (partes.length === 0) throw new SinTexto()
  return { titulo: null, idioma: idiomaMasFrecuente(leidas.lecturas), partes }
}

async function extraerPost(ctx: Contexto): Promise<Tope | Extraccion> {
  const { material } = ctx
  const partes: Parte[] = []
  const pegado = material.texto_pegado?.trim() ?? ""
  if (pegado !== "") partes.push({ texto: pegado, ubicacion: { pagina: null } })
  let idioma: string | undefined
  if (material.archivo_clave) {
    const { bytes } = await bajarArchivo(ctx, material.archivo_clave, "video")
    const voz = await transcribirAudio(ctx, { bytes, esVideo: true, tipo: "audio/mpeg" })
    if (voz.tope) return TOPE
    partes.push(...aPartesDeVoz(voz.voz))
    idioma = voz.voz?.idioma
  }
  if (partes.length === 0)
    throw new MaterialNoProcesable("El post no trae texto ni voz. Pega el texto o sube su video.")
  return { titulo: null, idioma, partes }
}

async function extraer(ctx: Contexto): Promise<Tope | Extraccion> {
  switch (ctx.material.tipo) {
    case "documento":
      return extraerDocumento(ctx)
    case "link":
      return extraerLink(ctx)
    case "audio":
      return extraerAudioDeMaterial(ctx)
    case "video":
      return extraerVideo(ctx)
    case "imagen":
      return extraerImagenes(ctx)
    case "post":
      return extraerPost(ctx)
    default:
      throw new FallaDeConfiguracion(`Tipo de material desconocido: ${ctx.material.tipo}`)
  }
}

/** Step 1: the text of the source, as parts. Kept in the store, so what a crash leaves behind is not read (or paid) twice. */
async function extraccionDe(ctx: Contexto): Promise<Tope | Extraccion> {
  const { almacen } = ctx.deps
  const k = claves(ctx.material.id)
  const guardada = await leerJson(almacen, k.partesOriginal, Extraccion)
  if (guardada) return guardada
  const extraida = await extraer(ctx)
  if ("tope" in extraida) return extraida
  await guardarJson(almacen, k.partesOriginal, extraida)
  return extraida
}

export function estimarFicha(partes: readonly Parte[]): number {
  const caracteres = Math.min(
    MAXIMO_CARACTERES_PARA_FICHA,
    partes.reduce((total, p) => total + p.texto.length, 0),
  )
  return redondear(
    costoClaude(
      {
        input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN) + TOKENS_FIJOS_FICHA,
        output_tokens: TOKENS_DE_SALIDA_FICHA,
      },
      MODELO_POR_TAREA.escribirFicha.modelo,
    ),
  )
}

async function existeFicha(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("fichas").select("material_id").eq("material_id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer la ficha", error)
  return data !== null
}

/** Step 2 for `estrategia`: the card, written once from the extracted text, and the material is ready. */
async function fichaDe(
  ctx: Contexto,
  partes: readonly Parte[],
  titulo: string | null,
): Promise<Tope | { tope: false }> {
  const { deps, material } = ctx
  const { nombre: autorDado } = await autorDelMaterial(deps.db, material.autor_id)
  if (!(await existeFicha(deps.db, material.id))) {
    const tituloDeFicha = material.titulo?.trim() || titulo || "Sin título"
    const pagado = await pagar(ctx, {
      archivo: `materiales/${material.id}/ficha.json`,
      proveedor: "anthropic",
      paso: "ficha",
      estimadoUsd: estimarFicha(partes),
      llamar: async () => {
        const f = await escribirFicha({
          cliente: deps.claude,
          titulo: tituloDeFicha,
          autor: autorDado,
          partes,
        })
        return { datos: f, realUsd: costoClaude(f.uso, MODELO_POR_TAREA.escribirFicha.modelo) }
      },
    })
    if (pagado.tope) return TOPE
    const f = pagado.datos
    const { error } = await deps.db.from("fichas").insert({
      material_id: material.id,
      resumen: f.resumen,
      ideas_clave: f.ideasClave,
      citas: f.citas,
      fuente: {
        autor: f.fuente.autor ?? autorDado,
        anio: f.fuente.anio,
        enlace: f.fuente.enlace ?? material.origen_url,
      },
    })
    if (error) throw falloDeBase("No pude guardar la ficha", error)
  }
  await actualizarMaterial(deps.db, material.id, materialListo(material, titulo))
  return { tope: false }
}

/** What every ready material gets, whatever its role: no links to resolve, the original text as its text, the claim released. */
function materialListo(
  material: Material,
  titulo: string | null,
): Database["public"]["Tables"]["materiales"]["Update"] {
  return {
    estado: "listo",
    texto_clave: claves(material.id).textoOriginal,
    motivo_fallo: null,
    ...LIBRE,
    ...(material.titulo?.trim() || !titulo ? {} : { titulo }),
  }
}

/** Step 2 for the other roles: claims with characteristics, embedded and grouped into topics. */
async function afirmacionesDe(
  ctx: Contexto,
  original: Extraccion,
  idiomaConocido: string | null,
): Promise<Tope | { tope: false }> {
  const hechas = await afirmarMaterial(ctx, original.partes)
  if ("tope" in hechas && hechas.tope) return TOPE
  const idioma = idiomaConocido ?? ("idioma" in hechas ? hechas.idioma : null)
  await actualizarMaterial(ctx.deps.db, ctx.material.id, {
    ...materialListo(ctx.material, original.titulo),
    ...(idioma ? { idioma_original: idioma } : {}),
  })
  return { tope: false }
}

/**
 * What the steps after the extraction will cost: the card for `estrategia`, and for every other role one claim
 * request per chunk plus the embeddings. Over-estimates, like the reservations.
 */
export function estimarCostoRestante(partes: readonly Parte[], rol: string): number {
  return rol === "estrategia" ? estimarFicha(partes) : estimarAfirmaciones(partes)
}

export { ESTIMADO_POR_TRAMO_USD } from "@/lib/ingesta/afirmar"

const formatoUsd = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * A long material waits for a person to confirm its cost. The extraction is already stored, so confirming and running
 * again does not pay it twice. Returns true when the run stopped here.
 */
async function esperaConfirmacion(ctx: Contexto, original: Extraccion): Promise<boolean> {
  const { deps, material } = ctx
  if (material.costo_confirmado_en) return false
  const estimado = estimarCostoRestante(original.partes, material.rol)
  if (estimado <= UMBRAL_CONFIRMACION_USD) return false
  await actualizarMaterial(deps.db, material.id, {
    costo_estimado_usd: estimado,
    motivo_fallo: `Este material es largo: procesarlo cuesta cerca de US$ ${formatoUsd.format(estimado)}. Confírmalo para seguir.`,
    ...LIBRE,
  })
  return true
}

/** The two-letter code the extraction reported, or the one the stopwords make clear; null when neither does. */
function idiomaDeLaFuente(original: Extraccion): string | null {
  const dicho = original.idioma ?? idiomaPorHeuristica(original.partes)
  return dicho && /^[a-z]{2}$/.test(dicho) ? dicho : null
}

async function procesar(ctx: Contexto): Promise<ResultadoProcesar> {
  const { deps, material } = ctx
  const original = await extraccionDe(ctx)
  if ("tope" in original) return detenidoPorTope(ctx)
  if (await esperaConfirmacion(ctx, original)) return { resultado: "esperando_confirmacion" }
  await guardarTexto(deps.almacen, claves(material.id).textoOriginal, renderizarPartes(original.partes))
  const idioma = idiomaDeLaFuente(original)
  if (idioma) await actualizarMaterial(deps.db, material.id, { idioma_original: idioma })
  const terminado =
    material.rol === "estrategia"
      ? await fichaDe(ctx, original.partes, original.titulo)
      : await afirmacionesDe(ctx, original, idioma)
  if (terminado.tope) return detenidoPorTope(ctx)
  return { resultado: "listo" }
}

/** The cap stops the run without failing it: the material waits as it is, with the reason, and no provider is called. */
async function detenidoPorTope(ctx: Contexto): Promise<ResultadoProcesar> {
  await actualizarMaterial(ctx.deps.db, ctx.material.id, { motivo_fallo: MOTIVO_TOPE, ...LIBRE })
  return { resultado: "tope" }
}

/**
 * Turns an uploaded material into a card (`estrategia`) or into claims grouped in topics (every other role). Idempotent: a ready material is left alone, and
 * what a crashed run already paid for (transcription, vision, claims, embeddings, card) is read back from the store.
 * A final error (nothing to read, a refused link) marks the material failed; any other error goes up so Trigger.dev
 * retries, and the `onFailure` hook marks it failed only once the retries are over.
 */
export async function procesarMaterial(deps: DepsProcesar, materialId: string): Promise<ResultadoProcesar> {
  const leido = await leerMaterial(deps.db, materialId)
  if (leido.estado === "listo") return { resultado: "ya_listo" }
  // A late run (a retry that outlived a failure) must not revive a material that already failed: retrying it sets
  // it back to procesando first.
  if (leido.estado === "fallido") return { resultado: "fallido", motivo: leido.motivo_fallo ?? MOTIVO_GENERICO }
  const material = await tomarMaterial(deps, materialId)
  if (!material) return { resultado: "en_curso" }
  try {
    return await procesar({ deps, material })
  } catch (error) {
    if (error instanceof MaterialBorrado || !(await existeMaterial(deps.db, materialId))) {
      return { resultado: "borrado" }
    }
    const motivo = motivoDefinitivo(error)
    if (motivo === null) throw error
    await marcarFallido(deps.db, materialId, motivo)
    return { resultado: "fallido", motivo }
  }
}

/**
 * Takes the material for this run: only when it is still processing and nobody holds it, this run already does (a
 * retry of the same run), or the holder is gone (its claim is older than the task can last). Null when another run has it.
 */
async function tomarMaterial(deps: DepsProcesar, id: string): Promise<Material | null> {
  const ahora = deps.ahora()
  const vencida = new Date(new Date(ahora).getTime() - VIGENCIA_DE_CORRIDA_SEGUNDOS * 1000).toISOString()
  const { data, error } = await deps.db
    .from("materiales")
    .update({ corrida_id: deps.corrida, corrida_desde: ahora })
    .eq("id", id)
    .eq("estado", "procesando")
    .or(`corrida_id.is.null,corrida_id.eq."${deps.corrida}",corrida_desde.lt.${vencida}`)
    .select("*")
    .maybeSingle()
  if (error) throw falloDeBase("No pude tomar el material", error)
  return data
}
