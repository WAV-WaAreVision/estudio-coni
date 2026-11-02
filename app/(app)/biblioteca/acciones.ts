"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  AutorNuevo,
  confirmarCosto,
  crearAutor,
  type DepsBiblioteca,
  EdicionDeMaterial,
  editarFicha,
  editarMaterial,
  reintentarMaterial,
  reprocesarMaterial,
  SobreMaterial,
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
