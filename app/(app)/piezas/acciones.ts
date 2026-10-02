"use server"

import Anthropic from "@anthropic-ai/sdk"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { type DepsGuion, editarGuion, volverAVersionDeClaude } from "@/lib/acciones/guion"
import { urlParaDescargar } from "@/lib/acciones/medios"
import {
  aprobarGuion,
  aprobarVideo,
  cambiarFecha,
  descartar,
  editarTexto,
  elegirIdeas,
  MAXIMO_DEL_TEXTO,
  marcarSubidoAMano,
  pedirCambios,
  pedirDescargaDelVideo,
  regrabar,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import type { Resultado } from "@/lib/acciones/resultado"
import { clienteDeServicio, comoConi, conSesionDeConi } from "@/lib/acciones/servidor"
import { MAXIMO_DEL_GUION } from "@/lib/dominio/revision"
import { baseDe } from "@/lib/proveedores/bases"

// The model answers in a few seconds; a hung call must not hold the screen for the SDK's ten minutes.
const ESPERA_CLAUDE_MS = 60_000

function depsDeGuion(db: DepsGuion["db"]): DepsGuion {
  return {
    db,
    servicio: clienteDeServicio,
    crearClaude: (llave) =>
      new Anthropic({
        apiKey: llave,
        baseURL: baseDe(process.env, "ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        timeout: ESPERA_CLAUDE_MS,
        maxRetries: 1,
      }),
    ahora: () => new Date().toISOString(),
  }
}

const sobrePieza = z.object({ piezaId: z.uuid(), version: z.number().int().min(0) })

/** A successful action changes what every screen shows (the list, the detail, the "next slot" line). */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

export async function elegirIdeasAccion(ideaIds: string[]) {
  return refrescar(
    await comoConi("elegirIdeas", z.object({ ideaIds: z.array(z.uuid()) }), { ideaIds }, (deps, d) =>
      elegirIdeas(deps, d.ideaIds),
    ),
  )
}

export async function aprobarGuionAccion(piezaId: string, version: number, avatarId: string | null) {
  return refrescar(
    await comoConi(
      "aprobarGuion",
      sobrePieza.extend({ avatarId: z.string().max(200).nullable() }),
      { piezaId, version, avatarId },
      (deps, d) => aprobarGuion(deps, d.piezaId, d.version, d.avatarId),
    ),
  )
}

export async function pedirCambiosAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("pedirCambios", sobrePieza, { piezaId, version }, (deps, d) =>
      pedirCambios(deps, d.piezaId, d.version),
    ),
  )
}

export async function reintentarGuionAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("reintentarGuion", sobrePieza, { piezaId, version }, (deps, d) =>
      reintentarGuion(deps, d.piezaId, d.version),
    ),
  )
}

export async function editarTextoAccion(piezaId: string, version: number, texto: string) {
  return refrescar(
    await comoConi(
      "editarTexto",
      sobrePieza.extend({ texto: z.string().max(MAXIMO_DEL_TEXTO) }),
      { piezaId, version, texto },
      (deps, d) => editarTexto(deps, d.piezaId, d.version, d.texto),
    ),
  )
}

export async function editarGuionAccion(piezaId: string, version: number, guion: string, texto: string) {
  return refrescar(
    await conSesionDeConi(
      "editarGuion",
      sobrePieza.extend({ guion: z.string().max(MAXIMO_DEL_GUION), texto: z.string().max(MAXIMO_DEL_TEXTO) }),
      { piezaId, version, guion, texto },
      (db, d) => editarGuion(depsDeGuion(db), d),
    ),
  )
}

export async function volverAVersionDeClaudeAccion(piezaId: string, version: number) {
  return refrescar(
    await conSesionDeConi("volverAVersionDeClaude", sobrePieza, { piezaId, version }, (db, d) =>
      volverAVersionDeClaude(depsDeGuion(db), d),
    ),
  )
}

export async function aprobarVideoAccion(piezaId: string, version: number, publicarEn: string) {
  return refrescar(
    await comoConi(
      "aprobarVideo",
      sobrePieza.extend({ publicarEn: z.string().max(40) }),
      { piezaId, version, publicarEn },
      (deps, d) => aprobarVideo(deps, d.piezaId, d.version, d.publicarEn),
    ),
  )
}

export async function regrabarAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("regrabar", sobrePieza, { piezaId, version }, (deps, d) => regrabar(deps, d.piezaId, d.version)),
  )
}

export async function cambiarFechaAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("cambiarFecha", sobrePieza, { piezaId, version }, (deps, d) =>
      cambiarFecha(deps, d.piezaId, d.version),
    ),
  )
}

export async function descartarAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("descartar", sobrePieza, { piezaId, version }, (deps, d) => descartar(deps, d.piezaId, d.version)),
  )
}

export async function reintentarAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("reintentar", sobrePieza, { piezaId, version }, (deps, d) => reintentar(deps, d.piezaId, d.version)),
  )
}

/** Not revalidated: it only hands out a link and changes nothing on the piece. */
export async function descargarVideoAccion(piezaId: string) {
  return comoConi("pedirDescargaDelVideo", z.object({ piezaId: z.uuid() }), { piezaId }, (deps, d) =>
    pedirDescargaDelVideo(deps, d.piezaId, urlParaDescargar),
  )
}

export async function marcarSubidoAManoAccion(piezaId: string, version: number, enlace: string) {
  return refrescar(
    await comoConi(
      "marcarSubidoAMano",
      sobrePieza.extend({ enlace: z.string().max(500) }),
      { piezaId, version, enlace },
      (deps, d) => marcarSubidoAMano(deps, d.piezaId, d.version, d.enlace),
    ),
  )
}
