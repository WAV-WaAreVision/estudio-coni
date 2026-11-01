import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RegistroDeDatos } from "@/app/(app)/ajustes/datos-personales/registro-de-datos"
import type { Resultado } from "@/lib/acciones/resultado"
import type { VistaDelRegistro } from "@/lib/datos-personales/presentar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const VISTA: VistaDelRegistro = {
  tarjetas: [
    {
      clave: "rostro_de_coni",
      dato: "Tu rostro (biometría)",
      paraQue: "Crear y animar tu avatar digital en los reels.",
      donde: "HeyGen, Estados Unidos (por confirmar)",
      plazo: "Mientras uses el avatar. Se borra si se lo pides a HeyGen.",
      discrepancia: null,
    },
    {
      clave: "respaldos",
      dato: "Respaldo nocturno de la base",
      paraQue: "Recuperar la app si algo se pierde.",
      donde: "Cloudflare R2, Por confirmar",
      plazo: "Se guardan los últimos 90 días.",
      discrepancia: "No coincide con lo que la app borra (30 días)",
    },
  ],
  borrados: [{ id: "b1", frase: "Se borraron 3 archivos de videos y voces el 2 de noviembre." }],
  revision: { ultima: null, vence: "15 de noviembre de 2027" },
}

type Marcar = () => Promise<Resultado<{ revisadoEn: string }>>

function mostrar(
  vista: VistaDelRegistro = VISTA,
  marcar: Marcar = async () => ({ ok: true, revisadoEn: "2026-11-02T12:00:00Z" }),
) {
  const accion = vi.fn<Marcar>(marcar)
  render(<RegistroDeDatos {...vista} marcar={accion} />)
  return accion
}

function tarjetaDe(dato: string): HTMLElement {
  const tarjeta = screen.getAllByRole("listitem").find((item) => item.textContent?.includes(dato))
  if (!tarjeta) throw new Error(`No hay tarjeta de ${dato}`)
  return tarjeta
}

describe("RegistroDeDatos", () => {
  it("shows one card per kind of data with what for, where and when it is deleted", () => {
    mostrar()

    const rostro = tarjetaDe("Tu rostro (biometría)")
    expect(within(rostro).getByRole("heading", { name: "Tu rostro (biometría)" })).toBeInTheDocument()
    expect(within(rostro).getByText("Crear y animar tu avatar digital en los reels.")).toBeInTheDocument()
    expect(within(rostro).getByText("HeyGen, Estados Unidos (por confirmar)")).toBeInTheDocument()
    expect(within(rostro).getByText("Mientras uses el avatar. Se borra si se lo pides a HeyGen.")).toBeInTheDocument()
    expect(within(rostro).queryByText(/No coincide/)).toBeNull()
    const respaldos = tarjetaDe("Respaldo nocturno de la base")
    expect(within(respaldos).getByText("No coincide con lo que la app borra (30 días)")).toBeInTheDocument()
  })

  it("lists the latest deletions in words", () => {
    mostrar()
    expect(screen.getByText("Se borraron 3 archivos de videos y voces el 2 de noviembre.")).toBeInTheDocument()
  })

  it("says when nothing was deleted yet", () => {
    mostrar({ ...VISTA, borrados: [] })
    expect(screen.getByText("Todavía no hay borrados anotados.")).toBeInTheDocument()
  })

  it("says when the review is due and marks it reviewed", async () => {
    const marcar = mostrar()
    expect(
      screen.getByText("Todavía no la revisas. Tu próxima revisión vence el 15 de noviembre de 2027."),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Lo revisé" }))

    expect(await screen.findByText("Quedó anotado. Gracias.")).toBeInTheDocument()
    expect(marcar).toHaveBeenCalledOnce()
  })

  it("names her latest review", () => {
    mostrar({ ...VISTA, revision: { ultima: "2 de noviembre de 2026", vence: "2 de noviembre de 2027" } })
    expect(
      screen.getByText(
        "La revisaste por última vez el 2 de noviembre de 2026. Tu próxima revisión vence el 2 de noviembre de 2027.",
      ),
    ).toBeInTheDocument()
  })

  it("says why when the review could not be written down", async () => {
    mostrar(VISTA, async () => ({
      ok: false,
      error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
    }))

    fireEvent.click(screen.getByRole("button", { name: "Lo revisé" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(screen.queryByText("Quedó anotado. Gracias.")).toBeNull()
  })
})
