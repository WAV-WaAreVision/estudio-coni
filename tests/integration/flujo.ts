import type pg from "pg"
import { type Estado, type EstadoAntesDelError, type Evento, type Pieza, transicionar } from "@/lib/dominio/estados"
import { hashPuerta1, hashTexto } from "@/lib/dominio/puertas"
import { asumir, comoConi, comoPostgres, comoServicio, type Sesion } from "./db"

export const GUION = "Hola, soy Coni. Hoy hablamos de límites."
export const AUDIO = "audio-1"
export const VIDEO = "video-1"
export const TEXTO = "Un texto para acompañar el video."

export interface FilaPieza {
  id: string
  estado: Estado
  version: number
  intento: number
  estado_antes_del_error: EstadoAntesDelError | null
  audio_id: string | null
  video_id: string | null
  puerta1_hash: string | null
  puerta1_en: Date | null
  puerta1_por: string | null
  puerta2_video_id: string | null
  puerta2_hash_texto: string | null
  puerta2_publicar_en: Date | null
  puerta2_en: Date | null
  puerta2_por: string | null
  explicacion: string | null
}

function piezaDeFila(f: FilaPieza): Pieza {
  const puerta1 = f.puerta1_hash && f.puerta1_en ? { hash: f.puerta1_hash, en: f.puerta1_en.toISOString() } : null
  const puerta2 =
    f.puerta2_video_id && f.puerta2_hash_texto && f.puerta2_publicar_en && f.puerta2_en
      ? {
          videoId: f.puerta2_video_id,
          hashTexto: f.puerta2_hash_texto,
          publicarEn: f.puerta2_publicar_en.toISOString(),
          en: f.puerta2_en.toISOString(),
        }
      : null
  return {
    estado: f.estado,
    version: f.version,
    intento: f.intento,
    estadoAntesDelError: f.estado_antes_del_error,
    audioId: f.audio_id,
    videoId: f.video_id,
    puerta1,
    puerta2,
    explicacion: f.explicacion,
  }
}

function columnasDe(p: Pieza): Record<string, unknown> {
  return {
    estado: p.estado,
    version: p.version,
    intento: p.intento,
    estado_antes_del_error: p.estadoAntesDelError,
    audio_id: p.audioId,
    video_id: p.videoId,
    puerta1_hash: p.puerta1?.hash ?? null,
    puerta1_en: p.puerta1?.en ?? null,
    puerta2_video_id: p.puerta2?.videoId ?? null,
    puerta2_hash_texto: p.puerta2?.hashTexto ?? null,
    puerta2_publicar_en: p.puerta2?.publicarEn ?? null,
    puerta2_en: p.puerta2?.en ?? null,
    explicacion: p.explicacion,
  }
}

export async function leer(c: pg.PoolClient, id: string): Promise<FilaPieza> {
  const { rows } = await c.query<FilaPieza>("select * from public.piezas where id = $1", [id])
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
): Promise<pg.QueryResult<FilaPieza>> {
  const nombres = Object.keys(columnas)
  const asignaciones = nombres.map((nombre, i) => `${nombre} = $${i + 3}`).join(", ")
  return c.query<FilaPieza>(`update public.piezas set ${asignaciones} where id = $1 and version = $2 returning *`, [
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
): Promise<FilaPieza> {
  await asumir(c, sesion)
  const antes = piezaDeFila(await leer(c, id))
  const { pieza } = transicionar(antes, evento)
  const { rows } = await actualizar(c, id, antes.version, { ...columnasDe(pieza), ...extra })
  const fila = rows[0]
  if (!fila) throw new Error(`La base no actualizó la pieza en ${antes.estado} con ${evento.tipo}`)
  return fila
}

const ahora = (): string => new Date().toISOString()
const maniana = (): string => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const PASOS: ((c: pg.PoolClient, id: string) => Promise<FilaPieza>)[] = [
  (c, id) => aplicar(c, id, comoConi, { tipo: "elegir" }),
  (c, id) => aplicar(c, id, comoServicio, { tipo: "guion_listo", audioId: AUDIO }, { guion: GUION, texto: TEXTO }),
  (c, id) =>
    aplicar(c, id, comoConi, {
      tipo: "aprobar_guion",
      actor: "coni",
      hashVisto: hashPuerta1({ guion: GUION, audioId: AUDIO }),
      hashActual: hashPuerta1({ guion: GUION, audioId: AUDIO }),
      en: ahora(),
    }),
  (c, id) => aplicar(c, id, comoServicio, { tipo: "render_entregado" }),
  (c, id) => aplicar(c, id, comoServicio, { tipo: "video_listo", videoId: VIDEO }),
  (c, id) =>
    aplicar(c, id, comoConi, {
      tipo: "aprobar_video",
      actor: "coni",
      videoVisto: VIDEO,
      hashTextoVisto: hashTexto(TEXTO),
      hashTextoActual: hashTexto(TEXTO),
      publicarEn: maniana(),
      en: ahora(),
    }),
  (c, id) => aplicar(c, id, comoServicio, { tipo: "publicado" }),
]

const PASOS_HASTA: Partial<Record<Estado, number>> = {
  idea: 0,
  guion_en_proceso: 1,
  guion_por_aprobar: 2,
  en_render: 3,
  subtitulando: 4,
  video_por_aprobar: 5,
  programado: 6,
  publicado: 7,
}

/** Creates a piece and walks it through the real flow, each step written by the actor the design assigns to it. */
export async function crearPiezaEn(c: pg.PoolClient, destino: Estado): Promise<string> {
  const pasos = PASOS_HASTA[destino]
  if (pasos === undefined) throw new Error(`Sin ruta de prueba hacia ${destino}`)
  const id = await crearPieza(c)
  for (const paso of PASOS.slice(0, pasos)) {
    await paso(c, id)
  }
  return id
}
