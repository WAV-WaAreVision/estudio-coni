import { z } from "zod"
import { CONI, pool } from "../integration/db"
import { vaciarMotor } from "../integration/siembra"
import { BALDE_DE_PRUEBA, URL_DEL_ALMACEN } from "./entorno"

// The run's Biblioteca: the run owns `materiales` (D16), so the scene empties it first and the teardown last.

export const AUTORA = "Daniela Ruiz"
export const CREDENCIAL = "investigadora de confianza"
export const TEMA_PRINCIPAL = "Carga mental"
export const OTRO_TEMA = "Pausas activas"
const TEMAS = [TEMA_PRINCIPAL, OTRO_TEMA]
export const OTRA_AUTORA = "D. Ruiz"
export const SIN_MATERIAL = "Instituto del Descanso"
export const TEMA_DE_UN_AUTOR = "Descanso digital"
export const TEMA_FUSIONADO = "Pausas cortas"
export const PILAR = "IA y salud mental"
export const IDEA_DE_CONI = "Repartir la carga mental empieza por nombrarla."
/** One of the two ideas of Daniela in Carga mental (sembrarBiblioteca). */
export const IDEA_QUE_SE_OCULTA = "Las pausas acordadas protegen."
/** The only idea of Pausas activas (sembrarBiblioteca). */
export const IDEA_UNICA_DE_PAUSAS = "Una pausa corta cada hora ayuda."
const BUCLE_UNO = "Bucle uno"
const BUCLE_DOS = "Bucle dos"
/** Every topic batch 3's scenes make, so the teardown leaves none behind. */
const TEMAS_DE_AUTORES_Y_TEMAS = [TEMA_DE_UN_AUTOR, TEMA_FUSIONADO, BUCLE_UNO, BUCLE_DOS]

const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

export const TITULO_LISTO = "Burnout y teletrabajo: revisión 2024"
export const TITULO_ESTRATEGIA = "Plan de contenidos de noviembre"
export const RESUMEN_ESTRATEGIA = "Qué publicar en noviembre y por qué."

export interface EscenaDeBiblioteca {
  listo: string
  procesando: string
  conError: string
  esperaOk: string
  estrategia: string
}

async function uno(sql: string, params: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`La escena no pudo crear: ${sql.slice(0, 60)}`)
  return id
}

async function material(campos: {
  titulo: string
  tipo: string
  autorId: string
  rol: string
  estado: string
  motivo?: string
  costo?: number
  hace: string
}): Promise<string> {
  return uno(
    `insert into public.materiales
       (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo,
        costo_estimado_usd, creado_en)
     values ($1, $2, $3, $4, 'texto de prueba', now(), $5, $6, $7, $8, now() - $9::interval) returning id`,
    [
      campos.titulo,
      campos.tipo,
      campos.autorId,
      campos.rol,
      CONI,
      campos.estado,
      campos.motivo ?? null,
      campos.costo ?? null,
      campos.hace,
    ],
  )
}

async function ideas(materialId: string, autorId: string, temaId: string, textos: string[], evidencia: string) {
  for (const [indice, texto] of textos.entries()) {
    await pool.query(
      `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, creada_en)
       values ($1, $2, 0, '{"pagina":1}'::jsonb, $3, 'cita', 'dato', $4, $5, now() + $6 * interval '1 millisecond')`,
      [materialId, autorId, texto, evidencia, temaId, indice],
    )
  }
}

