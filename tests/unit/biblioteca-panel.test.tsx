import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  confirmarCostoAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { PanelDeMaterial, PistaDelPanel } from "@/app/(app)/biblioteca/panel-de-material"
import type { PanelDelMaterial } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const ID = "11111111-2222-4333-8444-555555555555"
const panel: PanelDelMaterial = {
  material: {
    id: ID,
    titulo: "Burnout y teletrabajo: revisión 2024",
    autor_id: "a-1",
    autor: "Daniela Ruiz",
    credencial: "investigadora de confianza",
    rol: "referente",
    tipo: "documento",
    estado: "listo",
    motivo_fallo: null,
    costo_estimado_usd: null,
    costo_confirmado_en: null,
    creado_en: "2026-10-31T12:00:00Z",
    idioma_original: "es",
    origen_url: null,
  },
  ideas: { total: 12, primeras: ["El aislamiento pesa más que las horas extra.", "Las pausas acordadas protegen."] },
  evidencia: { estudio: 9, opinion: 3 },
}

describe("PanelDeMaterial", () => {
  it("is a region named by its title, with type, upload day and state on top", () => {
    render(<PanelDeMaterial panel={panel} filtros={{ estado: "listo" }} ahora={AHORA} />)
    const region = screen.getByRole("region", { name: "Burnout y teletrabajo: revisión 2024" })
    expect(region).toHaveTextContent("Documento · subido hace 2 días")
    expect(within(region).getByText("Listo")).toBeInTheDocument()
  })

  it("shows the ideas taken with their count and the first two, and «Ver las 12» opens the detail", () => {
    render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("heading", { name: "Ideas sacadas", level: 3 })).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("«El aislamiento pesa más que las horas extra.»")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver las 12" })).toHaveAttribute("href", `/biblioteca/materiales/${ID}`)
  })

  it("says who she is for you with the credential, and folds the technical detail for WAV", () => {
    const { container } = render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("heading", { name: "¿Quién es para ti?", level: 3 })).toBeInTheDocument()
    const quien = screen.getByRole("heading", { name: "¿Quién es para ti?", level: 3 }).closest("section")
    expect(quien).toHaveTextContent("Daniela Ruiz · investigadora de confianza")
    expect(screen.getByText("Referente")).toBeInTheDocument()
    const detalle = container.querySelector("details")
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toHaveTextContent("Detalle para WAV")
    expect(detalle).toHaveTextContent("Evidencia: Estudio 9 · Opinión 3")
    expect(detalle).toHaveTextContent(`Material: ${ID}`)
  })

  it("links the author to its page; the reader already gives its id (deviation 6)", () => {
    render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Daniela Ruiz" })).toHaveAttribute("href", "/biblioteca/autores/a-1")
  })

  it("has its own close control that keeps the filters", () => {
    render(<PanelDeMaterial panel={panel} filtros={{ estado: "listo" }} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("href", "/biblioteca?estado=listo")
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("data-cierra-panel", ID)
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
  })

  it("carries Reintentar for a failed material, and says when there are no ideas yet", () => {
    render(
      <PanelDeMaterial
        panel={{ ...panel, material: { ...panel.material, estado: "fallido" }, ideas: { total: 0, primeras: [] } }}
        filtros={{}}
        ahora={AHORA}
      />,
    )
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
    expect(screen.getByText("Las ideas aparecen cuando termina de procesarse.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /^Ver / })).toBeNull()
  })
})

describe("PanelDeMaterial with a single idea", () => {
  it("says «Ver la idea» instead of «Ver las 1»", () => {
    render(<PanelDeMaterial panel={{ ...panel, ideas: { total: 1, primeras: ["Una."] } }} filtros={{}} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Ver la idea" })).toBeInTheDocument()
  })
})

describe("PanelDeMaterial spacing", () => {
  it("lets the panel's gap space its sections, with no extra top margin on them", () => {
    render(<PanelDeMaterial panel={panel} filtros={{}} ahora={AHORA} />)
    for (const nombre of ["Ideas sacadas", "¿Quién es para ti?"]) {
      expect(screen.getByRole("region", { name: nombre }).className).not.toMatch(/\bmt-/)
    }
  })
})

describe("PistaDelPanel", () => {
  it("says what the panel is for while nothing is selected", () => {
    render(<PistaDelPanel />)
    expect(
      screen.getByText("Elige un material de la tabla para ver aquí sus ideas y quién es para ti."),
    ).toBeInTheDocument()
  })
})
