import { CONI, pool } from "../integration/db"
import { vaciarMotor } from "../integration/siembra"
import { BALDE_DE_PRUEBA, URL_DEL_ALMACEN } from "./entorno"

// The run's Biblioteca: the run owns `materiales` (D16), so the scene empties it first and the teardown last.

export const AUTORA = "Daniela Ruiz"
export const CREDENCIAL = "investigadora de confianza"
export const TEMA_PRINCIPAL = "Carga mental"
const TEMAS = [TEMA_PRINCIPAL, "Pausas activas"]
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
  await pool.query("delete from public.temas where nombre = any($1::text[])", [TEMAS])
  await pool.query("delete from public.autores where nombre = $1", [AUTORA])
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