/** The original text the task would have written, put in the fake R2 with an unsigned PUT. */
async function textoOriginal(materialId: string, texto: string): Promise<void> {
  const respuesta = await fetch(`${URL_DEL_ALMACEN}/${BALDE_DE_PRUEBA}/materiales/${materialId}/texto-original.txt`, {
    method: "PUT",
    body: texto,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
  if (!respuesta.ok) throw new Error(`El almacén falso no guardó el texto: ${respuesta.status}`)
}

export async function vaciarBiblioteca(): Promise<void> {
  // Emptying every material would orphan the authors a scene's theories made (`vaciarMotor` finds them through their
  // seeded materials) and leave them for `pnpm test:db` to count: the engine's seed goes first.
  await vaciarMotor()
  await pool.query("delete from public.materiales")
  await pool.query("delete from public.temas where nombre = any($1::text[])", [[...TEMAS, ...TEMAS_DE_AUTORES_Y_TEMAS]])
  await pool.query("delete from public.autores where nombre = any($1::text[])", [[AUTORA, OTRA_AUTORA, SIN_MATERIAL]])
}

/** Five materials, one per state the screens draw, plus a strategy card. Titles are the mockup's. */
export async function sembrarBiblioteca(): Promise<EscenaDeBiblioteca> {
  await vaciarBiblioteca()
  const autora = await uno(
    "insert into public.autores (nombre, credencial, tipo) values ($1, $2, 'persona') returning id",
    [AUTORA, CREDENCIAL],
  )
  const coni = await uno("select id from public.autores where tipo = 'coni'", [])
  const [carga, pausas] = await Promise.all(
    TEMAS.map((nombre) =>
      uno("insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id", [
        nombre,
        CENTROIDE,
      ]),
    ),
  )
  if (!carga || !pausas) throw new Error("La escena no creó sus temas")

  const listo = await material({
    titulo: TITULO_LISTO,
    tipo: "documento",
    autorId: autora,
    rol: "referente",
    estado: "listo",
    hace: "2 days",
  })
  await ideas(
    listo,
    autora,
    carga,
    ["El aislamiento pesa más que las horas extra.", "Las pausas acordadas protegen."],
    "estudio",
  )
  await ideas(listo, autora, pausas, ["Una pausa corta cada hora ayuda."], "opinion")
  await textoOriginal(listo, "Texto original de la revisión.")

  const procesando = await material({
    titulo: "Liderar con IA sin perder a las personas",
    tipo: "link",
    autorId: coni,
    rol: "voz_propia",
    estado: "procesando",
    hace: "1 minute",
  })
  const conError = await material({
    titulo: "Notas del taller de TDAH adulto",
    tipo: "post",
    autorId: coni,
    rol: "voz_propia",
    estado: "fallido",
    motivo: "sin_texto",
    hace: "1 day",
  })
  const esperaOk = await material({
    titulo: "Charla larga sobre el síndrome del impostor",
    tipo: "audio",
    autorId: autora,
    rol: "referente",
    estado: "procesando",
    costo: 1.2,
    hace: "3 days",
  })
  const estrategia = await material({
    titulo: TITULO_ESTRATEGIA,
    tipo: "documento",
    autorId: coni,
    rol: "estrategia",
    estado: "listo",
    hace: "20 days",
  })
  await pool.query(
    `insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)`,
    [
      estrategia,
      RESUMEN_ESTRATEGIA,
      JSON.stringify([
        "Dos reels por semana sobre carga mental.",
        "Un carrusel de mitos del burnout.",
        "Responder preguntas de la comunidad los viernes.",
        "Cerrar el mes con una pieza sobre descanso.",
        "Medir guardados más que me gusta.",
      ]),
      JSON.stringify([{ texto: "Noviembre es el mes más cansado del año.", ubicacion: { pagina: 2 } }]),
      JSON.stringify({ autor: "Equipo de contenidos", anio: 2026, enlace: "https://ejemplo.test/plan-noviembre" }),
    ],
  )
  return { listo, procesando, conError, esperaOk, estrategia }
}

const Objetos = z.record(z.string(), z.object({ bytes: z.number(), tipo: z.string(), firmada: z.boolean() }))

/** What the fake R2 holds, by `/<bucket>/<key>`: size, content type and whether the PUT was presigned. */
export async function objetosDelAlmacen(): Promise<z.infer<typeof Objetos>> {
  const respuesta = await fetch(`${URL_DEL_ALMACEN}/__objetos`)
  if (!respuesta.ok) throw new Error(`El almacén falso no listó sus objetos: ${respuesta.status}`)
  return Objetos.parse(await respuesta.json())
}

export interface EscenaDeAutoresYTemas extends EscenaDeBiblioteca {
  autora: string
  otraAutora: string
  sinMaterial: string
  coni: string
  nombreDeConi: string
  carga: string
  pausas: string
  deUnAutor: string
  fusionado: string
  pilar: string
}

/**
 * Batch 3's scene, on top of batch 1's five materials (whose specs keep counting five): a second author to join, one
 * with nothing, an idea of Coni's own (so Carga mental reads "Ya lo traté"), a pillar on Carga mental, a topic of one
 * author and a topic merged into Pausas activas.
 *   Topics: Carga mental 3 ideas · 2 autores (tratado, pilar) · Descanso digital 2 · 1 · Pausas activas 1 · 1.
 *   Authors: Daniela 2 materiales · 3 ideas · D. Ruiz 1 · 2 · Coni 4 · 1 · Instituto del Descanso nothing.
 */
export async function sembrarAutoresYTemas(): Promise<EscenaDeAutoresYTemas> {
  const base = await sembrarBiblioteca()
  // The run owns the Biblioteca (D16): an author or a topic nothing of this scene uses is another run's leftover.
  await pool.query(
    `delete from public.autores a where a.tipo <> 'coni'
       and not exists (select 1 from public.materiales m where m.autor_id = a.id)
       and not exists (select 1 from public.afirmaciones f where f.autor_id = a.id)`,
  )
  await pool.query(
    "delete from public.temas t where not exists (select 1 from public.afirmaciones f where f.tema_id = t.id)",
  )

  const autora = await uno("select id from public.autores where nombre = $1", [AUTORA])
  const { rows: deConi } = await pool.query<{ id: string; nombre: string }>(
    "select id, nombre from public.autores where tipo = 'coni'",
  )
  const coni = deConi[0]
  if (!coni) throw new Error("La escena no encontró a la autora Coni")
  const carga = await uno("select id from public.temas where nombre = $1", [TEMA_PRINCIPAL])
  const pausas = await uno("select id from public.temas where nombre = $1", [OTRO_TEMA])
  const pilar = await uno("select id from public.categorias where nombre = $1 and es_pilar and activa", [PILAR])
  await pool.query("update public.temas set categoria_id = $1 where id = $2", [pilar, carga])

  const charla = await material({
    titulo: "Charla: la carga mental en casa",
    tipo: "documento",
    autorId: coni.id,
    rol: "voz_propia",
    estado: "listo",
    hace: "5 days",
  })
  await ideas(charla, coni.id, carga, [IDEA_DE_CONI], "clinica")

  const otraAutora = await uno("insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    OTRA_AUTORA,
  ])
  const deUnAutor = await uno(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [TEMA_DE_UN_AUTOR, CENTROIDE],
  )
  const notas = await material({
    titulo: "Notas sobre descanso digital",
    tipo: "documento",
    autorId: otraAutora,
    rol: "referente",
    estado: "listo",
    hace: "6 days",
  })
  await ideas(
    notas,
    otraAutora,
    deUnAutor,
    ["Apagar las notificaciones de noche ayuda a dormir.", "Una hora sin pantalla antes de dormir."],
    "opinion",
  )
  const sinMaterial = await uno("insert into public.autores (nombre, tipo) values ($1, 'institucion') returning id", [
    SIN_MATERIAL,
  ])
  const fusionado = await uno(
    "insert into public.temas (nombre, centroide, fusionado_en) values ($1, $2::extensions.vector, $3) returning id",
    [TEMA_FUSIONADO, CENTROIDE, pausas],
  )
  return {
    ...base,
    autora,
    otraAutora,
    sinMaterial,
    coni: coni.id,
    nombreDeConi: coni.nombre,
    carga,
    pausas,
    deUnAutor,
    fusionado,
    pilar,
  }
}

/** Two topics merged into each other: an address that never ends, for the not-found check. */
export async function sembrarTemasEnBucle(): Promise<string> {
  const primero = await uno(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [BUCLE_UNO, CENTROIDE],
  )
  const segundo = await uno(
    "insert into public.temas (nombre, centroide, fusionado_en) values ($1, $2::extensions.vector, $3) returning id",
    [BUCLE_DOS, CENTROIDE, primero],
  )
  await pool.query("update public.temas set fusionado_en = $1 where id = $2", [segundo, primero])
  return primero
}
