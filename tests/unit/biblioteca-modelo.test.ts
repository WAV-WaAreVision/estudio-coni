import { describe, expect, it } from "vitest"
import {
  ETIQUETA_DE_ROL,
  esRol,
  esTipoDeAutorNuevo,
  etiquetaDeRol,
  etiquetaDeTipo,
  ROLES,
  TIPOS_DE_MATERIAL,
} from "@/lib/dominio/biblioteca/modelo"

describe("the material model", () => {
  it("keeps Coni's role labels from Ingesta", () => {
    expect(ROLES.map((rol) => ETIQUETA_DE_ROL[rol])).toEqual([
      "Lo dijo Coni",
      "Referente",
      "Estudio o libro",
      "Estrategia interna",
    ])
  })

  it("says each type in a word, and an unknown type or role as it comes", () => {
    expect(TIPOS_DE_MATERIAL.map(etiquetaDeTipo)).toEqual(["Documento", "Enlace", "Audio", "Video", "Imagen", "Post"])
    expect(etiquetaDeTipo("podcast")).toBe("podcast")
    expect(etiquetaDeRol("evidencia")).toBe("Estudio o libro")
    expect(etiquetaDeRol("otro")).toBe("otro")
  })

  it("tells a role and a kind of new author from any other text", () => {
    expect(esRol("estrategia")).toBe(true)
    expect(esRol("coni")).toBe(false)
    expect(esTipoDeAutorNuevo("institucion")).toBe(true)
    expect(esTipoDeAutorNuevo("coni")).toBe(false)
  })
})
