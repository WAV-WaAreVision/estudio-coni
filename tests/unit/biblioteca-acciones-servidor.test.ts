// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi, revalidatePath } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
  revalidatePath: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: vi.fn() }))
vi.mock("@/lib/acciones/biblioteca", async (original) => ({
  ...(await original<typeof import("@/lib/acciones/biblioteca")>()),
  descartarMaterial: vi.fn(async () => ({ ok: true })),
  unirAutores: vi.fn(async () => ({ ok: true })),
  ocultarIdea: vi.fn(async () => ({ ok: true })),
}))

import {
  confirmarCostoAccion,
  confirmarMaterialAccion,
  crearAutorAccion,
  crearMaterialAccion,
  descartarMaterialAccion,
  editarFichaAccion,
  editarMaterialAccion,
  ocultarIdeaAccion,
  reintentarMaterialAccion,
  reprocesarMaterialAccion,
  unirAutoresAccion,
} from "@/app/(app)/biblioteca/acciones"
import {
  AutorNuevo,
  CambioDeIdea,
  descartarMaterial,
  EdicionDeMaterial,
  ocultarIdea,
  SobreMaterial,
  UnionDeAutores,
  unirAutores,
} from "@/lib/acciones/biblioteca"

const ID = "11111111-2222-4333-8444-555555555555"
const AUTOR = "22222222-3333-4444-8555-666666666666"
const edicion = { materialId: ID, autorId: AUTOR, rol: "referente" as const }
const autor = { nombre: "Daniela", credencial: "", tipo: "persona" as const }
const ficha = { materialId: ID, resumen: "Un resumen" }

beforeEach(() => vi.clearAllMocks())

describe("the Biblioteca's server actions", () => {
  it.each([
    ["reintentarMaterial", () => reintentarMaterialAccion(ID), SobreMaterial, { materialId: ID }],
    ["reprocesarMaterial", () => reprocesarMaterialAccion(ID), SobreMaterial, { materialId: ID }],
    ["confirmarCosto", () => confirmarCostoAccion(ID), SobreMaterial, { materialId: ID }],
    ["editarMaterial", () => editarMaterialAccion(edicion), EdicionDeMaterial, edicion],
    ["crearAutor", () => crearAutorAccion(autor), AutorNuevo, autor],
  ] as const)(
    "%s checks Coni with its schema and refreshes the whole section",
    async (nombre, accion, esquema, entrada) => {
      expect(await accion()).toEqual({ ok: true })
      expect(conSesionDeConi).toHaveBeenCalledWith(nombre, esquema, entrada, expect.any(Function))
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
    },
  )

  it("editarFicha lets the card through to editarFicha, which answers in her words, and refreshes the section", async () => {
    expect(await editarFichaAccion(ficha)).toEqual({ ok: true })
    const [nombre, esquema, entrada] = conSesionDeConi.mock.calls[0] ?? []
    expect(nombre).toBe("editarFicha")
    expect(entrada).toEqual(ficha)
    expect((esquema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(42).success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("refreshes nothing when the action is refused", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await reintentarMaterialAccion(ID)).toEqual({ ok: false, error: "Esta app es solo para Coni." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["confirmarMaterial", () => confirmarMaterialAccion(ID)],
    ["descartarMaterial", () => descartarMaterialAccion(ID)],
  ] as const)("%s checks Coni with the material's id and refreshes the whole section", async (nombre, accion) => {
    expect(await accion()).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenCalledWith(nombre, SobreMaterial, { materialId: ID }, expect.any(Function))
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("descartarMaterial gets a store that can delete the material's folder", async () => {
    await descartarMaterialAccion(ID)
    const alAccionar = conSesionDeConi.mock.calls[0]?.[3] as (
      db: unknown,
      d: { materialId: string },
    ) => Promise<unknown>
    const db = {}
    await alAccionar(db, { materialId: ID })
    expect(descartarMaterial).toHaveBeenCalledWith({ db, almacen: { borrarCarpeta: expect.any(Function) } }, ID)
  })

  it("crearMaterial lets the entry through to leerEntrada, which answers in her words, and refreshes nothing", async () => {
    const entrada = { tipo: "link", url: "https://ejemplo.cl/nota" }
    expect(await crearMaterialAccion(entrada)).toEqual({ ok: true })
    const [nombre, esquema, recibida] = conSesionDeConi.mock.calls[0] ?? []
    expect(nombre).toBe("crearMaterial")
    expect(recibida).toEqual(entrada)
    expect((esquema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(42).success).toBe(true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("the server actions of Autores and Temas", () => {
  it.each([
    [
      "unirAutores",
      () => unirAutoresAccion({ origen: ID, destino: AUTOR }),
      UnionDeAutores,
      { origen: ID, destino: AUTOR },
      unirAutores,
    ],
    [
      "ocultarIdea",
      () => ocultarIdeaAccion({ id: ID, oculta: true }),
      CambioDeIdea,
      { id: ID, oculta: true },
      ocultarIdea,
    ],
  ] as const)(
    "%s checks Coni with its schema, runs its own action and refreshes the three sections, so their counts agree",
    async (nombre, accion, esquema, entrada, propia) => {
      expect(await accion()).toEqual({ ok: true })
      const [recibido, conEsquema, conEntrada, alAccionar] = conSesionDeConi.mock.calls[0] ?? []
      expect([recibido, conEsquema, conEntrada]).toEqual([nombre, esquema, entrada])
      const db = {}
      await (alAccionar as (db: unknown, d: unknown) => Promise<unknown>)(db, entrada)
      expect(propia).toHaveBeenCalledWith({ db }, entrada)
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
    },
  )

  it("refreshes nothing when joining is refused", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await unirAutoresAccion({ origen: ID, destino: AUTOR })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("the schemas refuse what is not an id or a yes/no", () => {
    expect(UnionDeAutores.safeParse({ origen: "1", destino: AUTOR }).success).toBe(false)
    expect(CambioDeIdea.safeParse({ id: ID, oculta: "si" }).success).toBe(false)
  })
})
