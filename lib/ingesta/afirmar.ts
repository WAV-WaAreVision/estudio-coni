import { createHash } from "node:crypto"
import { z } from "zod"
import { leerCalibracion } from "@/lib/datos/huellas"
import { leerVocabulario } from "@/lib/datos/vocabulario"
import type { ModeloDeHuellas } from "@/lib/dominio/parecido"
import { mensajeTecnico, PausaDeProveedor } from "@/lib/dominio/pausas"
import { CERTEZAS, MARCAS, type Vocabulario } from "@/lib/dominio/vocabulario"
import { textoDeVector } from "@/lib/ingesta/agrupar"
import {
  type Contexto,
  falloDeBase,
  LIMITE,
  type Limite,
  MaterialBorrado,
  pagadoAntes,
  pagar,
  redondear,
} from "@/lib/ingesta/gasto-material"
import { type Parte, Ubicacion } from "@/lib/ingesta/partes"
import { asignarATemas, recalcularTema } from "@/lib/ingesta/temas"
import { aTramos, type Tramo } from "@/lib/ingesta/tramos"
import { abrirPausa } from "@/lib/pausas/abrir"
import {
  costoClaude,
  EVIDENCIAS_DE_AFIRMACION,
  extraerAfirmaciones,
  MAXIMO_AFIRMACIONES_POR_TRAMO,
  MODELO_POR_TAREA,
  TIPOS_DE_AFIRMACION,
  versionDeExtraccion,
} from "@/lib/proveedores/anthropic"
import { costoVoyage, costoVoyagePeorCaso, embeber } from "@/lib/proveedores/voyage"

/** Voyage takes up to 128 texts per request. */
export const TEXTOS_POR_EMBEBIDO = 128
/** The reservation for one chunk: Sonnet over about 3.5k tokens of text plus the cached guide, and 1.5k tokens out. Over-estimates on purpose. */
export const ESTIMADO_POR_TRAMO_USD = redondear(
  costoClaude({ input_tokens: 5_000, output_tokens: 1_500 }, MODELO_POR_TAREA.extraerAfirmaciones.modelo),
)
const TOKENS_POR_AFIRMACION = 100
const FILAS_POR_INSERCION = 200
const IDS_POR_CONSULTA = 100

/** What the claims of the material will cost: one request per chunk and the embeddings of what they return. */
export function estimarAfirmaciones(partes: readonly Parte[]): number {
  const tramos = aTramos(partes).length
  const embeddings = costoVoyagePeorCaso(tramos * MAXIMO_AFIRMACIONES_POR_TRAMO * TOKENS_POR_AFIRMACION)
  return redondear(tramos * ESTIMADO_POR_TRAMO_USD + embeddings)
}

const huellaDe = (...partes: string[]) => createHash("sha256").update(partes.join("\0")).digest("hex")

const Extraidas = z.object({
  huella: z.string(),
  idioma: z.string(),
  afirmaciones: z.array(
    z.object({
      texto: z.string(),
      cita: z.string(),
      tipo: z.enum(TIPOS_DE_AFIRMACION),
      evidencia: z.enum(EVIDENCIAS_DE_AFIRMACION),
      postura: z.string().nullable(),
      publico: z.string().nullable(),
      dolor: z.string().nullable(),
      emocion: z.string().nullable(),
      gancho: z.string().nullable(),
      ubicacion: Ubicacion,
      // `default` keeps a checkpoint from before change 6a readable; its fingerprint is stale, so it is paid again.
      marcas: z
        .array(
          z.object({
            marca: z.enum(MARCAS),
            red: z.enum(["linkedin", "instagram", "todas"]),
            valor: z.string(),
            frase: z.string().nullable(),
            certeza: z.enum(CERTEZAS),
            porQue: z.string().nullable(),
            versionId: z.number().nullable(),
          }),
        )
        .default([]),
      ganchoDetalle: z
        .object({
          fraseExacta: z.string(),
          fraseSinGancho: z.string(),
          tipo: z.string(),
          certeza: z.enum(CERTEZAS),
          versionId: z.number(),
        })
        .nullable()
        .default(null),
    }),
  ),
})
type Extraidas = z.infer<typeof Extraidas>

