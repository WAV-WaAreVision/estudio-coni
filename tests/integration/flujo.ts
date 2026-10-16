import type pg from "pg"
import { cambiosDesdePieza, type FilaPieza, piezaDesdeFila } from "@/lib/datos/piezas"
import type { Destino } from "@/lib/dominio/destinos"
import { type Estado, type Evento, transicionar } from "@/lib/dominio/estados"
import { hashPuerta1, hashTexto, hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { asumir, comoConi, comoPostgres, comoServicio, type Sesion } from "./db"

export const GUION = "Hola, soy Coni. Hoy hablamos de límites."
export const AUDIO = "audio-1"
export const AVATAR = "look-1"
export const VIDEO = "video-1"
export const TEXTO = "Un texto para acompañar el video."

/** A row as node-postgres returns it: the domain columns plus the ones only the database writes. */
export type FilaLeida = FilaPieza & {
  id: string
  puerta1_por: string | null
  puerta2_por: string | null
  avatar_id: string | null
  puerta1_formula: number | null
  puerta2_formula: number | null
  destinos: string[]
  texto: string | null
  texto_linkedin: string | null
  permalink: string | null
  media_id: string | null
  revision: unknown
}

export async function leer(c: pg.PoolClient, id: string): Promise<FilaLeida> {
  const { rows } = await c.query<FilaLeida>("select * from public.piezas where id = $1", [id])
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

/** The optimistic-lock write the server uses: it only matches the version that was read. */
export async function actualizar(
  c: pg.PoolClient,
  id: string,
  versionLeida: number,
  columnas: Record<string, unknown>,
): Promise<pg.QueryResult<FilaLeida>> {
  const nombres = Object.keys(columnas)
  const asignaciones = nombres.map((nombre, i) => `${nombre} = $${i + 3}`).join(", ")
  return c.query<FilaLeida>(`update public.piezas set ${asignaciones} where id = $1 and version = $2 returning *`, [
    id,
    versionLeida,
    ...nombres.map((nombre) => columnas[nombre]),
  ])
}

export async function crearPieza(c: pg.PoolClient): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Prueba') returning id")
  const fila = rows[0]
  if (!fila) throw new Error("No se creó la pieza")
  return fila.id
}

/** Reads the row as `sesion`, applies the real domain transition and writes it with the version guard. */
export async function aplicar(
  c: pg.PoolClient,
  id: string,
  sesion: Sesion,
  evento: Evento,
  extra: Record<string, unknown> = {},
): Promise<FilaLeida> {
  await asumir(c, sesion)
  const antes = piezaDesdeFila(await leer(c, id))
  const { pieza } = transicionar(antes, evento)
  const { rows } = await actualizar(c, id, antes.version, { ...cambiosDesdePieza(pieza), ...extra })
  const fila = rows[0]
  if (!fila) throw new Error(`La base no actualizó la pieza en ${antes.estado} con ${evento.tipo}`)
  return fila
}

const ahora = (): string => new Date().toISOString()
const maniana = (): string => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

/**
 * Gate 1 as the screen writes it: Coni's session, with the avatar and the formula in the same update as the
 * approval.
 */
export function aprobarComoConi(c: pg.PoolClient, id: string, en: string): Promise<FilaLeida> {
  const hash = hashPuerta1({ formula: 2, guion: GUION, texto: TEXTO, avatarId: AVATAR })
  return aplicar(
    c,
    id,
    comoConi,
    { tipo: "aprobar_guion", actor: "coni", hashVisto: hash, hashActual: hash, en },
    { avatar_id: AVATAR, puerta1_formula: 2 },
  )
}

/**
 * What a piece carries for LinkedIn. Without it the walk makes an approval from before LinkedIn (formula 1, Instagram
 * only); with it, gate 2 is approved with formula 2 for those destinations and that LinkedIn text.
 */
export interface OpcionesDePieza {
  destinos?: readonly Destino[]
  textoLinkedin?: string | null
}

type Paso = (c: pg.PoolClient, id: string) => Promise<FilaLeida>

function pasos(opciones: OpcionesDePieza): Paso[] {
  const conLinkedin = opciones.destinos !== undefined || opciones.textoLinkedin !== undefined
  const destinos = opciones.destinos ?? ["instagram"]
  const aprobacion = conLinkedin
    ? {
        formula: 2 as const,
        hash: hashTextoDePuerta2(2, { texto: TEXTO, textoLinkedin: opciones.textoLinkedin ?? null, destinos }),
        extra: { destinos: [...destinos] },
      }
    : { formula: 1 as const, hash: hashTexto(TEXTO), extra: {} }
  return [
    (c, id) => aplicar(c, id, comoConi, { tipo: "elegir" }),
    (c, id) =>
      aplicar(
        c,
        id,
        comoServicio,
        { tipo: "guion_listo", audioId: null, explicacion: TEXTO_SIN_VOZ },
        {
          guion: GUION,
          texto: TEXTO,
          ...(opciones.textoLinkedin === undefined ? {} : { texto_linkedin: opciones.textoLinkedin }),
        },
      ),
    (c, id) => aprobarComoConi(c, id, ahora()),
    (c, id) => aplicar(c, id, comoServicio, { tipo: "render_entregado" }),
    (c, id) => aplicar(c, id, comoServicio, { tipo: "video_listo", videoId: VIDEO }),
    (c, id) =>
      aplicar(
        c,
        id,
        comoConi,
        {
          tipo: "aprobar_video",
          actor: "coni",
          videoVisto: VIDEO,
          hashTextoVisto: aprobacion.hash,
          hashTextoActual: aprobacion.hash,
          formula: aprobacion.formula,
          publicarEn: maniana(),
          en: ahora(),
        },
        aprobacion.extra,
      ),
    (c, id) => aplicar(c, id, comoServicio, { tipo: "publicado" }),
  ]
}

/** The two states that come after `programado` without Instagram: the last steps replace `publicado`. */
const PASO_A_MANO: Partial<Record<Estado, Paso>> = {
  para_subir_a_mano: (c, id) => aplicar(c, id, comoServicio, { tipo: "entregar_para_subir" }),
}

const PASOS_HASTA: Partial<Record<Estado, number>> = {
  idea: 0,
  guion_en_proceso: 1,
  guion_por_aprobar: 2,
  // Walked to guion_por_aprobar, then Coni asks for her voice (`crearPiezaEn`).
  grabando_voz: 2,
  en_render: 3,
  subtitulando: 4,
  video_por_aprobar: 5,
  programado: 6,
  publicado: 7,
  para_subir_a_mano: 7,
  publicado_a_mano: 7,
}

/** Creates a piece and walks it through the real flow, each step written by the actor the design assigns to it. */
export async function crearPiezaEn(c: pg.PoolClient, destino: Estado, opciones: OpcionesDePieza = {}): Promise<string> {
  const cuantos = PASOS_HASTA[destino]
  if (cuantos === undefined) throw new Error(`Sin ruta de prueba hacia ${destino}`)
  const id = await crearPieza(c)
  const hastaProgramado = destino === "publicado_a_mano" || destino in PASO_A_MANO ? 6 : cuantos
  for (const paso of pasos(opciones).slice(0, hastaProgramado)) {
    await paso(c, id)
  }
  if (destino === "grabando_voz") await aplicar(c, id, comoConi, { tipo: "pedir_voz" })
  const aMano = PASO_A_MANO[destino]
  if (aMano) await aMano(c, id)
  if (destino === "publicado_a_mano")
    await aplicar(c, id, comoConi, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "instagram",
      quedanPendientes: false,
    })
  return id
}
