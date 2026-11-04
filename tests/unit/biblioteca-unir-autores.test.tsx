import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { unirAutoresAccion, push } = vi.hoisted(() => ({
  unirAutoresAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  push: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ unirAutoresAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { UnirAutores } from "@/app/(app)/biblioteca/autores/[id]/unir-autores"

const ORIGEN = { id: "11111111-2222-4333-8444-555555555555", nombre: "D. Ruiz" }
const DANIELA = "22222222-2222-4333-8444-555555555555"
const CONI = "33333333-2222-4333-8444-555555555555"
const OTROS = [
  { id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] },
  { id: CONI, nombre: "Constanza del Rosario", credencial: null, tipo: "coni", alias: ["Coni"] },
]

beforeEach(() => vi.clearAllMocks())

function elegir(texto: string, nombre: string) {
  fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
  fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: texto } })
  fireEvent.click(within(screen.getByRole("list", { name: "Con quién unir" })).getByRole("button", { name: nombre }))
}

describe("UnirAutores (D7)", () => {
  it("opens a search, focused, that shows nothing until she types and says when nobody matches", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
    await waitFor(() => expect(screen.getByLabelText("Buscar por nombre")).toHaveFocus())
    expect(screen.queryByRole("list", { name: "Con quién unir" })).toBeNull()
    const nota = screen.getByRole("status")
    expect(nota).toHaveTextContent("")
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "zzz" } })
    expect(screen.getByRole("status")).toBe(nota)
    expect(nota).toHaveTextContent("Nadie se llama así todavía.")
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "dan" } })
    expect(nota).toHaveTextContent("")
  })

  it("asks before joining, naming both and saying it cannot be undone; the server action takes her to the one that stayed", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    expect(
      screen.getByText(
        "Uno a D. Ruiz con Daniela Ruiz: sus materiales y sus ideas sacadas pasan a Daniela Ruiz, y D. Ruiz sale de la lista. No se puede deshacer.",
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, unir" }))
    await waitFor(() => expect(unirAutoresAccion).toHaveBeenCalledWith({ origen: ORIGEN.id, destino: DANIELA }))
    expect(push).not.toHaveBeenCalled()
  })

  it("lets Coni be the one that stays, found by her alias", () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("coni", "Constanza del Rosario")
    expect(screen.getByRole("button", { name: "Sí, unir" })).toBeInTheDocument()
  })

  it("Elegir otro goes back to the search without joining", () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    fireEvent.click(screen.getByRole("button", { name: "Elegir otro" }))
    expect(screen.getByLabelText("Buscar por nombre")).toBeInTheDocument()
    expect(unirAutoresAccion).not.toHaveBeenCalled()
  })

  it("says a refusal inside the question and stays", async () => {
    unirAutoresAccion.mockResolvedValueOnce({ ok: false, error: "Ese autor ya no existe." })
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    elegir("daniela", "Daniela Ruiz, investigadora")
    fireEvent.click(screen.getByRole("button", { name: "Sí, unir" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese autor ya no existe.")
    expect(push).not.toHaveBeenCalled()
  })

  it("Cancelar closes it and gives the focus back", async () => {
    render(<UnirAutores origen={ORIGEN} otros={OTROS} />)
    fireEvent.click(screen.getByRole("button", { name: "Unir con otro autor" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Unir con otro autor" })).toHaveFocus())
  })
})
