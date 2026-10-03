import { extname } from "node:path"
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { confirmarGasto, liberarGasto, reservarGastoGeneral } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
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
import { extraerAudio, imagenAJpeg, sondearMedio } from "@/lib/ingesta/medios"
import { Parte } from "@/lib/ingesta/partes"
import { descargarEnlace, type FetchDeEnlace, type Resolver } from "@/lib/ingesta/red-segura"
import { renderizarPartes } from "@/lib/ingesta/texto-material"
import { type GastoDeTraduccion, gastoEnBase, traducirMaterial } from "@/lib/ingesta/traducir"
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

/** The task's `maxDuration` (1800 s) plus a margin: a claim older than this belongs to a run that is gone. */
export const VIGENCIA_DE_CORRIDA_SEGUNDOS = 1800 + 300
export const MOTIVO_TOPE = "Llegaste al tope de gasto del mes. Súbelo en Ajustes para seguir."
const MOTIVO_SIN_ACCESO = "El link pide iniciar sesión o no tiene texto: sube el texto o el archivo"
const REDES_QUE_NO_SE_ABREN = ["instagram.com", "tiktok.com"]
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

const redondear = (usd: number) => Number(usd.toFixed(4))

const claves = (id: string) => ({
  texto: `materiales/${id}/texto.txt`,
  textoOriginal: `materiales/${id}/texto-original.txt`,
  partesOriginal: `materiales/${id}/partes-original.json`,
  partes: `materiales/${id}/partes.json`,
  transcripcion: `materiales/${id}/transcripcion.json`,
  lectura: (paso: "pantalla" | "imagen", n: number) => `materiales/${id}/${paso}-${n}.json`,
})

const Extraccion = z.object({ idioma: z.string().optional(), titulo: z.string().nullable(), partes: z.array(Parte) })
type Extraccion = z.infer<typeof Extraccion>

const Traducido = z.object({ idioma_original: z.string().nullable(), partes: z.array(Parte) })

const Voz = z.object({
  idioma: z.string(),
  segmentos: z.array(z.object({ segundo: z.number(), texto: z.string() })),
})
type Voz = z.infer<typeof Voz>

const Lecturas = z.array(z.object({ id: z.string(), texto: z.string(), idioma: z.string() }))

/** What a paid step leaves behind, so a run that crashed after paying does not pay again. */
function conGasto<T extends z.ZodType>(datos: T) {
  return z.object({ gasto: z.object({ clave: z.string(), realUsd: z.number() }), datos })
}

/** The material was deleted while the run was working: not an error, nothing to retry and nobody to alert. */
class MaterialBorrado extends Error {
  constructor() {
    super("El material fue borrado mientras se procesaba.")
    this.name = "MaterialBorrado"
  }
}

type Tope = { tope: true }
const TOPE: Tope = { tope: true }

interface Contexto {
  deps: DepsProcesar
  material: Material
}

function falloDeBase(mensaje: string, error: { message: string }): Error {
  return new Error(`${mensaje}: ${error.message}`)
}

async function leerMaterial(db: Db, id: string): Promise<Material> {
  const { data, error } = await db.from("materiales").select("*").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  if (!data) throw new FallaDeConfiguracion(`No existe el material ${id}.`)
  return data
}

async function existeMaterial(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("materiales").select("id").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  return data !== null
}

/** Called before every paid step: a deleted material must not cost anything more. */
async function exigirMaterial(db: Db, id: string): Promise<void> {
  if (!(await existeMaterial(db, id))) throw new MaterialBorrado()
}

async function actualizarMaterial(
  db: Db,
  id: string,
  cambios: Database["public"]["Tables"]["materiales"]["Update"],
): Promise<void> {
  const { error } = await db.from("materiales").update(cambios).eq("id", id)
  if (error) throw falloDeBase("No pude actualizar el material", error)
}

async function leerJson<T>(almacen: Almacen, clave: string, esquema: z.ZodType<T>): Promise<T | null> {
  if (!(await almacen.existe(clave))) return null
  const bytes = await almacen.bajar(clave)
  return esquema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}

