"use server"

import Anthropic from "@anthropic-ai/sdk"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { type DepsGuion, editarGuion, volverAVersionDeClaude } from "@/lib/acciones/guion"
import { urlParaDescargar } from "@/lib/acciones/medios"
import {
  aprobarCarrusel,
  aprobarGuion,
  aprobarVideo,
  cambiarDisenoDeCarrusel,
  cambiarFecha,
  descartar,
  deshacerAprobacion,
  editarTexto,
  editarTextoLinkedin,
  elegirIdeas,
  elegirLote,
  firmarCarrusel,
  hacerCarrusel,
  MAXIMO_DEL_TEXTO,
  marcarSubidoAMano,
  pedirCambioDeCarrusel,
  pedirCambios,
  pedirDescargaDelVideo,
  pedirVoz,
  regrabar,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import type { Resultado } from "@/lib/acciones/resultado"
import { clienteDeServicio, comoConi, conSesionDeConi, disparosDeLaApp } from "@/lib/acciones/servidor"
import { MAXIMO_DEL_PEDIDO } from "@/lib/dominio/carrusel"
import { DESTINOS } from "@/lib/dominio/destinos"
import { type CambioDeDiseno, VARIANTES } from "@/lib/dominio/diseno-carrusel"
import { MAXIMO_DEL_GUION, MAXIMO_TEXTO_LINKEDIN } from "@/lib/dominio/revision"
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
    disparar: disparosDeLaApp(),
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

export async function elegirLoteAccion(ideaIds: string[]) {
  const resultado = await comoConi(
    "elegirLote",
    z.object({ ideaIds: z.array(z.uuid()).max(20) }),
    { ideaIds },
    (deps, d) => elegirLote(deps, d.ideaIds),
  )
  // Refreshed either way: a batch that failed halfway may still have started scripts.
  revalidatePath("/", "layout")
  return resultado
}

export async function hacerCarruselAccion(ideaId: string) {
  return refrescar(
    await comoConi("hacerCarrusel", z.object({ ideaId: z.uuid() }), { ideaId }, (deps, d) =>
      hacerCarrusel(deps, d.ideaId),
    ),
  )
}

export async function firmarCarruselAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("firmarCarrusel", sobrePieza, { piezaId, version }, (deps, d) =>
      firmarCarrusel(deps, d.piezaId, d.version),
    ),
  )
}

const cambioDeDiseno = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("variante"), variante: z.enum(VARIANTES) }),
  z.object({ tipo: z.literal("dividir"), lamina: z.number().int().min(0).max(7) }),
  z.object({ tipo: z.literal("unir"), lamina: z.number().int().min(0).max(7) }),
  z.object({
    tipo: z.literal("destacar"),
    lamina: z.number().int().min(0).max(7),
    palabra: z.string().max(80).nullable(),
  }),
])

export async function aprobarCarruselAccion(piezaId: string, version: number, carruselId: string, publicarEn: string) {
  return refrescar(
    await comoConi(
      "aprobarCarrusel",
      sobrePieza.extend({ carruselId: z.uuid(), publicarEn: z.string().max(40) }),
      { piezaId, version, carruselId, publicarEn },
      (deps, d) => aprobarCarrusel(deps, d.piezaId, d.version, d.carruselId, d.publicarEn),
    ),
  )
}

export async function cambiarDisenoAccion(piezaId: string, version: number, cambio: CambioDeDiseno) {
  return refrescar(
    await comoConi(
      "cambiarDisenoDeCarrusel",
      sobrePieza.extend({ cambio: cambioDeDiseno }),
      { piezaId, version, cambio },
      (deps, d) => cambiarDisenoDeCarrusel(deps, d.piezaId, d.version, d.cambio),
    ),
  )
}

export async function pedirCambioDeCarruselAccion(piezaId: string, version: number, pedido: string) {
  return refrescar(
    await comoConi(
      "pedirCambioDeCarrusel",
      // A little over the limit: the action answers with the message for Coni instead of a validation error.
      sobrePieza.extend({ pedido: z.string().max(MAXIMO_DEL_PEDIDO + 200) }),
      { piezaId, version, pedido },
      (deps, d) => pedirCambioDeCarrusel(deps, d.piezaId, d.version, d.pedido),
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

export async function deshacerAprobacionAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("deshacerAprobacion", sobrePieza, { piezaId, version }, (deps, d) =>
      deshacerAprobacion(deps, d.piezaId, d.version),
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

export async function editarTextoLinkedinAccion(piezaId: string, version: number, texto: string) {
  return refrescar(
    await comoConi(
      "editarTextoLinkedin",
      // A little over the limit: the action answers with the message for Coni instead of a validation error.
      sobrePieza.extend({ texto: z.string().max(MAXIMO_TEXTO_LINKEDIN + 200) }),
      { piezaId, version, texto },
      (deps, d) => editarTextoLinkedin(deps, d.piezaId, d.version, d.texto),
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

export async function aprobarVideoAccion(piezaId: string, version: number, publicarEn: string, destinos: string[]) {
  return refrescar(
    await comoConi(
      "aprobarVideo",
      sobrePieza.extend({ publicarEn: z.string().max(40), destinos: z.array(z.string().max(20)).max(DESTINOS.length) }),
      { piezaId, version, publicarEn, destinos },
      (deps, d) => aprobarVideo(deps, d.piezaId, d.version, d.publicarEn, d.destinos),
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

export async function marcarSubidoAManoAccion(piezaId: string, version: number, destino: string, enlace: string) {
  return refrescar(
    await comoConi(
      "marcarSubidoAMano",
      sobrePieza.extend({ destino: z.string().max(20), enlace: z.string().max(500) }),
      { piezaId, version, destino, enlace },
      (deps, d) => marcarSubidoAMano(deps, d.piezaId, d.version, d.destino, d.enlace),
    ),
  )
}

export async function pedirVozAccion(piezaId: string, version: number, nueva: boolean) {
  const resultado = await comoConi(
    "pedirVoz",
    sobrePieza.extend({ nueva: z.boolean() }),
    { piezaId, version, nueva },
    (deps, d) => pedirVoz(deps, d.piezaId, d.version, d.nueva),
  )
  // Refreshed either way: a voice that failed to start still moved the piece (asked, then failed) to a new version.
  revalidatePath("/", "layout")
  return resultado
}
