"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { guardarAjuste, guardarLlave } from "@/lib/acciones/ajustes"
import {
  enviarPrueba,
  guardarSuscripcion,
  marcarAvatarVisto,
  marcarAvisoLeido,
  quitarSuscripcion,
} from "@/lib/acciones/avisos"
import { marcarInventarioRevisado, publicarTransparencia, volverATransparencia } from "@/lib/acciones/datos-personales"
import { desconectarLinkedin } from "@/lib/acciones/linkedin"
import { reactivarLimite } from "@/lib/acciones/presupuesto"
import { aResultado, type Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { servicioPushReal } from "@/lib/proveedores/push"

const deps = (db: Parameters<typeof guardarAjuste>[0]["db"]) => ({ db, ahora: () => new Date().toISOString() })

/** What the settings change is read by Inicio (the next dates) and the screens that propose one. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

// Validated by `guardarAjuste` itself; here it only has to be an object.
const cualquierCambio = z.object({ campo: z.string().max(40), valor: z.unknown() })

export async function guardarAjusteAccion(cambio: z.input<typeof cualquierCambio>) {
  return refrescar(
    await conSesionDeConi("guardarAjuste", cualquierCambio, cambio, (db, d) => guardarAjuste(deps(db), d)),
  )
}

const llave = z.object({ cuenta: z.string().max(40), llave: z.string().max(2000) })

export async function guardarLlaveAccion(cuenta: string, valor: string) {
  return refrescar(
    await conSesionDeConi("guardarLlave", llave, { cuenta, llave: valor }, (db, d) => guardarLlave(deps(db), d)),
  )
}

const suscripcion = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(300).optional(),
})

const depsDeAvisos = (db: Parameters<typeof guardarSuscripcion>[0]["db"]) => ({ db, push: () => servicioPushReal() })

export async function guardarSuscripcionAccion(entrada: z.input<typeof suscripcion>) {
  return refrescar(
    await conSesionDeConi("guardarSuscripcion", suscripcion, entrada, (db, d) =>
      guardarSuscripcion(depsDeAvisos(db), d),
    ),
  )
}

export async function quitarSuscripcionAccion(endpoint: string) {
  return refrescar(
    await conSesionDeConi("quitarSuscripcion", z.object({ endpoint: z.string().max(2048) }), { endpoint }, (db, d) =>
      quitarSuscripcion(depsDeAvisos(db), d.endpoint),
    ),
  )
}

export async function marcarAvatarVistoAccion() {
  return conSesionDeConi("marcarAvatarVisto", z.object({}), {}, (db) => marcarAvatarVisto(db))
}

export async function enviarPruebaAccion() {
  return conSesionDeConi("enviarPrueba", z.object({}), {}, (db) => enviarPrueba(depsDeAvisos(db)))
}

export async function marcarAvisoLeidoAccion(id: string) {
  return refrescar(
    await conSesionDeConi("marcarAvisoLeido", z.object({ id: z.uuid() }), { id }, (db, d) =>
      marcarAvisoLeido(db, d.id),
    ),
  )
}

export async function desconectarLinkedinAccion() {
  return refrescar(
    await conSesionDeConi("desconectarLinkedin", z.object({}), {}, (db) =>
      aResultado("desconectarLinkedin", () => desconectarLinkedin(db)),
    ),
  )
}

export async function marcarInventarioRevisadoAccion() {
  return refrescar(
    await conSesionDeConi("marcarInventarioRevisado", z.object({}), {}, (db) => marcarInventarioRevisado(db)),
  )
}

// The limits are the database's, counted after trimming, so it answers with the plain message. This only refuses a
// request far too big to be a page.
const paginaDeIa = z.object({ texto: z.string().max(60_000), motivo: z.string().max(4_000) })

export async function publicarTransparenciaAccion(texto: string, motivo: string) {
  return refrescar(
    await conSesionDeConi("publicarTransparencia", paginaDeIa, { texto, motivo }, (db, d) =>
      publicarTransparencia(db, d),
    ),
  )
}

export async function volverATransparenciaAccion(version: number) {
  return refrescar(
    await conSesionDeConi(
      "volverATransparencia",
      z.object({ version: z.number().int().min(0) }),
      { version },
      (db, d) => volverATransparencia(db, d.version),
    ),
  )
}

export async function reactivarLimiteAccion(limite: number) {
  return refrescar(
    await conSesionDeConi("reactivarLimite", z.object({ limite: z.number() }), { limite }, (db, d) =>
      reactivarLimite(db, d),
    ),
  )
}
