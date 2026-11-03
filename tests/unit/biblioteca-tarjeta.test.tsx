import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  confirmarCostoAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { TarjetaDeMaterial } from "@/app/(app)/biblioteca/tarjeta-de-material"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const material: MaterialDeLista = {
  id: "11111111-2222-4333-8444-555555555555",
  titulo: "Burnout y teletrabajo: revisión 2024",
  autor_id: "a",
  autor: "Daniela Ruiz",
  rol: "referente",
  tipo: "documento",
  estado: "listo",
  motivo_fallo: null,
  costo_estimado_usd: null,
  costo_confirmado_en: null,
  creado_en: "2026-10-31T12:00:00Z",
  tema: { nombre: "Carga mental", otros: 1 },
}

function tarjeta(m: MaterialDeLista) {
  render(
    <ul>
      <TarjetaDeMaterial material={m} ahora={AHORA} />
    </ul>,
  )
  return screen.getByRole("listitem")
}

describe("TarjetaDeMaterial", () => {
  it("shows title, type · author · role in simple words, main topic, state and upload day, and opens the detail", () => {
    const li = tarjeta(material)
    expect(within(li).getByRole("link", { name: /Burnout y teletrabajo/ })).toHaveAttribute(
      "href",
      `/biblioteca/materiales/${material.id}`,
    )
    expect(li).toHaveTextContent("Documento · Daniela Ruiz · Referente")
    expect(li).toHaveTextContent("Carga mental +1")
    expect(li).toHaveTextContent("Listo")
    expect(li).toHaveTextContent("Hace 2 días")
    expect(within(li).queryByRole("button")).toBeNull()
  })

  it("keeps Reintentar on a failed card, without its technical reason", () => {
    const li = tarjeta({ ...material, estado: "fallido", motivo_fallo: "sin_texto" })
    expect(within(li).getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
    expect(li).not.toHaveTextContent("sin_texto")
  })

  it("keeps the price button on a card that waits for her OK", () => {
    const li = tarjeta({ ...material, estado: "procesando", costo_estimado_usd: 1.2, titulo: null })
    expect(within(li).getByRole("button", { name: "Procesar por ~US$ 1,20" })).toBeInTheDocument()
    expect(li).toHaveTextContent("Sin título")
    expect(li).toHaveTextContent("Espera tu OK")
  })
})
