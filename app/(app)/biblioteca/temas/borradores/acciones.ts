"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import {
  AprobacionDePilar,
  aprobarBorradorDePilar,
  BorradorDePilarNuevo,
  BorradorDeRedNuevo,
  descartarBorrador,
  EdicionDeBorradorDePilar,
  EdicionDeBorradorDeRed,
  editarBorradorDePilar,
  editarBorradorDeRed,
  guardarBorradorDePilar,
  guardarBorradorDeRed,
  SobreBorrador,
} from "@/lib/acciones/borradores"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { conAviso, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"

/** A draft shows in Temas (its count) and in Borradores; an approval changes the pillars of the whole section. */
function refrescar<T extends object>(resultado: Resultado<T>): Resultado<T> {
  if (resultado.ok) revalidatePath("/biblioteca", "layout")
  return resultado
}

/** Success answers with the next screen and its note; a refusal as it came. */
function hacia<T extends object>(
  resultado: Resultado<T>,
  destino: (exito: T) => string,
): Resultado<{ destino: string }> {
  return resultado.ok ? { ok: true, destino: destino(resultado) } : resultado
}

// Each action answers with the next screen, with its note in the address, and the client goes there (`useIrA`). Not
// `redirect()`: Next 16.2.6 sometimes drops a Server Action's redirect and the button stays pending for ever.

export async function guardarBorradorDePilarAccion(nuevo: z.input<typeof BorradorDePilarNuevo>) {
  const resultado = refrescar(
    await conSesionDeConi("guardarBorradorDePilar", BorradorDePilarNuevo, nuevo, (db, d) =>
      guardarBorradorDePilar({ db }, d),
    ),
  )
  // Success means the schema passed: the network is one of the two.
  return hacia(resultado, () =>
    conAviso(hrefDeTemas({ red: BorradorDePilarNuevo.parse(nuevo).red }), "borrador-guardado"),
  )
}

export async function editarBorradorDePilarAccion(edicion: z.input<typeof EdicionDeBorradorDePilar>) {
  const resultado = refrescar(
    await conSesionDeConi("editarBorradorDePilar", EdicionDeBorradorDePilar, edicion, (db, d) =>
      editarBorradorDePilar({ db }, d),
    ),
  )
  return hacia(resultado, () => conAviso(RUTA_DE_BORRADORES, "borrador-editado"))
}

/** Temas without `?red` opens on the network she used last. */
export async function guardarBorradorDeRedAccion(nuevo: z.input<typeof BorradorDeRedNuevo>) {
  const resultado = refrescar(
    await conSesionDeConi("guardarBorradorDeRed", BorradorDeRedNuevo, nuevo, (db, d) =>
      guardarBorradorDeRed({ db }, d),
    ),
  )
  return hacia(resultado, () => conAviso(RUTA_DE_TEMAS, "red-guardada"))
}

export async function editarBorradorDeRedAccion(edicion: z.input<typeof EdicionDeBorradorDeRed>) {
  const resultado = refrescar(
    await conSesionDeConi("editarBorradorDeRed", EdicionDeBorradorDeRed, edicion, (db, d) =>
      editarBorradorDeRed({ db }, d),
    ),
  )
  return hacia(resultado, () => conAviso(RUTA_DE_BORRADORES, "borrador-editado"))
}

export async function descartarBorradorAccion(sobre: z.input<typeof SobreBorrador>) {
  const resultado = refrescar(
    await conSesionDeConi("descartarBorrador", SobreBorrador, sobre, (db, d) => descartarBorrador({ db }, d)),
  )
  return hacia(resultado, () => conAviso(RUTA_DE_BORRADORES, "borrador-descartado"))
}

/** Temas opens on the new pillar's network with it chosen (spec 15c, section 2). */
export async function aprobarBorradorDePilarAccion(aprobacion: z.input<typeof AprobacionDePilar>) {
  const resultado = refrescar(
    await conSesionDeConi("aprobarBorradorDePilar", AprobacionDePilar, aprobacion, (db, d) =>
      aprobarBorradorDePilar({ db }, d),
    ),
  )
  return hacia(resultado, ({ red, pilarId }) => conAviso(hrefDeTemas({ red, pilar: pilarId }), "pilar-aprobado"))
}
