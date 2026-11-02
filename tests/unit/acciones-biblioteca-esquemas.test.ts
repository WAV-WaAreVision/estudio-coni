import { describe, expect, it } from "vitest"
import { AutorNuevo, EdicionDeMaterial, SobreMaterial } from "@/lib/acciones/biblioteca"

const ID = "11111111-2222-4333-8444-555555555555"

describe("the Biblioteca's action inputs", () => {
  it("take a material id and nothing that is not one", () => {
    expect(SobreMaterial.safeParse({ materialId: ID }).success).toBe(true)
    expect(SobreMaterial.safeParse({ materialId: "../x" }).success).toBe(false)
  })

  it("take an author and one of the four roles", () => {
    expect(EdicionDeMaterial.safeParse({ materialId: ID, autorId: ID, rol: "evidencia" }).success).toBe(true)
    expect(EdicionDeMaterial.safeParse({ materialId: ID, autorId: ID, rol: "coni" }).success).toBe(false)
  })

  it("take a new author of a kind she can pick, with short texts", () => {
    expect(AutorNuevo.safeParse({ nombre: "Ana", credencial: "", tipo: "persona" }).success).toBe(true)
    expect(AutorNuevo.safeParse({ nombre: "Ana", credencial: "", tipo: "coni" }).success).toBe(false)
    expect(AutorNuevo.safeParse({ nombre: "x".repeat(201), credencial: "", tipo: "persona" }).success).toBe(false)
  })
})
