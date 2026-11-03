import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { reprocesarMaterialAccion } = vi.hoisted(() => ({
  reprocesarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reprocesarMaterialAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import {
  BotonReprocesar,
  PREGUNTA_REPROCESAR,
  PREGUNTA_REPROCESAR_ESTRATEGIA,
} from "@/app/(app)/biblioteca/materiales/[id]/boton-reprocesar"
import { MapaDelMaterial } from "@/app/(app)/biblioteca/materiales/[id]/mapa-del-material"

const MAPA = {
  total: 5,
  temas: [{ id: "t1", nombre: "Carga mental", afirmaciones: 3 }],
  sinTema: 2,
  tipos: { dato: 4, mito: 1 },
  evidencia: { estudio: 5 },
}

describe("MapaDelMaterial (4h)", () => {
  it("says the ideas taken in her words: topics and what kind of idea, no evidence on the main text", () => {
    render(<MapaDelMaterial mapa={MAPA} estado="listo" />)
    expect(screen.getByRole("heading", { name: "Ideas sacadas" })).toBeInTheDocument()
    expect(screen.getByText("5 ideas sacadas")).toBeInTheDocument()
    const temas = screen.getByRole("list", { name: "Temas" })
    expect(
      within(temas)
        .getAllByRole("listitem")
        .map((fila) => fila.textContent),
    ).toEqual(["Carga mental3", "Sin tema todavía2"])
    expect(screen.getByRole("list", { name: "Qué tipo de idea es" })).toHaveTextContent("Dato4")
    expect(screen.queryByText(/Evidencia|Tipos de afirmación|afirmaciones/)).toBeNull()
  })

  it("says why there is nothing yet", () => {
    render(<MapaDelMaterial mapa={{ ...MAPA, total: 0, temas: [], sinTema: 0 }} estado="procesando" />)
    expect(screen.getByText("Las ideas aparecen cuando termina de procesarse.")).toBeInTheDocument()
  })
})

describe("BotonReprocesar", () => {
  it("asks first, saying what it costs and what it replaces, and reprocesses on yes", async () => {
    render(<BotonReprocesar materialId="m-1" rol="referente" />)
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }))
    expect(screen.getByText(PREGUNTA_REPROCESAR)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, reprocesar" }))
    await waitFor(() => expect(reprocesarMaterialAccion).toHaveBeenCalledWith("m-1"))
  })

  it("for a strategy material, says the card is replaced, including what she edited", () => {
    render(<BotonReprocesar materialId="m-1" rol="estrategia" />)
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }))
    expect(screen.getByText(PREGUNTA_REPROCESAR_ESTRATEGIA)).toBeInTheDocument()
    expect(PREGUNTA_REPROCESAR_ESTRATEGIA).toMatch(/ficha/)
    expect(PREGUNTA_REPROCESAR_ESTRATEGIA).toMatch(/editaste/)
    expect(screen.queryByText(PREGUNTA_REPROCESAR)).toBeNull()
  })
})
