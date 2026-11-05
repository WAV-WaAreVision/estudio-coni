import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { guardarBorradorDePilarAccion, editarBorradorDePilarAccion } = vi.hoisted(() => ({
  guardarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  editarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({
  guardarBorradorDePilarAccion,
  editarBorradorDePilarAccion,
}))

import { FormularioDePilar } from "@/app/(app)/biblioteca/temas/formulario-de-pilar"
import { ERRORES_DE_PILAR } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const CANCELAR = "/biblioteca/temas?red=linkedin"

beforeEach(() => vi.clearAllMocks())

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

function llenarTodo() {
  escribir("Nombre", "  Liderazgo sereno: decidir con IA ")
  escribir("Nombre corto", "Liderazgo sereno")
  escribir("Definición", "Cómo decide una líder cuando la IA acelera todo.")
  escribir("Peso (%)", "12,5")
}

describe("FormularioDePilar", () => {
  it("saves a new draft of the network it was opened for, trimmed and with the weight read her way", async () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(guardarBorradorDePilarAccion).toHaveBeenCalledWith({
        red: "linkedin",
        nombre: "Liderazgo sereno: decidir con IA",
        nombreCorto: "Liderazgo sereno",
        descripcion: "Cómo decide una líder cuando la IA acelera todo.",
        peso: 12.5,
      }),
    )
  })

  it("says what is missing, marks that field, gives it the focus and sends nothing", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    escribir("Nombre corto", "  ")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(ERRORES_DE_PILAR.nombreCorto)
    const campo = screen.getByLabelText("Nombre corto")
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(campo).toHaveFocus()
    expect(campo.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").parentElement?.id ?? "-")
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("refuses a weight that is not over 0 and up to 100", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "instagram" }} cancelar={CANCELAR} />)
    llenarTodo()
    escribir("Peso (%)", "120")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(ERRORES_DE_PILAR.peso)
    expect(screen.getByLabelText("Peso (%)")).toHaveFocus()
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("edits a saved draft from its values", async () => {
    render(
      <FormularioDePilar
        modo={{ tipo: "editar", id: ID }}
        inicial={{ nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: "10" }}
        cancelar="/biblioteca/temas/borradores"
      />,
    )
    expect(screen.getByLabelText("Nombre corto")).toHaveValue("Sereno")
    escribir("Peso (%)", "15")
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(editarBorradorDePilarAccion).toHaveBeenCalledWith({
        id: ID,
        nombre: "Liderazgo sereno",
        nombreCorto: "Sereno",
        descripcion: "Cómo decide.",
        peso: 15,
      }),
    )
    expect(guardarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("says the server's refusal, and Cancelar is a link back that saves nothing", async () => {
    guardarBorradorDePilarAccion.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    llenarTodo()
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esta app es solo para Coni."))
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", CANCELAR)
  })

  it("labels every field and explains the short name and the weight", () => {
    render(<FormularioDePilar modo={{ tipo: "nuevo", red: "linkedin" }} cancelar={CANCELAR} />)
    expect(screen.getByLabelText("Nombre corto")).toHaveAccessibleDescription("Es el texto del botón en Temas.")
    expect(screen.getByLabelText("Peso (%)")).toHaveAttribute("inputmode", "decimal")
    expect(screen.getByLabelText("Definición").tagName).toBe("TEXTAREA")
  })
})