const Embebidos = z.object({ huella: z.string(), vectores: z.array(z.array(z.number())) })

const nombreDeTramo = (n: number) => `tramo-${String(n).padStart(3, "0")}`

type Db = Contexto["deps"]["db"]

export async function autorDelMaterial(
  db: Db,
  autorId: string,
): Promise<{ nombre: string; credencial: string | null }> {
  const { data, error } = await db.from("autores").select("nombre, credencial").eq("id", autorId).single()
  if (error) throw falloDeBase("No pude leer el autor del material", error)
  return data
}

/**
 * One paid request per chunk, each kept in the store with a fingerprint of the chunk, the model and the extraction
 * version (prompt and list versions), so a retry pays only what is missing.
 */
async function extraerPorTramo(
  ctx: Contexto,
  tramos: readonly Tramo[],
  vocabulario: Vocabulario,
): Promise<Limite | { limite: false; extraidas: Extraidas[] }> {
  const { deps, material } = ctx
  const autor = await autorDelMaterial(deps.db, material.autor_id)
  const modelo = MODELO_POR_TAREA.extraerAfirmaciones.modelo
  const version = versionDeExtraccion(vocabulario)
  const extraidas: Extraidas[] = []
  for (const tramo of tramos) {
    const huella = huellaDe(tramo.texto, modelo, version)
    const archivo = `materiales/${material.id}/afirmaciones/${nombreDeTramo(tramo.numero)}.json`
    const previo = await pagadoAntes(ctx, archivo, Extraidas)
    if (previo && previo.huella === huella) {
      extraidas.push(previo)
      continue
    }
    const pagado = await pagar(ctx, {
      archivo,
      proveedor: "anthropic",
      paso: "afirmaciones",
      estimadoUsd: ESTIMADO_POR_TRAMO_USD,
      llamar: async () => {
        const r = await extraerAfirmaciones({ cliente: deps.claude, tramo, autor, vocabulario })
        if (r.tiposCorregidos.length > 0) {
          console.warn(
            `Tipo desconocido tratado como sin clasificar en el tramo ${tramo.numero}: ${JSON.stringify(r.tiposCorregidos)}`,
          )
        }
        if (r.evidenciasCorregidas.length > 0) {
          console.warn(
            `Evidencia desconocida tratada como sin clasificar en el tramo ${tramo.numero}: ${JSON.stringify(r.evidenciasCorregidas)}`,
          )
        }
        if (r.valoresFueraDeLista.length > 0) {
          console.warn(
            `Marcas fuera de la lista guardadas como otro u otra en el tramo ${tramo.numero}: ${JSON.stringify(r.valoresFueraDeLista)}`,
          )
        }
        return {
          datos: { huella, idioma: r.idioma, afirmaciones: r.afirmaciones },
          realUsd: costoClaude(r.uso, modelo),
        }
      },
    })
    if (pagado.limite) return LIMITE
    extraidas.push(pagado.datos)
  }
  return { limite: false, extraidas }
}

export const estimarEmbebido = (textos: readonly string[]) =>
  redondear(costoVoyagePeorCaso(Math.ceil(textos.join("").length / 2)) + 0.0001)

/**
 * The vectors of the claims' texts, in batches of 128, each batch kept in the store. Never fails the material: with no
 * key, a provider error or the limit reached, the claims it could not reach stay without a vector (maintenance embeds them).
 */