async function guardarJson(almacen: Almacen, clave: string, valor: unknown): Promise<void> {
  await almacen.subir(clave, new TextEncoder().encode(JSON.stringify(valor)), "application/json")
}

async function guardarTexto(almacen: Almacen, clave: string, texto: string): Promise<void> {
  await almacen.subir(clave, new TextEncoder().encode(texto), "text/plain; charset=utf-8")
}

/**
 * The stored result of a paid step, or null when there is none. The reservation of the run that paid is confirmed
 * here (a no-op when it already was), so a crash between paying and confirming leaves no reservation hanging.
 */
async function pagadoAntes<T>(ctx: Contexto, archivo: string, esquema: z.ZodType<T>): Promise<T | null> {
  const guardado = await leerJson(ctx.deps.almacen, archivo, conGasto(esquema))
  if (!guardado) return null
  await confirmarGasto(ctx.deps.db, guardado.gasto.clave, guardado.gasto.realUsd)
  return guardado.datos
}

/**
 * One paid provider call: reserve against the monthly cap, call, keep the result in the store and only then confirm
 * the real cost. The reservation key is new on every attempt: reserving an old key returns the old row, even a
 * released one, and the retry would run unmetered. A failed call releases its reservation; a call that was paid for
 * is confirmed even when keeping its result fails.
 */
