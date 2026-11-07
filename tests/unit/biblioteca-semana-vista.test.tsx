import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { CorridaDeLaSemana, LoQueCruzo, QueSubir, VistaDeSemana } from "@/app/(app)/biblioteca/semana/vista-de-semana"
import type { CorridaLeida, CruceDescartado, QueSubirLeido, TeoriaEscrita } from "@/lib/dominio/biblioteca/semana"

const CORRIDA: CorridaLeida = {
  semana: "2026-11-08",
  estado: "lista",
  costoUsd: 0.21,
  ideas: 3,
  manual: false,
  motivoFallo: null,
  creadaEn: "2026-11-08T23:00:00Z",
}
const QUE_SUBIR: QueSubirLeido = {
  unSoloAutor: [
    { nombre: "Descanso digital", id: "55555555-5555-4555-8555-555555555555" },
    { nombre: "Sueño y pantallas", id: null },
  ],
  pilaresSinMaterial: [{ slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" }],
}

const iconosDe = (texto: string) => screen.getByText(texto, { exact: true }).parentElement?.querySelectorAll("svg")

describe("CorridaDeLaSemana", () => {
  it("names the week, its state as icon and word, and a ready run's ideas and cost", () => {
    render(<CorridaDeLaSemana corrida={CORRIDA} />)
    expect(screen.getByRole("heading", { name: "Semana del 2 al 8 de noviembre", level: 2 })).toBeInTheDocument()
    expect(iconosDe("Lista")).toHaveLength(1)
    expect(screen.getByText("3 ideas nuevas · Costó US$ 0,21")).toBeInTheDocument()
    expect(screen.queryByText("A pedido")).toBeNull()
  })

  it("marks a run she asked for", () => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, manual: true }} />)
    expect(iconosDe("A pedido")).toHaveLength(1)
  })

  it.each([
    ["corriendo", "Trabajando"],
    ["fallida", "Falló"],
  ])("draws a %s run as an icon and «%s», with no ideas line", (estado, palabra) => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, estado, ideas: 0, costoUsd: 0 }} />)
    expect(iconosDe(palabra)).toHaveLength(1)
    expect(screen.queryByText(/ideas nuevas/)).toBeNull()
  })
})