async function embeberAfirmaciones(
  ctx: Contexto,
  textos: readonly string[],
  modelo: ModeloDeHuellas,
): Promise<(number[] | null)[]> {
  const { deps, material } = ctx
  const vectores: (number[] | null)[] = textos.map(() => null)
  const llave = deps.llaveVoyage?.()
  if (!llave) return vectores
  try {
    for (let desde = 0, n = 1; desde < textos.length; desde += TEXTOS_POR_EMBEBIDO, n++) {
      const lote = textos.slice(desde, desde + TEXTOS_POR_EMBEBIDO)
      const huella = huellaDe(modelo, ...lote)
      const archivo = `materiales/${material.id}/afirmaciones/embedding-${String(n).padStart(3, "0")}.json`
      const previo = await pagadoAntes(ctx, archivo, Embebidos)
      let lista = previo?.huella === huella ? previo.vectores : null
      if (!lista) {
        const pagado = await pagar(ctx, {
          archivo,
          proveedor: "voyage",
          paso: "embedding",
          estimadoUsd: estimarEmbebido(lote),
          llamar: async () => {
            const r = await embeber({ clave: llave, textos: lote, tipo: "document", modelo })
            if (r.vectores.length !== lote.length) throw new Error("Voyage no devolvió un vector por afirmación.")
            return { datos: { huella, vectores: r.vectores }, realUsd: costoVoyage(r.tokens, modelo) }
          },
        })
        if (pagado.limite) return vectores
        lista = pagado.datos.vectores
      }
      lista.forEach((v, i) => {
        vectores[desde + i] = v
      })
    }
  } catch (error) {
    if (error instanceof MaterialBorrado) throw error
    // The claims still wait for maintenance, but a payment or key failure is WAV's to fix now (spec 2026-11-07).
    if (error instanceof PausaDeProveedor) {
      try {
        await abrirPausa(deps, error)
      } catch (alAbrir) {
        // Amendment A6: a Voyage pause must never fail the material; maintenance resends WAV's email.
        if (!(alAbrir instanceof Error)) throw alAbrir
        console.error(`No pude abrir la pausa de ${error.proveedor} del material ${material.id}: ${alAbrir.message}`)
      }
    }
    // Left for maintenance, but visible in the logs. The key is already redacted by the client.
    console.warn(`Embeddings pendientes del material ${material.id}: ${mensajeTecnico(error)}`)
  }
  return vectores
}

async function temasDeLasAfirmaciones(db: Db, materialId: string): Promise<string[]> {
  const { data, error } = await db
    .from("afirmaciones")
    .select("tema_id")
    .eq("material_id", materialId)
    .not("tema_id", "is", null)
  if (error) throw falloDeBase("No pude leer los temas del material", error)
  return [...new Set(data.flatMap((fila) => (fila.tema_id ? [fila.tema_id] : [])))]
}

/** Replaces the claims of the material with these: a re-run never leaves duplicates. Returns the ids of the new ones that have a vector. */
async function reemplazarAfirmaciones(
  ctx: Contexto,
  tramos: readonly Tramo[],
  extraidas: readonly Extraidas[],
  vectores: readonly (number[] | null)[],
  modelo: ModeloDeHuellas,
): Promise<string[]> {
  const { db } = ctx.deps
  const { id, autor_id } = ctx.material
  const filas = extraidas.flatMap((e, i) =>
    e.afirmaciones.map((a) => ({ tramo: tramos[i]?.numero ?? i + 1, idioma: e.idioma, ...a })),
  )
  const borradas = await db.from("afirmaciones").delete().eq("material_id", id)
  if (borradas.error) throw falloDeBase("No pude reemplazar las afirmaciones", borradas.error)
  const conVector: string[] = []
  for (let desde = 0; desde < filas.length; desde += FILAS_POR_INSERCION) {
    const lote = filas.slice(desde, desde + FILAS_POR_INSERCION)
    const { data, error } = await db
      .from("afirmaciones")
      .insert(
        lote.map((f, i) => {
          const vector = vectores[desde + i]
          return {
            material_id: id,
            autor_id,
            tramo: f.tramo,
            ubicacion: f.ubicacion,
            idioma: f.idioma,
            texto: f.texto,
            cita: f.cita,
            tipo: f.tipo,
            evidencia: f.evidencia,
            postura: f.postura,
            publico: f.publico,
            dolor: f.dolor,
            emocion: f.emocion,
            gancho: f.gancho,
            vector: vector ? textoDeVector(vector) : null,
            modelo_vector: vector ? modelo : null,
          }
        }),
      )
      .select("id")
    if (error) throw falloDeBase("No pude guardar las afirmaciones", error)
    if (data.length !== lote.length) {
      throw falloDeBase("No pude guardar las afirmaciones", {
        message: `La base devolvió ${data.length} ids para ${lote.length} afirmaciones.`,
      })
    }
    await guardarMarcasYGanchos(
      db,
      lote,
      data.map((fila) => fila.id),
    )
    data.forEach((fila, i) => {
      if (vectores[desde + i]) conVector.push(fila.id)
    })
  }
  return conVector
}

