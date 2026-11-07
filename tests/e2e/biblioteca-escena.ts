import { randomUUID } from "node:crypto"
import { z } from "zod"
import { domingoDeSemana } from "@/lib/motor/semana"
import { CONI, pool } from "../integration/db"
import { limpiarBorradores } from "../integration/limpiar-borradores"
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
/** Carga mental's pillar in LinkedIn (short name, as the select and the page say it), and one «También toca». */
export const PILAR = "Bienestar e impacto"
export const PILAR_SECUNDARIO = "Diagnóstico doble"
/** Descanso digital's pillar in Instagram, and the layer Pausas activas carries (spec 2026-11-04, part 15b). */
export const PILAR_DE_INSTAGRAM = "Inteligencia emocional"
export const CAPA = "Capa TDAH"
/** The pillar draft of the scene (15c): on Instagram, whose weights have no later stage (decision 20). */
export const BORRADOR_DE_INSTAGRAM = {
  nombre: "Cuerpo y pantalla: lo que el cuerpo dice frente a la IA",
  nombreCorto: "Cuerpo y pantalla",
  descripcion: "Lo que el cuerpo avisa cuando pasamos el día frente a la pantalla y la IA, y cómo escucharlo.",
}
export const RED_EN_BORRADOR = "TikTok"
/** The piece that went out on LinkedIn with Carga mental: vaciarBiblioteca finds it by this title. */
const TITULO_DE_LA_PIEZA_PUBLICADA = "Repartir la carga mental, en LinkedIn"
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
  for (const texto of textos) {
    await pool.query(
      `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, creada_en)
       values ($1, $2, 0, '{"pagina":1}'::jsonb, $3, 'cita', 'dato', $4, $5, clock_timestamp())`,
      [materialId, autorId, texto, evidencia, temaId],
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
  // Approved drafts became pillars with weights: they go, and the seed's weights come back (15c, decision 19).
  await limpiarBorradores()
  // The scene's published piece points at an engine idea: it goes before vaciarMotor deletes that idea.
  await pool.query("delete from public.piezas where titulo = $1", [TITULO_DE_LA_PIEZA_PUBLICADA])
  // Temas opens on the stored network: every scene starts with none, as `pnpm db:reset` leaves it.
  await pool.query("update public.ajustes set ultima_red = null")
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
 *   Topics: Carga mental 3 ideas · 2 autores (out on LinkedIn only, pilar) · Descanso digital 2 · 1 (pilar in
 *   Instagram) · Pausas activas 1 · 1 (Capa TDAH).
 *   Authors: Daniela 2 materiales · 3 ideas · D. Ruiz 1 · 2 · Coni 4 · 1 · Instituto del Descanso nothing.
 */
export async function sembrarAutoresYTemas(): Promise<EscenaDeAutoresYTemas> {
  const base = await sembrarBiblioteca()
  // The run owns the Biblioteca (D16): an author or a topic nothing of this scene uses is another run's leftover.
  // It also drops every orphan author and topic of the local DB (the pool is local only, exigirBaseLocal): a local DB
  // restored from prod loses them.
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
  const pilar = await uno("select id from public.categorias where nombre_corto = $1 and red is not null and activa", [
    PILAR,
  ])
  // Its pillar in LinkedIn and one «También toca»; nothing in Instagram (spec 2026-11-04, part 15a). As postgres:
  // only the RPCs write tema_pilares from the app.
  await pool.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1, c.id, c.red, c.es_capa, case when c.nombre_corto = $2 then 'alta' else 'media' end, 'coni'
       from public.categorias c where c.nombre_corto = any($3::text[]) and c.red is not null`,
    [carga, PILAR, [PILAR, PILAR_SECUNDARIO]],
  )

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
  // Each network's row has a topic to list: Descanso digital's pillar in Instagram, the TDAH layer on Pausas activas.
  await pool.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select f.tema_id, c.id, c.red, c.es_capa, case when c.es_capa then null else 'alta' end, 'coni'
       from (values ($1::uuid, $2::text), ($3::uuid, $4::text)) as f (tema_id, nombre_corto)
       join public.categorias c on c.nombre_corto = f.nombre_corto and c.red is not null and c.activa`,
    [deUnAutor, PILAR_DE_INSTAGRAM, pausas, CAPA],
  )
  // Carga mental went out on LinkedIn only, uploaded by hand: «Ya lo traté» there, «Sin tratar» on Instagram. The only
  // path from a piece to a topic is its idea's theory. The piece stays in `idea`, so Inicio and the calendar never
  // list it.
  const teoria = await uno(
    "insert into public.teorias (titulo, tesis, origen, temas) values ($1, $2, 'motor', $3::uuid[]) returning id",
    ["Nombrar la carga mental", "Repartirla empieza por nombrarla.", [carga]],
  )
  const idea = await uno(
    `insert into public.ideas (pilar, gancho, formato, fuerza, estado, origen, teoria_id)
     select c.slug, $1, 'Carrusel', 'alta', 'usada', 'motor', $2
       from public.categorias c where c.nombre_corto = $3 and c.red is not null and c.activa
     returning id`,
    ["La carga mental se reparte", teoria, PILAR],
  )
  const pieza = await uno("insert into public.piezas (idea_id, titulo) values ($1, $2) returning id", [
    idea,
    TITULO_DE_LA_PIEZA_PUBLICADA,
  ])
  await pool.query(
    "insert into public.publicaciones (pieza_id, destino, estado, marcado_en) values ($1, 'linkedin', 'subido_a_mano', now())",
    [pieza],
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

/** A pillar draft on Instagram (10 %) and a network draft, as Coni would leave them. */
export async function sembrarBorradores(): Promise<{ pilar: string; red: string }> {
  await limpiarBorradores()
  const pilar = await uno(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ('instagram', $1, $2, $3, 10) returning id`,
    [BORRADOR_DE_INSTAGRAM.nombre, BORRADOR_DE_INSTAGRAM.nombreCorto, BORRADOR_DE_INSTAGRAM.descripcion],
  )
  const red = await uno("insert into public.borradores_de_red (nombre, manual) values ($1, $2) returning id", [
    RED_EN_BORRADOR,
    "Videos cortos para mujeres líderes jóvenes.",
  ])
  return { pilar, red }
}

/**
 * A later weight stage of LinkedIn of the scene's own, 400 days ahead (after the seed's 2027 stages at any date), at
 * 25 % for each active pillar; `limpiarBorradores` takes it away with every row that is not the seed's.
 */
export async function sembrarEtapaDeLinkedin(): Promise<string> {
  const { rows } = await pool.query<{ desde: string }>(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select id, red, es_capa, (now() at time zone 'America/Santiago')::date + 400, 25 from public.categorias
     where es_pilar and activa and not es_capa and red = 'linkedin'
     returning desde::text as desde`,
  )
  const desde = rows[0]?.desde
  if (!desde) throw new Error("La escena no pudo crear la etapa de LinkedIn")
  return desde
}

export const TEORIA_PRINCIPAL = "Repartir la carga también es descansar"
export const TEORIA_DEBIL = "El descanso digital se aprende"
export const RAZON_DE_CRUCE = "No hay ideas de dos autores distintos."
export const OTRA_RAZON_DE_CRUCE = "Repite lo que el motor cruzó la semana pasada."
/** A single-author topic the engine named and that is gone since: listed without a link. */
export const TEMA_QUE_YA_NO_ESTA = "Sueño y pantallas"
export const MOTIVO_DE_FALLA = "No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo."

export interface EscenaDeSemana extends EscenaDeAutoresYTemas {
  /** This week's closing Sunday, as the engine keys it. */
  semana: string
}

const MS_POR_SEMANA = 7 * 86_400_000

/**
 * Batch 5's scene on top of batch 3's: three earlier ready runs (US$ 0,20, 0,25 and 0,30, so the estimate reads US$ 0,25
 * without this week and US$ 0,23 with this week's US$ 0,21), and this week's run in the state asked. A ready week has two
 * theories, two discarded crossings and what to upload: Descanso digital (linked) and a topic that is gone, Psicología
 * en la mesa (LinkedIn) and a retired pillar that drops out. `estado: null` leaves no run at all (the fixed US$ 0,30).
 */
export async function sembrarSemana(opciones: {
  estado: "lista" | "corriendo" | "fallida" | null
  teorias?: boolean
}): Promise<EscenaDeSemana> {
  const base = await sembrarAutoresYTemas()
  const semana = domingoDeSemana(new Date())
  if (opciones.estado === null) return { ...base, semana }
  const domingo = Date.parse(`${semana}T12:00:00Z`)
  for (const [semanas, costo] of [
    [1, 0.2],
    [2, 0.25],
    [3, 0.3],
  ] as const) {
    const anterior = new Date(domingo - semanas * MS_POR_SEMANA).toISOString().slice(0, 10)
    await pool.query(
      "insert into public.motor_corridas (semana, estado, costo_usd, resumen, terminada_en) values ($1, 'lista', $2, '{}'::jsonb, now())",
      [anterior, costo],
    )
  }
  const lista = opciones.estado === "lista"
  const resumen = lista
    ? {
        ideas: 3,
        manual: false,
        queSubir: {
          unSoloAutor: [TEMA_DE_UN_AUTOR, TEMA_QUE_YA_NO_ESTA],
          pilaresSinMaterial: ["psicologia-en-la-mesa", "pareja"],
        },
      }
    : {}
  await pool.query(
    "insert into public.motor_corridas (semana, estado, costo_usd, resumen, motivo_fallo) values ($1, $2, $3, $4::jsonb, $5)",
    [
      semana,
      opciones.estado,
      lista ? 0.21 : 0,
      JSON.stringify(resumen),
      opciones.estado === "fallida" ? MOTIVO_DE_FALLA : null,
    ],
  )
  if (lista && opciones.teorias !== false) {
    const teorias: [string, string, string, number, string | null, string[], string | null][] = [
      [
        "guardada",
        TEORIA_PRINCIPAL,
        "Quien reparte la carga mental descansa mejor.",
        0.82,
        "alto",
        [base.carga, base.pausas],
        null,
      ],
      [
        "guardada",
        TEORIA_DEBIL,
        "Apagar la pantalla es un hábito que se entrena.",
        0.61,
        "debil",
        [base.deUnAutor, randomUUID()],
        null,
      ],
      ["descartada_por_motor", "Cruce uno", "", 0.3, null, [base.carga, base.deUnAutor], RAZON_DE_CRUCE],
      ["descartada_por_motor", "Cruce dos", "", 0.2, null, [base.pausas], OTRA_RAZON_DE_CRUCE],
    ]
    for (const [estado, titulo, tesis, puntaje, nivel, temas, motivo] of teorias) {
      await pool.query(
        `insert into public.teorias (titulo, tesis, origen, estado, semana, puntaje, nivel_evidencia, temas, motivo_fallo)
         values ($1, $2, 'motor', $3, $4::date, $5, $6, $7::uuid[], $8)`,
        [titulo, tesis, estado, semana, puntaje, nivel, temas, motivo],
      )
    }
  }
  return { ...base, semana }
}
