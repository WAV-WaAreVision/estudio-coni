import { describe, expect, it } from "vitest"
import {
  calcularPesosDeRed,
  eleccionDe,
  filasDeEleccion,
  lineaDePilares,
  nombreDePilar,
  pilaresDeRedes,
  pilaresDeTema,
  pilaresParaElegir,
  pilarVisible,
  porRed,
  sinPilares,
  slugsActivos,
  soloActivos,
} from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const ID = Object.fromEntries(PILARES_DE_PRUEBA.map((p) => [p.slug, p.id]))
const id = (slug: string) => ID[slug] ?? ""

describe("catálogo de pilares", () => {
  it("lists the active pillars by network, LinkedIn then Instagram, the ones without a network last", () => {
    expect(soloActivos(PILARES_DE_PRUEBA).map((p) => p.slug)).toEqual([
      "diagnostico-doble",
      "bienestar-e-impacto",
      "psicologia-en-la-mesa",
      "mujeres-lideres",
      "game-over-impostora",
      "mi-nueva-partida",
      "inteligencia-emocional",
      "capa-tdah",
      "ia-salud-mental",
      "practica-clinica",
      "etica-regulacion",
      "acceso-salud-publica",
      "caso-coni",
    ])
  })

  it("never offers a layer where a pillar is chosen", () => {
    expect(pilaresParaElegir(PILARES_DE_PRUEBA).map((p) => p.slug)).not.toContain("capa-tdah")
    expect(pilaresParaElegir(PILARES_DE_PRUEBA)).toHaveLength(12)
  })

  it("gives the pillars and layers of a network, with their id, for the topic screens", () => {
    expect(pilaresDeRedes(PILARES_DE_PRUEBA).map((p) => [p.slug, p.red, p.esCapa])).toEqual([
      ["diagnostico-doble", "linkedin", false],
      ["bienestar-e-impacto", "linkedin", false],
      ["psicologia-en-la-mesa", "linkedin", false],
      ["mujeres-lideres", "linkedin", false],
      ["game-over-impostora", "instagram", false],
      ["mi-nueva-partida", "instagram", false],
      ["inteligencia-emocional", "instagram", false],
      ["capa-tdah", "instagram", true],
    ])
    expect(pilaresDeRedes(PILARES_DE_PRUEBA)[0]).toEqual({
      id: id("diagnostico-doble"),
      slug: "diagnostico-doble",
      nombreCorto: "Diagnóstico doble",
      red: "linkedin",
      esCapa: false,
    })
  })

  it("groups by network with its label, the ones without a network as Pilares anteriores", () => {
    const grupos = porRed(pilaresParaElegir(PILARES_DE_PRUEBA))
    expect(grupos.map((g) => [g.red, g.etiqueta, g.pilares.length])).toEqual([
      ["linkedin", "LinkedIn", 4],
      ["instagram", "Instagram", 3],
      [null, "Pilares anteriores", 5],
    ])
    expect(porRed(pilaresDeRedes(PILARES_DE_PRUEBA)).map((g) => g.etiqueta)).toEqual(["LinkedIn", "Instagram"])
  })

  it("gives the visible form of any pillar, active or not", () => {
    expect(pilarVisible(PILARES_DE_PRUEBA, "mi-nueva-partida")).toEqual({
      slug: "mi-nueva-partida",
      nombre: "Mi nueva partida",
      nombreCorto: "Mi nueva partida",
    })
    expect(pilarVisible(PILARES_DE_PRUEBA, "pareja")?.nombre).toBe("Pareja y conversación")
    expect(pilarVisible(PILARES_DE_PRUEBA, null)).toBeNull()
  })

  it("throws on a slug that is not a pillar, naming it", () => {
    expect(() => pilarVisible(PILARES_DE_PRUEBA, "general")).toThrow("Pilar desconocido: general")
    expect(() => nombreDePilar(PILARES_DE_PRUEBA, "inventado")).toThrow("Pilar desconocido: inventado")
  })

  it("gives the slugs an idea can take as a non-empty tuple for schemas, without layers", () => {
    const [primero, ...resto] = slugsActivos(PILARES_DE_PRUEBA)
    expect(primero).toBe("diagnostico-doble")
    expect(resto).toHaveLength(11)
    expect(resto).not.toContain("capa-tdah")
    expect(() => slugsActivos(PILARES_DE_PRUEBA.filter((p) => !p.activa))).toThrow("No hay pilares activos.")
  })
})