/** The marks and hook of each claim of a batch, `ids` in the batch's order. A failed insert fails the step. */
async function guardarMarcasYGanchos(
  db: Db,
  lote: readonly Extraidas["afirmaciones"][number][],
  ids: readonly string[],
): Promise<void> {
  const idDe = (i: number): string => {
    const id = ids[i]
    if (id === undefined) throw new Error(`Falta el id de la afirmación ${i} del lote.`)
    return id
  }
  const marcas = lote.flatMap((f, i) =>
    f.marcas.map((m) => ({
      afirmacion_id: idDe(i),
      marca: m.marca,
      red: m.red,
      valor: m.valor,
      frase: m.frase,
      certeza: m.certeza,
      por_que: m.porQue,
      version_id: m.versionId,
      origen: "extraccion" as const,
    })),
  )
  if (marcas.length > 0) {
    const r = await db.from("afirmacion_marcas").insert(marcas)
    if (r.error) throw falloDeBase("No pude guardar las marcas de las afirmaciones", r.error)
  }
  const ganchos = lote.flatMap((f, i) =>
    f.ganchoDetalle
      ? [
          {
            afirmacion_id: idDe(i),
            frase_exacta: f.ganchoDetalle.fraseExacta,
            frase_sin_gancho: f.ganchoDetalle.fraseSinGancho,
            tipo: f.ganchoDetalle.tipo,
            certeza: f.ganchoDetalle.certeza,
            version_id: f.ganchoDetalle.versionId,
            origen: "extraccion" as const,
          },
        ]
      : [],
  )
  if (ganchos.length > 0) {
    const r = await db.from("ganchos").insert(ganchos)
    if (r.error) throw falloDeBase("No pude guardar los ganchos de las afirmaciones", r.error)
  }
}

function idiomaDominante(extraidas: readonly Extraidas[]): string | null {
  const cuentas = new Map<string, number>()
  for (const e of extraidas) if (e.afirmaciones.length > 0) cuentas.set(e.idioma, (cuentas.get(e.idioma) ?? 0) + 1)
  return [...cuentas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Step 2 for referente, evidencia and voz_propia: claims per chunk, embedded and assigned to topics. Idempotent from
 * the checkpoints in the store. Says which language the chunks were in, for a material that had no other way to know.
 */
export async function afirmarMaterial(
  ctx: Contexto,
  partes: readonly Parte[],
): Promise<Limite | { limite: false; idioma: string | null }> {
  const { db } = ctx.deps
  const tramos = aTramos(partes)
  const vocabulario = await leerVocabulario(db)
  const extraccion = await extraerPorTramo(ctx, tramos, vocabulario)
  if (extraccion.limite) return LIMITE
  const { extraidas } = extraccion
  const calibracion = await leerCalibracion(db)
  const textos = extraidas.flatMap((e) => e.afirmaciones.map((a) => a.texto))
  const vectores = await embeberAfirmaciones(ctx, textos, calibracion.modelo)
  const temasAnteriores = await temasDeLasAfirmaciones(db, ctx.material.id)
  const ids = await reemplazarAfirmaciones(ctx, tramos, extraidas, vectores, calibracion.modelo)
  for (let desde = 0; desde < ids.length; desde += IDS_POR_CONSULTA) {
    await asignarATemas({ db }, ids.slice(desde, desde + IDS_POR_CONSULTA), calibracion)
  }
  for (const temaId of temasAnteriores) await recalcularTema(db, temaId)
  return { limite: false, idioma: idiomaDominante(extraidas) }
}
