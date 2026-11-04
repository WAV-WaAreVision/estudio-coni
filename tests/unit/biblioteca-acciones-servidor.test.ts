// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi, revalidatePath, redirect } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
  revalidatePath: vi.fn(),
  // Like Next's, it throws: nothing after it runs.
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT")
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: vi.fn() }))
vi.mock("@/lib/acciones/biblioteca", async (original) => ({
  ...(await original<typeof import("@/lib/acciones/biblioteca")>()),
  descartarMaterial: vi.fn(async () => ({ ok: true })),
  unirAutores: vi.fn(async () => ({ ok: true })),
  ocultarIdea: vi.fn(async () => ({ ok: true })),
}))

import {
  cambiarPilaresAccion,
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
  CambioDePilares,
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
const pilares = { temaId: ID, filas: [{ pilar: "mujeres-lideres", fuerza: "alta" as const }] }

beforeEach(() => vi.clearAllMocks())

describe("the Biblioteca's server actions", () => {
  it.each([
    ["reintentarMaterial", () => reintentarMaterialAccion(ID), SobreMaterial, { materialId: ID }],
    ["reprocesarMaterial", () => reprocesarMaterialAccion(ID), SobreMaterial, { materialId: ID }],
    ["confirmarCosto", () => confirmarCostoAccion(ID), SobreMaterial, { materialId: ID }],
    ["editarMaterial", () => editarMaterialAccion(edicion), EdicionDeMaterial, edicion],
    ["crearAutor", () => crearAutorAccion(autor), AutorNuevo, autor],
    ["cambiarPilaresDeTema", () => cambiarPilaresAccion(pilares), CambioDePilares, pilares],
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
  it("unirAutores checks Coni with its schema, runs its own action, refreshes the three sections and then goes to the author that stayed in the same answer", async () => {
    await expect(unirAutoresAccion({ origen: ID, destino: AUTOR })).rejects.toThrow("NEXT_REDIRECT")
    const [recibido, conEsquema, conEntrada, alAccionar] = conSesionDeConi.mock.calls[0] ?? []
    expect([recibido, conEsquema, conEntrada]).toEqual(["unirAutores", UnionDeAutores, { origen: ID, destino: AUTOR }])
    const db = {}
    await (alAccionar as (db: unknown, d: unknown) => Promise<unknown>)(db, { origen: ID, destino: AUTOR })
    expect(unirAutores).toHaveBeenCalledWith({ db }, { origen: ID, destino: AUTOR })
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
    // A client navigation after the answer could lose the race with the revalidated tree and draw the deleted author.
    expect(redirect).toHaveBeenCalledWith(`/biblioteca/autores/${AUTOR}`, "replace")
    expect(revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0] ?? 0)
  })

  it("ocultarIdea checks Coni with its schema, runs its own action, refreshes the three sections and then goes to the checked address in the same answer", async () => {
    const despues = `/biblioteca/temas/${AUTOR}?oculta=${ID}`
    await expect(ocultarIdeaAccion({ id: ID, oculta: true }, despues)).rejects.toThrow("NEXT_REDIRECT")
    const [recibido, conEsquema, conEntrada, alAccionar] = conSesionDeConi.mock.calls[0] ?? []
    expect([recibido, conEsquema, conEntrada]).toEqual(["ocultarIdea", CambioDeIdea, { id: ID, oculta: true }])
    const db = {}
    await (alAccionar as (db: unknown, d: unknown) => Promise<unknown>)(db, { id: ID, oculta: true })
    expect(ocultarIdea).toHaveBeenCalledWith({ db }, { id: ID, oculta: true })
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
    expect(redirect).toHaveBeenCalledWith(despues, "replace")
    expect(revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0] ?? 0)
  })

  it("ocultarIdea never goes outside the Biblioteca: an address from elsewhere lands on the Temas list", async () => {
    await expect(ocultarIdeaAccion({ id: ID, oculta: false }, "https://evil.example")).rejects.toThrow("NEXT_REDIRECT")
    expect(redirect).toHaveBeenCalledWith("/biblioteca/temas", "replace")
  })

  it("ocultarIdea refused answers with the error, refreshes nothing and goes nowhere", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esa idea ya no existe." })
    expect(await ocultarIdeaAccion({ id: ID, oculta: true }, `/biblioteca/temas?oculta=${ID}`)).toEqual({
      ok: false,
      error: "Esa idea ya no existe.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("refreshes nothing and goes nowhere when joining is refused", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await unirAutoresAccion({ origen: ID, destino: AUTOR })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("the schemas refuse what is not an id or a yes/no", () => {
    expect(UnionDeAutores.safeParse({ origen: "1", destino: AUTOR }).success).toBe(false)
    expect(CambioDeIdea.safeParse({ id: ID, oculta: "si" }).success).toBe(false)
  })
})