describe("pesos por red", () => {
  const PESOS = [
    { pilarId: id("diagnostico-doble"), desde: "2026-11-04", peso: 30 },
    { pilarId: id("diagnostico-doble"), desde: "2027-01-01", peso: 25 },
    { pilarId: id("bienestar-e-impacto"), desde: "2026-11-04", peso: 25 },
    { pilarId: id("psicologia-en-la-mesa"), desde: "2026-11-04", peso: 30 },
    { pilarId: id("psicologia-en-la-mesa"), desde: "2027-01-01", peso: 35 },
    { pilarId: id("mujeres-lideres"), desde: "2026-11-04", peso: 15 },
    { pilarId: id("mi-nueva-partida"), desde: "2026-11-04", peso: 40 },
  ]

  it("takes each pillar's row with the latest start on or before the date", () => {
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "linkedin", "2026-12-31")).toEqual({
      pesos: [
        { slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", peso: 30 },
        { slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", peso: 25 },
        { slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", peso: 30 },
        { slug: "mujeres-lideres", nombreCorto: "Mujeres líderes", peso: 15 },
      ],
      total: 100,
      sumaCien: true,
    })
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "linkedin", "2027-01-01").pesos.map((p) => p.peso)).toEqual([
      25, 25, 35, 15,
    ])
  })

  it("flags a network whose weights do not add up to 100, and leaves out a pillar with no row yet", () => {
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "instagram", "2026-11-04")).toEqual({
      pesos: [{ slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", peso: 40 }],
      total: 40,
      sumaCien: false,
    })
    expect(calcularPesosDeRed(PILARES_DE_PRUEBA, PESOS, "linkedin", "2026-11-03").pesos).toEqual([])
  })
})

describe("pilares de un tema", () => {
  it("gives per network the main pillar, the secondaries (media before baja) and the layer", () => {
    const pilares = pilaresDeTema(PILARES_DE_PRUEBA, [
      { pilarId: id("mujeres-lideres"), fuerza: "baja" },
      { pilarId: id("bienestar-e-impacto"), fuerza: "alta" },
      { pilarId: id("diagnostico-doble"), fuerza: "media" },
      { pilarId: id("capa-tdah"), fuerza: null },
    ])
    expect(pilares.linkedin.principal?.slug).toBe("bienestar-e-impacto")
    expect(pilares.linkedin.secundarios.map((p) => p.slug)).toEqual(["diagnostico-doble", "mujeres-lideres"])
    expect(pilares.instagram).toEqual({
      principal: null,
      secundarios: [],
      capa: { slug: "capa-tdah", nombre: "Capa TDAH", nombreCorto: "Capa TDAH" },
    })
  })

  it("has nothing for a topic without rows, and throws on a pillar it does not know", () => {
    expect(pilaresDeTema(PILARES_DE_PRUEBA, [])).toEqual(sinPilares())
    expect(() => pilaresDeTema(PILARES_DE_PRUEBA, [{ pilarId: id("caso-coni"), fuerza: "alta" }])).toThrow(
      `Pilar de tema desconocido: ${id("caso-coni")}`,
    )
  })

  it("says one line per network, with «También toca» and the layer, never «principal»", () => {
    const pilares = pilaresDeTema(PILARES_DE_PRUEBA, [
      { pilarId: id("bienestar-e-impacto"), fuerza: "alta" },
      { pilarId: id("diagnostico-doble"), fuerza: "media" },
      { pilarId: id("mi-nueva-partida"), fuerza: "alta" },
      { pilarId: id("capa-tdah"), fuerza: null },
    ])
    expect(lineaDePilares("linkedin", pilares.linkedin)).toBe(
      "LinkedIn: Bienestar e impacto · También toca: Diagnóstico doble",
    )
    expect(lineaDePilares("instagram", pilares.instagram)).toBe("Instagram: Mi nueva partida · Capa TDAH")
    expect(lineaDePilares("instagram", sinPilares().instagram)).toBe("Sin pilar en Instagram")
  })

  it("turns the form's choice into the RPC's rows: main alta, its network's secondaries media, layers bare", () => {
    const eleccion = eleccionDe(
      pilaresDeTema(PILARES_DE_PRUEBA, [
        { pilarId: id("bienestar-e-impacto"), fuerza: "alta" },
        { pilarId: id("diagnostico-doble"), fuerza: "baja" },
        { pilarId: id("capa-tdah"), fuerza: null },
      ]),
    )
    expect(eleccion).toEqual({
      principal: { linkedin: "bienestar-e-impacto", instagram: "" },
      secundarios: { linkedin: ["diagnostico-doble"], instagram: [] },
      capas: ["capa-tdah"],
    })
    expect(
      filasDeEleccion({
        ...eleccion,
        principal: { linkedin: "diagnostico-doble", instagram: "" },
        secundarios: { linkedin: ["diagnostico-doble", "mujeres-lideres"], instagram: ["mi-nueva-partida"] },
      }),
    ).toEqual([
      { pilar: "diagnostico-doble", fuerza: "alta" },
      { pilar: "mujeres-lideres", fuerza: "media" },
      { pilar: "capa-tdah", fuerza: null },
    ])
  })
})
