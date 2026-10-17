import { describe, expect, it } from "vitest"
import { nombreDePilar, pilarVisible, slugsActivos, soloActivos } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

describe("catálogo de pilares", () => {
  it("lists only the active pillars, in their order", () => {
    expect(soloActivos(PILARES_DE_PRUEBA).map((p) => p.slug)).toEqual([
      "ia-salud-mental",
      "practica-clinica",
      "etica-regulacion",
      "acceso-salud-publica",
      "caso-coni",
    ])
  })

  it("gives the visible form of any pillar, active or not", () => {
    expect(pilarVisible(PILARES_DE_PRUEBA, "etica-regulacion")).toEqual({
      slug: "etica-regulacion",
      nombre: "Ética y regulación",
      nombreCorto: "Ética",
    })
    expect(pilarVisible(PILARES_DE_PRUEBA, "pareja")?.nombre).toBe("Pareja y conversación")
  })

  it("has no visible form for no pillar", () => {
    expect(pilarVisible(PILARES_DE_PRUEBA, null)).toBeNull()
    expect(pilarVisible(PILARES_DE_PRUEBA, undefined)).toBeNull()
  })

  it("throws on a slug that is not a pillar, naming it", () => {
    expect(() => pilarVisible(PILARES_DE_PRUEBA, "general")).toThrow("Pilar desconocido: general")
    expect(() => nombreDePilar(PILARES_DE_PRUEBA, "inventado")).toThrow("Pilar desconocido: inventado")
  })

  it("gives the active slugs as a non-empty tuple for schemas", () => {
    const [primero, ...resto] = slugsActivos(PILARES_DE_PRUEBA)
    expect(primero).toBe("ia-salud-mental")
    expect(resto).toHaveLength(4)
  })

  it("refuses a catalog without active pillars", () => {
    expect(() => slugsActivos(PILARES_DE_PRUEBA.filter((p) => !p.activa))).toThrow("No hay pilares activos.")
  })
})
