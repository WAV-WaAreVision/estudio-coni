"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  aprobarGuion,
  aprobarVideo,
  cambiarFecha,
  descartar,
  editarTexto,
  elegirIdeas,
  pedirCambios,
  regrabar,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import type { Resultado } from "@/lib/acciones/resultado"
import { comoConi } from "@/lib/acciones/servidor"

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

export async function aprobarGuionAccion(piezaId: string, version: number) {
  return refrescar(
    await comoConi("aprobarGuion", sobrePieza, { piezaId, version }, (deps, d) =>
      aprobarGuion(deps, d.piezaId, d.version),
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
      sobrePieza.extend({ texto: z.string().max(20_000) }),
      { piezaId, version, texto },
      (deps, d) => editarTexto(deps, d.piezaId, d.version, d.texto),
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