async function pagar<T>(
  ctx: Contexto,
  paso: {
    archivo: string
    proveedor: "anthropic" | "elevenlabs"
    paso: string
    estimadoUsd: number
    llamar: () => Promise<{ datos: T; realUsd: number }>
  },
): Promise<Tope | { tope: false; datos: T }> {
  const { db, almacen, ahora } = ctx.deps
  await exigirMaterial(db, ctx.material.id)
  const clave = `material:${ctx.material.id}:${paso.paso}:${crypto.randomUUID()}`
  const reserva = await reservarGastoGeneral(db, {
    proveedor: paso.proveedor,
    paso: paso.paso,
    estimadoUsd: paso.estimadoUsd,
    clave,
    ahora: ahora(),
  })
  if (reserva.tope) return TOPE
  let resultado: { datos: T; realUsd: number }
  try {
    resultado = await paso.llamar()
  } catch (error) {
    await liberarGasto(db, clave)
    throw error
  }
  const realUsd = redondear(resultado.realUsd)
  try {
    await guardarJson(almacen, paso.archivo, { gasto: { clave, realUsd }, datos: resultado.datos })
  } finally {
    await confirmarGasto(db, clave, realUsd)
  }
  return { tope: false, datos: resultado.datos }
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

const esDeRed = (anfitrion: string) => REDES_QUE_NO_SE_ABREN.some((r) => anfitrion === r || anfitrion.endsWith(`.${r}`))

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
  if (esDeRed(anfitrion)) {
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

/** The cap ledger of the translation step, plus whether it was the cap that stopped it (its error is a plain Falla). */
function gastoDeTraduccion(
  deps: DepsProcesar,
  materialId: string,
): { gasto: GastoDeTraduccion; topeAlcanzado: () => boolean } {
  const base = gastoEnBase(deps.db, deps.ahora)
  let tope = false
  return {
    topeAlcanzado: () => tope,
    gasto: {
      ...base,
      async reservar(reserva) {
        await exigirMaterial(deps.db, materialId)
        const r = await base.reservar(reserva)
        if (r.tope) tope = true
        return r
      },
    },
  }
}

/** Step 2: the parts in Spanish of Chile. `texto.txt` is written last: it is what says this step is done. */
async function traduccionDe(ctx: Contexto, original: Extraccion): Promise<Tope | z.infer<typeof Traducido>> {
  const { deps, material } = ctx
  const k = claves(material.id)
  const hecha = (await deps.almacen.existe(k.texto)) ? await leerJson(deps.almacen, k.partes, Traducido) : null
  if (hecha) return hecha
  await guardarTexto(deps.almacen, k.textoOriginal, renderizarPartes(original.partes))
  const { gasto, topeAlcanzado } = gastoDeTraduccion(deps, material.id)
  let traducido: Awaited<ReturnType<typeof traducirMaterial>>
  try {
    traducido = await traducirMaterial({
      cliente: deps.claude,
      gasto,
      clave: `material:${material.id}:traduccion`,
      partes: original.partes,
      ...(original.idioma ? { idiomaReportado: original.idioma } : {}),
    })
  } catch (error) {
    if (topeAlcanzado()) return TOPE
    throw error
  }
  const idioma = /^[a-z]{2}$/.test(traducido.idioma_original) ? traducido.idioma_original : null
  await actualizarMaterial(deps.db, material.id, { idioma_original: idioma })
  const resultado = { idioma_original: idioma, partes: traducido.partes }
  await guardarJson(deps.almacen, k.partes, resultado)
  await guardarTexto(deps.almacen, k.texto, renderizarPartes(traducido.partes))
  return resultado
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

/** Step 3: the card, written once from the Chilean text, and the material is ready. */
async function fichaDe(
  ctx: Contexto,
  traducido: z.infer<typeof Traducido>,
  titulo: string | null,
): Promise<Tope | { tope: false }> {
  const { deps, material } = ctx
  const autorDado = material.autor?.trim() || null
  let autorSugerido: string | null = null
  if (!(await existeFicha(deps.db, material.id))) {
    const tituloDeFicha = material.titulo?.trim() || titulo || "Sin título"
    const pagado = await pagar(ctx, {
      archivo: `materiales/${material.id}/ficha.json`,
      proveedor: "anthropic",
      paso: "ficha",
      estimadoUsd: estimarFicha(traducido.partes),
      llamar: async () => {
        const f = await escribirFicha({
          cliente: deps.claude,
          titulo: tituloDeFicha,
          autor: autorDado,
          partes: traducido.partes,
        })
        return { datos: f, realUsd: costoClaude(f.uso, MODELO_POR_TAREA.escribirFicha.modelo) }
      },
    })
    if (pagado.tope) return TOPE
    const f = pagado.datos
    autorSugerido = f.autorSugerido
    const { error } = await deps.db.from("fichas").insert({
      material_id: material.id,
      resumen: f.resumen,
      ideas_clave: f.ideasClave,
      citas: f.citas,
      fuente: {
        autor: f.fuente.autor ?? autorDado ?? autorSugerido,
        anio: f.fuente.anio,
        enlace: f.fuente.enlace ?? material.origen_url,
      },
    })
    if (error) throw falloDeBase("No pude guardar la ficha", error)
  }
  await actualizarMaterial(deps.db, material.id, {
    estado: "listo",
    texto_clave: claves(material.id).texto,
    motivo_fallo: null,
    ...LIBRE,
    ...(autorDado === null && autorSugerido?.trim() ? { autor: autorSugerido.trim() } : {}),
    ...(material.titulo?.trim() || !titulo ? {} : { titulo }),
  })
  return { tope: false }
}

async function procesar(ctx: Contexto): Promise<ResultadoProcesar> {
  const original = await extraccionDe(ctx)
  if ("tope" in original) return detenidoPorTope(ctx)
  const traducido = await traduccionDe(ctx, original)
  if ("tope" in traducido) return detenidoPorTope(ctx)
  const ficha = await fichaDe(ctx, traducido, original.titulo)
  if (ficha.tope) return detenidoPorTope(ctx)
  return { resultado: "listo" }
}

/** The cap stops the run without failing it: the material waits as it is, with the reason, and no provider is called. */
async function detenidoPorTope(ctx: Contexto): Promise<ResultadoProcesar> {
  await actualizarMaterial(ctx.deps.db, ctx.material.id, { motivo_fallo: MOTIVO_TOPE, ...LIBRE })
  return { resultado: "tope" }
}

/**
 * Turns an uploaded material into Chilean-Spanish text and a card. Idempotent: a ready material is left alone, and
 * what a crashed run already paid for (transcription, vision, translation, card) is read back from the store.
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
