import { hashTexto, hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { comoConi, pool } from "./db"
import { aplicar, crearPiezaEn, type OpcionesDePieza, TEXTO, VIDEO } from "./flujo"

const MINUTO = 60_000
// Far from any real piece in the database: the approved time is a fixed instant and "now" moves around it.
export const PUBLICAR_EN = "2031-03-14T22:00:00.000Z"

export function despues(minutos: number): string {
  return new Date(Date.parse(PUBLICAR_EN) + minutos * MINUTO).toISOString()
}

export const piezasCreadas: string[] = []

/** What a scheduled piece carries for LinkedIn; `aprobadoSobre` is the LinkedIn text gate 2 actually hashed. */
export type OpcionesDeProgramada = OpcionesDePieza & { aprobadoSobre?: string }

/**
 * A piece walked through the real flow to `programado`: Coni approved the video, the caption and PUBLICAR_EN. Without
 * options it is an approval from before LinkedIn (formula 1, Instagram only); with them, formula 2.
 */
export async function crearProgramada(publicarEn = PUBLICAR_EN, opciones: OpcionesDeProgramada = {}): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, "video_por_aprobar", opciones)
    const conLinkedin = opciones.destinos !== undefined || opciones.textoLinkedin !== undefined
    const destinos = opciones.destinos ?? ["instagram"]
    const hash = conLinkedin
      ? hashTextoDePuerta2(2, {
          texto: TEXTO,
          textoLinkedin: opciones.aprobadoSobre ?? opciones.textoLinkedin ?? null,
          destinos,
        })
      : hashTexto(TEXTO)
    await aplicar(
      c,
      id,
      comoConi,
      {
        tipo: "aprobar_video",
        actor: "coni",
        videoVisto: VIDEO,
        hashTextoVisto: hash,
        hashTextoActual: hash,
        formula: conLinkedin ? 2 : 1,
        publicarEn,
        en: new Date().toISOString(),
      },
      conLinkedin ? { destinos: [...destinos] } : {},
    )
    await c.query("commit")
    piezasCreadas.push(id)
    return id
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

export async function limpiarProgramadas(): Promise<void> {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
}
