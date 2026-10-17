import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CuentasConectadas } from "@/app/(app)/ajustes/cuentas-conectadas"
import type { EstadoDeLlave } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import type { FilaDeCuenta } from "@/lib/ajustes/presentar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const FILAS: FilaDeCuenta[] = [
  { cuenta: "instagram", nombre: "Instagram", estado: "Vence en 6 días", tono: "aviso" },
  { cuenta: "heygen", nombre: "HeyGen", estado: "Conectada", tono: "ok" },
  { cuenta: "elevenlabs", nombre: "ElevenLabs", estado: "Falta", tono: "aviso" },
  { cuenta: "anthropic", nombre: "Claude (Anthropic)", estado: "No aceptó la llave", tono: "error" },
]

function mostrar(guardarLlave: (cuenta: string, llave: string) => Promise<Resultado<{ estado: EstadoDeLlave }>>) {
  render(<CuentasConectadas filas={FILAS} guardarLlave={guardarLlave} desconectarLinkedin={vi.fn()} />)
}

afterEach(() => {
  vi.useRealTimers()
})

describe("CuentasConectadas", () => {
  it("keeps the toast's 8 s while she opens another key: a re-render does not restart its timer", async () => {
    vi.useFakeTimers()
    mostrar(vi.fn(async () => ({ ok: true as const, estado: "comprobada" as const })))
    fireEvent.click(screen.getByRole("button", { name: "Agregar la llave de ElevenLabs" }))
    fireEvent.change(screen.getByLabelText("Llave de ElevenLabs"), { target: { value: "la-llave" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar y comprobar" }))
    })
    expect(screen.getByText("Guardada y comprobada.")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la llave de HeyGen" }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText("Guardada y comprobada.")).toBeNull()
  })

  it("draws each state as a flat pill and the name of the account at the script size", () => {
    mostrar(vi.fn())
    expect(screen.getByText("Conectada").parentElement).toHaveClass("bg-piedra-honda", "min-h-pildora")
    expect(screen.getByText("No aceptó la llave").parentElement).toHaveClass("text-error")
    expect(screen.getByText("HeyGen")).toHaveClass("text-guion", "font-semibold")
  })

  it("folds 'Cambiar la llave' under Más opciones, open when the key was refused", () => {
    mostrar(vi.fn())
    expect(screen.getByRole("button", { name: "Cambiar la llave de HeyGen" }).closest("details")).not.toHaveAttribute(
      "open",
    )
    expect(
      screen.getByRole("button", { name: "Cambiar la llave de Claude (Anthropic)" }).closest("details"),
    ).toHaveAttribute("open")
    expect(screen.getByRole("button", { name: "Agregar la llave de ElevenLabs" }).closest("details")).toBeNull()
  })

  it("says in words how each account is", () => {
    mostrar(vi.fn())

    expect(screen.getByText("Vence en 6 días")).toBeInTheDocument()
    expect(screen.getByText("Conectada")).toBeInTheDocument()
    expect(screen.getByText("Falta")).toBeInTheDocument()
    expect(screen.getByText("No aceptó la llave")).toBeInTheDocument()
  })

  it("offers to renew Instagram through the connection route, and to connect it when it is missing", () => {
    mostrar(vi.fn())

    expect(screen.getByRole("link", { name: "Renovar Instagram" })).toHaveAttribute("href", "/api/meta/conectar")
  })

  it("offers Conectar Instagram while it is missing", () => {
    render(
      <CuentasConectadas
        filas={[{ cuenta: "instagram", nombre: "Instagram", estado: "Falta", tono: "aviso" }]}
        guardarLlave={vi.fn()}
        desconectarLinkedin={vi.fn()}
      />,
    )

    expect(screen.getByRole("link", { name: "Conectar Instagram" })).toHaveAttribute("href", "/api/meta/conectar")
  })

  it("has no key field for Instagram: it connects through Instagram's own window", () => {
    mostrar(vi.fn())

    expect(screen.queryByRole("button", { name: /llave de Instagram/i })).not.toBeInTheDocument()
  })

  it("opens a private field for the key, saves it and says it was checked", async () => {
    const guardar = vi.fn(async () => ({ ok: true as const, estado: "comprobada" as const }))
    mostrar(guardar)

    fireEvent.click(screen.getByRole("button", { name: "Agregar la llave de ElevenLabs" }))
    const campo = screen.getByLabelText("Llave de ElevenLabs")
    expect(campo).toHaveAttribute("type", "password")
    expect(campo).toHaveAttribute("autocomplete", "off")
    fireEvent.change(campo, { target: { value: "  la-llave-nueva  " } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar y comprobar" }))

    await waitFor(() => expect(guardar).toHaveBeenCalledWith("elevenlabs", "la-llave-nueva"))
    expect(await screen.findByText("Guardada y comprobada.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Llave de ElevenLabs")).not.toBeInTheDocument()
  })

  it("says the key was saved but could not be checked", async () => {
    mostrar(vi.fn(async () => ({ ok: true as const, estado: "sin_comprobar" as const })))

    fireEvent.click(screen.getByRole("button", { name: "Cambiar la llave de HeyGen" }))
    fireEvent.change(screen.getByLabelText("Llave de HeyGen"), { target: { value: "otra-llave-larga" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar y comprobar" }))

    expect(await screen.findByText("Guardada. No pude comprobarla ahora, la reviso más tarde.")).toBeInTheDocument()
  })

  it("keeps the field open and shows why when the key is refused", async () => {
    mostrar(
      vi.fn(async () => ({
        ok: false as const,
        error: "Claude no aceptó esa llave. Revisa que la copiaste completa.",
      })),
    )

    fireEvent.click(screen.getByRole("button", { name: "Cambiar la llave de Claude (Anthropic)" }))
    fireEvent.change(screen.getByLabelText("Llave de Claude (Anthropic)"), { target: { value: "una-llave-mala" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar y comprobar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Claude no aceptó esa llave")
    expect(screen.getByLabelText("Llave de Claude (Anthropic)")).toBeInTheDocument()
  })

  it("does not send an empty field", () => {
    const guardar = vi.fn()
    mostrar(guardar)

    fireEvent.click(screen.getByRole("button", { name: "Agregar la llave de ElevenLabs" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar y comprobar" }))

    expect(guardar).not.toHaveBeenCalled()
  })
})

describe("CuentasConectadas, LinkedIn", () => {
  const LINKEDIN_CONECTADO: FilaDeCuenta = {
    cuenta: "linkedin",
    nombre: "LinkedIn",
    estado: "Conectada",
    tono: "ok",
    detalle: "Publica como Coni del Rosario",
    conectada: true,
  }

  it("offers Conectar LinkedIn as a plain link when it goes by hand", () => {
    render(
      <CuentasConectadas
        filas={[{ cuenta: "linkedin", nombre: "LinkedIn", estado: "A mano", tono: "neutro", conectada: false }]}
        guardarLlave={vi.fn()}
        desconectarLinkedin={vi.fn()}
      />,
    )
    expect(screen.getByRole("link", { name: "Conectar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
    expect(screen.queryByText("Desconectar LinkedIn")).toBeNull()
  })

  it("shows who it publishes as, Renovar and Desconectar when connected", () => {
    render(<CuentasConectadas filas={[LINKEDIN_CONECTADO]} guardarLlave={vi.fn()} desconectarLinkedin={vi.fn()} />)
    expect(screen.getByText("Publica como Coni del Rosario")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Renovar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
  })

  it("asks in a folded honda block before disconnecting, and tells her afterwards", async () => {
    const desconectar = vi.fn(async () => ({ ok: true as const }))
    render(<CuentasConectadas filas={[LINKEDIN_CONECTADO]} guardarLlave={vi.fn()} desconectarLinkedin={desconectar} />)
    const peligro = screen.getByText("Desconectar LinkedIn").closest("details") as HTMLElement
    expect(peligro).not.toHaveAttribute("open")
    fireEvent.click(screen.getByText("Desconectar LinkedIn"))
    expect(peligro).toHaveAttribute("open")
    expect(
      screen.getByText("Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."),
    ).toBeInTheDocument()
    expect(desconectar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Sí, desconectar" })).toHaveClass("text-error", "bg-piedra")
    fireEvent.click(screen.getByRole("button", { name: "Sí, desconectar" }))
    await waitFor(() => expect(desconectar).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(
        "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la configuración de tu cuenta de LinkedIn.",
      ),
    ).toBeInTheDocument()
  })

  it("makes Renovar LinkedIn the primary when the connection needs her", () => {
    render(
      <CuentasConectadas
        filas={[{ ...LINKEDIN_CONECTADO, estado: "Vence en 10 días", tono: "aviso" }]}
        guardarLlave={vi.fn()}
        desconectarLinkedin={vi.fn()}
      />,
    )
    expect(screen.getByRole("link", { name: "Renovar LinkedIn" })).toHaveClass("bg-tinta")
  })
})
