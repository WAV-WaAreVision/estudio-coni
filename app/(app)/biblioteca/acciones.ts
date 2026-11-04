"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  AutorNuevo,
  CambioDeIdea,
  confirmarCosto,
  confirmarMaterial,
  crearAutor,
  crearMaterial,
  type DepsBiblioteca,
  type DepsSubir,
  descartarMaterial,
  EdicionDeMaterial,
  editarFicha,
  editarMaterial,
  ocultarIdea,
  reintentarMaterial,
  reprocesarMaterial,
  SobreMaterial,
  UnionDeAutores,
  unirAutores,
} from "@/lib/acciones/biblioteca"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi, disparosDeBibliotecaDeLaApp } from "@/lib/acciones/servidor"
import { almacenReal } from "@/lib/proveedores/almacen"

function depsDeBiblioteca(db: DepsBiblioteca["db"]): DepsBiblioteca {
  return {
    db,
    disparar: disparosDeBibliotecaDeLaApp(),
    nuevoId: randomUUID,
    // Resolved on use: an action that signs nothing must not need the R2 variables.
    almacen: { urlDeTexto: (materialId, segundos) => almacenReal().urlDeTexto(materialId, segundos) },
  }
}

function depsDeSubir(db: DepsSubir["db"]): DepsSubir {
  return {
    db,
    disparar: disparosDeBibliotecaDeLaApp(),
    nuevoId: randomUUID,
    ahora: () => new Date(),
    // Resolved on use, like depsDeBiblioteca: a link needs no R2 variable to be created.
    almacen: {
      urlDeSubida: (clave, segundos, tipo) => almacenReal().urlDeSubida(clave, segundos, tipo),
      tamano: (clave) => almacenReal().tamano(clave),
      borrarCarpeta: (materialId) => almacenReal().borrarCarpeta(materialId),
    },
  }
}

/** A change to a material changes the list, the side panel and its detail. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/biblioteca", "layout")
  return resultado
}

export async function reintentarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("reintentarMaterial", SobreMaterial, { materialId }, (db, d) =>
      reintentarMaterial(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function reprocesarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("reprocesarMaterial", SobreMaterial, { materialId }, (db, d) =>
      reprocesarMaterial(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function confirmarCostoAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("confirmarCosto", SobreMaterial, { materialId }, (db, d) =>
      confirmarCosto(depsDeBiblioteca(db), d.materialId),
    ),
  )
}

export async function editarMaterialAccion(edicion: z.input<typeof EdicionDeMaterial>) {
  return refrescar(
    await conSesionDeConi("editarMaterial", EdicionDeMaterial, edicion, (db, d) =>
      editarMaterial(depsDeBiblioteca(db), d),
    ),
  )
}

/** The card is validated inside `editarFicha` with her words (a short card, a bad link), not here. */
export async function editarFichaAccion(edicion: unknown) {
  return refrescar(
    await conSesionDeConi("editarFicha", z.unknown(), edicion, (db, d) => editarFicha(depsDeBiblioteca(db), d)),
  )
}

export async function crearAutorAccion(nuevo: z.input<typeof AutorNuevo>) {
  return refrescar(await conSesionDeConi("crearAutor", AutorNuevo, nuevo, (db, d) => crearAutor({ db }, d)))
}

/** The entry is validated inside `crearMaterial` with her words (leerEntrada), not here. Coni is still on the form. */
export async function crearMaterialAccion(entrada: unknown) {
  return conSesionDeConi("crearMaterial", z.unknown(), entrada, (db, d) => crearMaterial(depsDeSubir(db), d))
}

export async function confirmarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("confirmarMaterial", SobreMaterial, { materialId }, (db, d) =>
      confirmarMaterial(depsDeSubir(db), d.materialId),
    ),
  )
}

export async function descartarMaterialAccion(materialId: string) {
  return refrescar(
    await conSesionDeConi("descartarMaterial", SobreMaterial, { materialId }, (db, d) =>
      descartarMaterial({ db, almacen: { borrarCarpeta: (id) => almacenReal().borrarCarpeta(id) } }, d.materialId),
    ),
  )
}

/** Joining moves materials and ideas: the three sections' counts change. */
export async function unirAutoresAccion(union: z.input<typeof UnionDeAutores>) {
  return refrescar(await conSesionDeConi("unirAutores", UnionDeAutores, union, (db, d) => unirAutores({ db }, d)))
}

/** Hiding changes a topic, its author and the materials' main topics. */
export async function ocultarIdeaAccion(cambio: z.input<typeof CambioDeIdea>) {
  return refrescar(await conSesionDeConi("ocultarIdea", CambioDeIdea, cambio, (db, d) => ocultarIdea({ db }, d)))
}
