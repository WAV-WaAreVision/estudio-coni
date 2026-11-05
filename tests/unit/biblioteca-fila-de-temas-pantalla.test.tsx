import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaDeTemas } from "@/app/(app)/biblioteca/temas/fila-de-temas"
import type { PilarDeRed } from "@/lib/dominio/pilares"

const DIAGNOSTICO = "11111111-2222-4333-8444-555555555555"
const BIENESTAR = "22222222-2222-4333-8444-555555555555"
const PARTIDA = "33333333-2222-4333-8444-555555555555"
const CAPA = "44444444-2222-4333-8444-555555555555"
// The layer first on purpose: the row still puts it last.
const PILARES: PilarDeRed[] = [
  { id: CAPA, slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram", esCapa: true },
  { id: DIAGNOSTICO, slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", red: "linkedin", esCapa: false },
  { id: BIENESTAR, slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin", esCapa: false },
  { id: PARTIDA, slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram", esCapa: false },
]

const textos = (enlaces: HTMLElement[]) => enlaces.map((enlace) => enlace.textContent)

describe("FilaDeTemas", () => {
  it("is one group in Coni's order: «Sin tratar», Instagram and LinkedIn, the chosen network pressed and only its pillars open", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin" }} pilares={PILARES} sinTratar={2} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    expect(textos(within(fila).getAllByRole("link"))).toEqual([
      "Sin tratar · 2",
      "Instagram",
      "LinkedIn",
      "Todos los pilares",
      "Diagnóstico doble",
      "Bienestar e impacto",
    ])
    expect(within(fila).getByRole("link", { name: "LinkedIn" })).toHaveAttribute("aria-current", "true")
    expect(within(fila).getByRole("link", { name: "Instagram" })).not.toHaveAttribute("aria-current")
    const pilares = within(fila).getByRole("list", { name: "Pilares de LinkedIn" })
    expect(within(pilares).getByRole("link", { name: "Todos los pilares" })).toHaveAttribute("aria-current", "page")
    expect(within(fila).queryByRole("list", { name: "Pilares de Instagram" })).toBeNull()
  })

  it("marks the chosen network with a check besides its relief, which forced colors drop; the other keeps only its caret", () => {
    render(<FilaDeTemas filtros={{ red: "instagram" }} pilares={PILARES} sinTratar={0} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    const elegida = within(fila).getByRole("link", { name: "Instagram" })
    const otra = within(fila).getByRole("link", { name: "LinkedIn" })
    expect(elegida.querySelectorAll("svg")).toHaveLength(2)
    expect(elegida.firstChild?.nodeName.toLowerCase()).toBe("svg")
    expect(otra.querySelectorAll("svg")).toHaveLength(1)
    expect(otra.firstChild?.nodeName.toLowerCase()).not.toBe("svg")
  })

  it("links each choice to its address: the switch on, the other network, the same one back to every pillar, a pillar", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin", pilar: BIENESTAR }} pilares={PILARES} sinTratar={0} />)
    const fila = screen.getByRole("group", { name: "Filtrar temas" })
    const sinTratar = within(fila).getByRole("link", { name: "Sin tratar" })
    expect(sinTratar).toHaveAttribute("href", `/biblioteca/temas?red=linkedin&pilar=${BIENESTAR}&sin-tratar=1`)
    expect(sinTratar).not.toHaveAttribute("aria-current")
    expect(within(fila).getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?red=instagram",
    )
    expect(within(fila).getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?red=linkedin",
    )
    expect(within(fila).getByRole("link", { name: "Diagnóstico doble" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=linkedin&pilar=${DIAGNOSTICO}`,
    )
    expect(within(fila).getByRole("link", { name: "Bienestar e impacto" })).toHaveAttribute("aria-current", "page")
    expect(within(fila).getByRole("link", { name: "Todos los pilares" })).not.toHaveAttribute("aria-current")
  })

  it("on Instagram puts the TDAH layer last, and «Sin tratar» on turns off in one tap keeping the pillar", () => {
    render(<FilaDeTemas filtros={{ red: "instagram", pilar: CAPA, sinTratar: true }} pilares={PILARES} sinTratar={3} />)
    const pilares = screen.getByRole("list", { name: "Pilares de Instagram" })
    expect(textos(within(pilares).getAllByRole("link"))).toEqual(["Todos los pilares", "Mi nueva partida", "Capa TDAH"])
    expect(within(pilares).getByRole("link", { name: "Capa TDAH" })).toHaveAttribute("aria-current", "page")
    expect(within(pilares).getByRole("link", { name: "Todos los pilares" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?red=instagram&sin-tratar=1",
    )
    const sinTratar = screen.getByRole("link", { name: "Sin tratar · 3" })
    expect(sinTratar).toHaveAttribute("aria-current", "page")
    expect(sinTratar).toHaveAttribute("href", `/biblioteca/temas?red=instagram&pilar=${CAPA}`)
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?red=linkedin&sin-tratar=1",
    )
  })
})