describe("QueSubir", () => {
  it("links the single-author topics it can, keeps the others as text, and names pillars with their network", () => {
    render(<QueSubir queSubir={QUE_SUBIR} />)
    const seccion = screen.getByRole("region", { name: "Qué subir después" })
    expect(within(seccion).getByRole("heading", { name: "Qué subir después", level: 2 })).toBeInTheDocument()
    expect(within(seccion).getByRole("link", { name: "Descanso digital" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/55555555-5555-4555-8555-555555555555",
    )
    expect(within(seccion).getByText("Sueño y pantallas")).toBeInTheDocument()
    expect(within(seccion).queryByRole("link", { name: "Sueño y pantallas" })).toBeNull()
    expect(within(seccion).getByText("Psicología en la mesa · LinkedIn")).toBeInTheDocument()
  })

  it("says nothing is missing when both lists are empty, with no empty list", () => {
    render(<QueSubir queSubir={{ unSoloAutor: [], pilaresSinMaterial: [] }} />)
    expect(
      screen.getByText("Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("draws nothing when the run says nothing about it", () => {
    const { container } = render(<QueSubir queSubir={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

const CARGA = { id: "11111111-1111-4111-8111-111111111111", nombre: "Carga mental" }
const PAUSAS = { id: "22222222-2222-4222-8222-222222222222", nombre: "Pausas activas" }
const TEORIA: TeoriaEscrita = {
  id: "33333333-3333-4333-8333-333333333333",
  titulo: "Repartir la carga también es descansar",
  tesis: "Quien reparte la carga mental descansa mejor.",
  puntaje: 0.82,
  nivelEvidencia: "alto",
  temas: [CARGA, PAUSAS],
}
const CRUCE: CruceDescartado = {
  id: "44444444-4444-4444-8444-444444444444",
  razon: "No hay ideas de dos autores distintos.",
  temas: [CARGA],
}

describe("LoQueCruzo", () => {
  const SIN_RESPALDO: TeoriaEscrita = {
    ...TEORIA,
    id: "66666666-6666-4666-8666-666666666666",
    titulo: "Sin respaldo",
    tesis: "Una tesis que el motor no pudo respaldar.",
    puntaje: null,
    nivelEvidencia: null,
    temas: [],
  }
  const OTRO_CRUCE: CruceDescartado = {
    id: "77777777-7777-4777-8777-777777777777",
    razon: "Repite lo que el motor cruzó la semana pasada.",
    temas: [PAUSAS],
  }

  it("lists each theory with its thesis, its backing in her words and its topics as links (4h, decision 9)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA, SIN_RESPALDO]} descartadas={[]} />)
    const region = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    expect(
      within(region)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([TEORIA.titulo, "Sin respaldo"])
    expect(within(region).getByText(TEORIA.tesis)).toBeInTheDocument()
    expect(within(region).getByText("Respaldo: fuerte")).toBeInTheDocument()
    const temas = within(region).getByRole("list", { name: `Temas de «${TEORIA.titulo}»` })
    expect(
      within(temas)
        .getAllByRole("link")
        .map((enlace) => [enlace.textContent, enlace.getAttribute("href")]),
    ).toEqual([
      ["Carga mental", `/biblioteca/temas/${CARGA.id}`],
      ["Pausas activas", `/biblioteca/temas/${PAUSAS.id}`],
    ])
    expect(within(region).queryByRole("list", { name: "Temas de «Sin respaldo»" })).toBeNull()
  })

  it("folds the score and the id under Detalle para WAV", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA]} descartadas={[]} />)
    const detalle = screen.getByText("Detalle para WAV").closest("details")
    expect(detalle?.open).toBe(false)
    expect(detalle).toHaveTextContent(`Puntaje: 0,82Teoría: ${TEORIA.id}`)
  })

  it("folds the crossings that did not work with their count, topics and reasons (4l)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[TEORIA]} descartadas={[CRUCE, OTRO_CRUCE]} />)
    const cruces = screen.getByText("Cruces que no sirvieron (2)").closest("details")
    expect(cruces?.open).toBe(false)
    expect(cruces).toHaveTextContent(CRUCE.razon)
    expect(cruces).toHaveTextContent(OTRO_CRUCE.razon)
    const lista = within(cruces as HTMLElement).getByRole("list", { name: "Cruces que no sirvieron" })
    expect(
      within(lista)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Carga mental", "Pausas activas"])
  })

  it("says a ready run that crossed nothing in one line, with no heading and no empty fold (4l)", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[]} descartadas={[]} />)
    expect(screen.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeInTheDocument()
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.queryByText(/Cruces que no sirvieron/)).toBeNull()
  })

  it("keeps the folded crossings under that line when there are some", () => {
    render(<LoQueCruzo corrida={CORRIDA} teorias={[]} descartadas={[CRUCE]} />)
    expect(screen.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeInTheDocument()
    expect(screen.getByText("Cruces que no sirvieron (1)")).toBeInTheDocument()
  })

  it("says the engine is still working while it runs", () => {
    render(<LoQueCruzo corrida={{ ...CORRIDA, estado: "corriendo" }} teorias={[]} descartadas={[]} />)
    expect(screen.getByText("El motor todavía está trabajando en esta semana.")).toBeInTheDocument()
  })

  it("shows a failed run's reason, without interrupting her on load", () => {
    const motivo = "No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo."
    render(
      <LoQueCruzo corrida={{ ...CORRIDA, estado: "fallida", motivoFallo: motivo }} teorias={[]} descartadas={[]} />,
    )
    expect(screen.getByText(motivo)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText("Esta semana el motor no encontró cruces nuevos.")).toBeNull()
  })

  it("says when the first batch comes before any run", () => {
    render(<LoQueCruzo corrida={null} teorias={[]} descartadas={[]} />)
    expect(
      screen.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."),
    ).toBeInTheDocument()
  })
})

describe("VistaDeSemana (spec decision 10)", () => {
  const SEMANA = { corrida: CORRIDA, teorias: [TEORIA], descartadas: [CRUCE], queSubir: QUE_SUBIR }
  const sigue = (antes: Node, despues: Node) =>
    (antes.compareDocumentPosition(despues) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it("puts the run, Proponer ahora and its cost in a sticky right panel that starts beside the title", () => {
    render(<VistaDeSemana encabezado={<h1>Biblioteca</h1>} semana={SEMANA} costoUsd={0.23} />)
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    expect(panel).toHaveClass("md:sticky", "md:top-24", "md:col-start-2", "md:row-start-1", "md:row-span-2")
    expect(within(panel).getByRole("heading", { name: "Semana del 2 al 8 de noviembre" })).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "Proponer ahora" })).toHaveAccessibleDescription(
      "Cuesta cerca de US$ 0,23",
    )
    const cruzado = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    expect(cruzado.parentElement).toHaveClass("md:col-start-1", "md:row-start-2", "min-w-0")
  })

  it("reads on the phone as title, run, what was crossed, then what to upload; the panel has its own copy for a computer", () => {
    render(<VistaDeSemana encabezado={<h1>Biblioteca</h1>} semana={SEMANA} costoUsd={0.23} />)
    const titulo = screen.getByRole("heading", { name: "Biblioteca", level: 1 })
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    const cruzado = screen.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
    const [enPanel, alFinal] = screen.getAllByRole("region", { name: "Qué subir después" })
    expect(panel).toContainElement(enPanel ?? null)
    expect(enPanel?.parentElement).toHaveClass("hidden", "md:block")
    expect(alFinal?.parentElement).toHaveClass("md:hidden")
    expect(sigue(titulo, panel)).toBe(true)
    expect(sigue(panel, cruzado)).toBe(true)
    expect(alFinal && sigue(cruzado, alFinal)).toBe(true)
  })

  it("before any run keeps only the button in the panel and says when the first batch comes", () => {
    render(
      <VistaDeSemana
        encabezado={<h1>Biblioteca</h1>}
        semana={{ corrida: null, teorias: [], descartadas: [], queSubir: null }}
        costoUsd={0.3}
      />,
    )
    const panel = screen.getByRole("complementary", { name: "Corrida del motor" })
    expect(within(panel).queryByRole("heading")).toBeNull()
    expect(within(panel).getByText("Cuesta cerca de US$ 0,30")).toBeInTheDocument()
    expect(
      screen.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Qué subir después" })).toBeNull()
  })
})
