import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { type AccionesDeEleccion, EleccionDeIdeas } from "@/app/(app)/ideas/eleccion-de-ideas"
import { nombreDePilar } from "@/lib/dominio/pilares"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

function idea(id: string, gancho: string): IdeaDeBanco {
  return {
    id,
    numero: null,
    pilar: "practica-clinica",
    nombrePilar: nombreDePilar(PILARES_DE_PRUEBA, "practica-clinica"),
    gancho,
    tema: "",
    formato: "",
    fuerza: "alta",
    alertas: [],
    estado: "idea",
    fijada: false,
    nueva: false,
    porQue: null,
  }
}

const IDEAS = ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis"].map((g, i) => idea(`i${i}`, g))

function mostrar(cambios: Partial<AccionesDeEleccion> = {}) {
  const acciones: AccionesDeEleccion = {
    elegirVarias: vi.fn(async (ids: string[]) => ({ ok: true as const, tipo: "empezadas" as const, piezas: ids })),
    descartarVarias: vi.fn(async () => ({ ok: true as const })),
    restaurar: vi.fn(async (ids: string[]) => ({ ok: true as const, restauradas: ids })),
    ...cambios,
  }
  const alSacar = vi.fn()
  const alDevolver = vi.fn()
  render(<EleccionDeIdeas ideas={IDEAS} acciones={acciones} alSacar={alSacar} alDevolver={alDevolver} />)
  return { acciones, alSacar, alDevolver }
}

const marcar = (gancho: string) => fireEvent.click(screen.getByRole("checkbox", { name: gancho }))

describe("EleccionDeIdeas", () => {
  it("shows the bar only once something is ticked, counting what she ticked", () => {
    mostrar()
    expect(screen.queryByRole("region", { name: "Ideas elegidas" })).toBeNull()
    marcar("Uno")
    marcar("Dos")
    const barra = screen.getByRole("region", { name: "Ideas elegidas" })
    expect(within(barra).getByText("2 elegidas")).toBeInTheDocument()
    expect(within(barra).getByRole("button", { name: "Hacer los guiones (2)" })).toBeInTheDocument()
    expect(within(barra).getByRole("button", { name: "Descartar (2)" })).toBeInTheDocument()
  })

  it("stops at five: the rest read as disabled and say why", () => {
    mostrar()
    for (const g of ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]) marcar(g)
    expect(screen.getByRole("checkbox", { name: "Seis" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Llegaste al máximo de 5.")).toBeInTheDocument()
    marcar("Seis")
    expect(screen.getByRole("checkbox", { name: "Seis" })).not.toBeChecked()
  })

  it("starts the scripts in the order she ticked them and takes them out of the list", async () => {
    const { acciones, alSacar } = mostrar()
    marcar("Dos")
    marcar("Uno")
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (2)" }))
    await waitFor(() => expect(acciones.elegirVarias).toHaveBeenCalledWith(["i1", "i0"]))
    expect(alSacar).toHaveBeenCalledWith(["i1", "i0"])
    expect(await screen.findByText("Escribiendo 2 guiones. Te aviso cuando estén.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Ideas elegidas" })).toBeNull()
  })

  it("asks before doing fewer when the month covers fewer, and does the first ones only on her tap", async () => {
    const elegirVarias = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, tipo: "alcanza", cuantas: 1 })
      .mockResolvedValueOnce({ ok: true, tipo: "empezadas", piezas: ["p"] })
    const { alSacar } = mostrar({ elegirVarias })
    marcar("Uno")
    marcar("Dos")
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (2)" }))

    expect(await screen.findByText("Alcanza para 1 este mes. ¿Hago ese?")).toBeInTheDocument()
    expect(alSacar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, hacer 1 guion" }))

    await waitFor(() => expect(elegirVarias).toHaveBeenLastCalledWith(["i0"]))
    expect(alSacar).toHaveBeenCalledWith(["i0"])
  })

  it("goes back to the choice from the cap question without starting anything", async () => {
    const elegirVarias = vi.fn(async () => ({ ok: true as const, tipo: "alcanza" as const, cuantas: 1 }))
    mostrar({ elegirVarias })
    marcar("Uno")
    marcar("Dos")
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (2)" }))
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }))
    expect(screen.getByRole("button", { name: "Hacer los guiones (2)" })).toBeInTheDocument()
    expect(elegirVarias).toHaveBeenCalledTimes(1)
  })

  it("discards the batch with one motive, then brings it back on Deshacer", async () => {
    const { acciones, alSacar, alDevolver } = mostrar()
    marcar("Uno")
    marcar("Tres")
    fireEvent.click(screen.getByRole("button", { name: "Descartar (2)" }))
    fireEvent.click(screen.getByRole("button", { name: "Repetida" }))

    await waitFor(() => expect(acciones.descartarVarias).toHaveBeenCalledWith(["i0", "i2"], "repetida"))
    expect(alSacar).toHaveBeenCalledWith(["i0", "i2"])
    expect(await screen.findByText("Descarté 2 ideas.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(acciones.restaurar).toHaveBeenCalledWith(["i0", "i2"]))
    expect(alDevolver).toHaveBeenCalledWith(["i0", "i2"])
    expect(await screen.findByText("Volvieron al banco.")).toBeInTheDocument()
  })

  it("says the window closed when nothing came back", async () => {
    mostrar({ restaurar: vi.fn(async () => ({ ok: true as const, restauradas: [] })) })
    marcar("Uno")
    fireEvent.click(screen.getByRole("button", { name: "Descartar (1)" }))
    fireEvent.click(screen.getByRole("button", { name: "Débil" }))
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }))
    expect(await screen.findByText("Ya pasaron los 8 segundos: quedaron descartadas.")).toBeInTheDocument()
  })

  it("keeps the selection and says why when an action is refused", async () => {
    mostrar({
      elegirVarias: vi.fn(async () => ({
        ok: false as const,
        error: "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.",
      })),
    })
    marcar("Uno")
    fireEvent.click(screen.getByRole("button", { name: "Hacer los guiones (1)" }))
    expect(await screen.findByText(/Llegaste al tope de gasto/)).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Uno" })).toBeChecked()
  })
})
