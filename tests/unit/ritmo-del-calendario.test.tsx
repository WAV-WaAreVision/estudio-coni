import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"

const TEXTO =
  "Todavía no publicas. Tu ritmo es martes, jueves y sábado a las 19:00. Cuando salga la primera pieza, aquí verás si vas al día."
const BASE = { columnas: ["Mar", "Jue", "Sáb"], semanas: [], resumen: "van 0 de 0", sugerencia: null }

describe("RitmoDelCalendario", () => {
  it("names a filled cell by the pillar's short name", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: null,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                {
                  tipo: "llena",
                  pilar: { slug: "caso-coni", nombre: "Caso Coni: humana + avatar", nombreCorto: "Caso Coni" },
                  titulo: "Uno",
                  dia: "martes 13 oct",
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText("Caso Coni")).toBeInTheDocument()
  })

  it("names each filled cell by its day for a screen reader, since the free cells beside it are silent", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: null,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                { tipo: "libre", falta: false },
                { tipo: "llena", pilar: null, titulo: "Uno", dia: "jueves 15 oct" },
                { tipo: "libre", falta: false },
              ],
            },
          ],
        }}
      />,
    )
    const celda = screen.getByText("Reel", { exact: false })
    expect(celda).toHaveTextContent("jueves 15 oct: Reel")
    expect(celda.querySelector(".sr-only")).toHaveTextContent("jueves 15 oct:")
  })

  it("teaches the schedule with a link to Ajustes before the first publication, never «0 de 0»", () => {
    render(<RitmoDelCalendario ritmo={{ ...BASE, vacio: true, antesDeEmpezar: TEXTO }} />)

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cambiar días y hora" })).toHaveAttribute("href", "/ajustes")
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })

  it("keeps the grid of what is scheduled under the teaching text", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: TEXTO,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                { tipo: "libre", falta: false },
                { tipo: "llena", pilar: null, titulo: "Uno", dia: "martes 13 oct" },
                { tipo: "libre", falta: false },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByText("Reel")).toBeInTheDocument()
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })

  it("summarizes a schedule with nothing in it as N espacios libres, never a wall of «libre» pills", () => {
    const libres = [
      { tipo: "libre" as const, falta: false },
      { tipo: "libre" as const, falta: false },
      { tipo: "libre" as const, falta: false },
    ]
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: null,
          semanas: ["5 oct", "12 oct", "19 oct", "26 oct"].map((etiqueta) => ({ etiqueta, celdas: libres })),
        }}
      />,
    )
    expect(screen.getByText("12 espacios libres")).toBeInTheDocument()
    expect(screen.queryAllByText("libre")).toHaveLength(0)
    expect(screen.queryByText("Mar")).toBeNull()
  })

  it("keeps the filled tiles in the grid, leaves the free cells flat and counts them in one line", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: null,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                { tipo: "libre", falta: false },
                { tipo: "llena", pilar: null, titulo: "Uno", dia: "martes 13 oct" },
                { tipo: "libre", falta: true },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText("Reel")).toBeInTheDocument()
    expect(screen.getByText("2 espacios libres")).toBeInTheDocument()
    expect(screen.queryAllByText("libre")).toHaveLength(0)
    const vacias = document.querySelectorAll("[data-libre]")
    expect(vacias).toHaveLength(2)
    // A free cell is not a button: no relief, no sunken pill, no fill.
    for (const vacia of vacias) expect(vacia.className).not.toMatch(/shadow-|bg-|rounded-/)
  })

  it("says one free slot in the singular", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: null,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                { tipo: "llena", pilar: null, titulo: "Uno", dia: "martes 13 oct" },
                { tipo: "libre", falta: false },
                { tipo: "llena", pilar: null, titulo: "Dos", dia: "jueves 15 oct" },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText("1 espacio libre")).toBeInTheDocument()
  })
})
