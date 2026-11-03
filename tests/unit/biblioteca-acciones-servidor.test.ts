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

import {
  confirmarCostoAccion,
  confirmarMaterialAccion,
  crearAutorAccion,
  crearMaterialAccion,
  descartarMaterialAccion,
  editarFichaAccion,
  editarMaterialAccion,
  reintentarMaterialAccion,
  reprocesarMaterialAccion,
} from "@/app/(app)/biblioteca/acciones"
import { AutorNuevo, EdicionDeMaterial, SobreMaterial } from "@/lib/acciones/biblioteca"

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
