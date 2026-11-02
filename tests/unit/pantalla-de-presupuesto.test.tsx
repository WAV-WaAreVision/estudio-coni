import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type AccionesDelPresupuesto,
  PantallaDePresupuesto,
} from "@/app/(app)/ajustes/presupuesto/pantalla-de-presupuesto"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { PresupuestoDelMes } from "@/lib/presupuesto/presentar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const INICIAL: PresupuestoDelMes = {
  tope: 40,
  limiteExplicito: null,
  limite: 80,
  reactivado: false,
  usado: 12.8,
  porProveedor: { anthropic: 2.5, elevenlabs: 0.3, heygen: 10, voyage: 0 },
  motor: { activo: true, usd: 1.2 },
  fusiones: { activas: true, usd: 0.4 },
  avisoSinLeer: false,
  margenUsd: 1.1,
}

const ANTERIOR = { campo: "tope", valor: 40 } as CambioDeAjuste

function acciones(cambios: Partial<AccionesDelPresupuesto> = {}): AccionesDelPresupuesto {
  return {
    guardar: vi.fn(async (_cambio: CambioDeAjuste) => ({ ok: true as const, anterior: ANTERIOR })),
    reactivar: vi.fn(async (limite: number) => ({ ok: true as const, limite })),
    ...cambios,
  }
}

function mostrar(inicial: Partial<PresupuestoDelMes> = {}, cambios: Partial<AccionesDelPresupuesto> = {}) {
  const a = acciones(cambios)
  const { unmount } = render(<PantallaDePresupuesto inicial={{ ...INICIAL, ...inicial }} acciones={a} />)
  return Object.assign(a, { unmount })
}

const esperarElGuardado = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe("PantallaDePresupuesto", () => {
  it("shows the month against the cap, its marks in words, the cap and the limit", () => {
    mostrar()

    expect(screen.getByRole("meter", { name: "Gasto del mes" })).toHaveAttribute(
      "aria-valuetext",
      "Llevas US$ 12,80 de tu tope de US$ 40,00 este mes",
    )
    expect(screen.getByText("50 % del tope: US$ 20,00")).toBeInTheDocument()
    expect(screen.getByText("Límite: US$ 80,00")).toBeInTheDocument()
    expect(screen.getByText("US$ 40")).toBeInTheDocument()
    expect(screen.getByText("US$ 80 (el doble del tope)")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reactivar" })).toBeNull()
  })

  it("says past the cap that the app goes on up to the limit", () => {
    mostrar({ usado: 45 })
    expect(screen.getByText("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")).toBeInTheDocument()
  })

  it("moves the cap in steps of 5 and saves once, after she stops tapping", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    expect(screen.getByText("US$ 50")).toBeInTheDocument()
    expect(screen.getByText("US$ 100 (el doble del tope)")).toBeInTheDocument()
    expect(a.guardar).not.toHaveBeenCalled()

    await esperarElGuardado()

    expect(a.guardar).toHaveBeenCalledTimes(1)
    expect(a.guardar).toHaveBeenCalledWith({ campo: "tope", valor: 50 })
  })

  it("brings the limit back to twice the cap on screen when the cap goes above the limit she set", () => {
    mostrar({ limiteExplicito: 45, limite: 45 })

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))

    expect(screen.getByText("US$ 100 (el doble del tope)")).toBeInTheDocument()
  })

  it("stores a limit stepped back to twice the cap as no limit of her own", async () => {
    const a = mostrar({ limiteExplicito: 75, limite: 75 })

    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await esperarElGuardado()

    expect(a.guardar).toHaveBeenCalledWith({ campo: "limite", valor: null })
  })

  it("never offers a limit under the cap", () => {
    mostrar({ limiteExplicito: 40, limite: 40 })
    expect(screen.getByRole("button", { name: "Bajar el límite" })).toHaveAttribute("aria-disabled", "true")
  })

  it("shows the server's warning after a save", async () => {
    mostrar(
      {},
      {
        guardar: vi.fn(async () => ({
          ok: true as const,
          anterior: ANTERIOR,
          aviso: "Tu límite volvió al doble del tope: US$ 100,00.",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()

    expect(await screen.findByText("Tu límite volvió al doble del tope: US$ 100,00.")).toBeInTheDocument()
  })

  it("at the limit offers Reactivar, prefilled with the limit plus the cap, with one confirmation", async () => {
    const a = mostrar({ usado: 79 })

    expect(
      screen.getByText("Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue."),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }))
    expect(screen.getByLabelText("Tu límite de este mes")).toHaveValue("120")
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(a.reactivar).toHaveBeenCalledWith(120))
    expect(await screen.findByText("Listo: tu límite de este mes es US$ 120,00.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reactivar" })).toBeNull()
    expect(screen.getByText("Este mes tu límite es US$ 120,00 porque lo reactivaste.")).toBeInTheDocument()
  })

  it("explains a refusal in plain Spanish and keeps what she wrote", async () => {
    mostrar(
      { usado: 79 },
      {
        reactivar: vi.fn(async () => ({
          ok: false as const,
          error: "Ese límite no alcanza: ya gastaste US$ 79,00 este mes. Elige uno mayor.",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }))
    fireEvent.change(screen.getByLabelText("Tu límite de este mes"), { target: { value: "70" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    expect(
      await screen.findByText("Ese límite no alcanza: ya gastaste US$ 79,00 este mes. Elige uno mayor."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Tu límite de este mes")).toHaveValue("70")
  })

  it("lists this month by provider", () => {
    mostrar()
    const lista = screen.getByRole("list", { name: "Gasto por proveedor" })
    expect(
      within(lista)
        .getAllByRole("listitem")
        .map((fila) => fila.textContent),
    ).toEqual(["ClaudeUS$ 2,50", "ElevenLabsUS$ 0,30", "HeyGenUS$ 10,00", "VoyageUS$ 0,00"])
  })

  it("switches off what spends by itself, with this month's spend beside each", async () => {
    const a = mostrar()

    expect(screen.getByText("US$ 1,20 este mes, contando «Proponer ahora»")).toBeInTheDocument()
    expect(screen.getByText("US$ 0,40 este mes")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" }))
    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "motor_semanal", valor: false }))
    fireEvent.click(screen.getByRole("switch", { name: "Unir temas parecidos cada noche" }))
    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "fusiones_nocturnas", valor: false }))
  })
  it("still saves a stepper tap when she leaves the screen before the wait ends", () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    a.unmount()
    expect(a.guardar).toHaveBeenCalledWith({ campo: "tope", valor: 45 })
  })

  it("still saves a stepper tap when the page is hidden before the wait ends", () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })
    expect(a.guardar).toHaveBeenCalledWith({ campo: "limite", valor: 85 })
  })

  it("undoes only the cap when its save fails, keeping a switch she changed meanwhile", async () => {
    mostrar(
      {},
      {
        guardar: vi.fn(async (cambio: CambioDeAjuste) =>
          cambio.campo === "tope"
            ? { ok: false as const, error: "No pude guardar tu tope." }
            : { ok: true as const, anterior: ANTERIOR },
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" }))
    await esperarElGuardado()

    const topeYLimite = screen.getByRole("region", { name: "Tope y límite" })
    expect(await within(topeYLimite).findByText("No pude guardar tu tope.")).toBeInTheDocument()
    expect(within(topeYLimite).getByText("US$ 40")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" })).toHaveAttribute("aria-checked", "false")
  })

  it("undoes only the switch when its save fails, keeping the cap she moved meanwhile and its error", async () => {
    let fallar: (valor: { ok: false; error: string }) => void = () => {}
    mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "motor_semanal"
            ? new Promise<{ ok: false; error: string }>((resolver) => {
                fallar = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await act(async () => {
      fallar({ ok: false, error: "No pude apagar las ideas del domingo." })
    })

    const soloRegion = screen.getByRole("region", { name: "Lo que gasta solo" })
    expect(await within(soloRegion).findByText("No pude apagar las ideas del domingo.")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("US$ 45")).toBeInTheDocument()

    // A later save of the cap does not clear the switch's error.
    await esperarElGuardado()
    expect(within(soloRegion).getByText("No pude apagar las ideas del domingo.")).toBeInTheDocument()
  })

  it("offers Deshacer after a save, which saves what was there", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "tope", valor: 40 }))
    expect(screen.getByText("US$ 40")).toBeInTheDocument()
  })

  it("takes a limit written with a decimal comma", async () => {
    const a = mostrar({ usado: 79 })

    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }))
    fireEvent.change(screen.getByLabelText("Tu límite de este mes"), { target: { value: "120,5" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(a.reactivar).toHaveBeenCalledWith(120.5))
  })

  it("never steps the limit under the first step at or above an odd cap", () => {
    mostrar({ tope: 42, limiteExplicito: 45, limite: 45 })
    expect(screen.getByRole("button", { name: "Bajar el límite" })).toHaveAttribute("aria-disabled", "true")
  })
  it("keeps a newer cap save when an older one fails after it", async () => {
    let fallarPrimero: (valor: { ok: false; error: string }) => void = () => {}
    mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "tope" && cambio.valor === 45
            ? new Promise<{ ok: false; error: string }>((resolver) => {
                fallarPrimero = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    await act(async () => {
      fallarPrimero({ ok: false, error: "No pude guardar tu tope." })
    })

    const topeYLimite = screen.getByRole("region", { name: "Tope y límite" })
    expect(within(topeYLimite).getByText("US$ 50")).toBeInTheDocument()
    expect(within(topeYLimite).queryByText("No pude guardar tu tope.")).toBeNull()
  })

  it("keeps a switch flipped back when the first flip fails after the second saved", async () => {
    let fallarPrimero: (valor: { ok: false; error: string }) => void = () => {}
    mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "motor_semanal" && cambio.valor === false
            ? new Promise<{ ok: false; error: string }>((resolver) => {
                fallarPrimero = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    const interruptor = () => screen.getByRole("switch", { name: "Ideas nuevas cada domingo" })
    fireEvent.click(interruptor())
    fireEvent.click(interruptor())
    await act(async () => {
      fallarPrimero({ ok: false, error: "No pude apagar las ideas del domingo." })
    })

    expect(interruptor()).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByText("No pude apagar las ideas del domingo.")).toBeNull()
  })

  it("does not offer a new Deshacer for the taps it saves on the way to undoing", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }))
    await esperarElGuardado()

    expect(a.guardar).toHaveBeenCalledWith({ campo: "limite", valor: 95 })
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
  })

  it("saves pending taps when the page goes to the background", () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    const estado = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    estado.mockRestore()
    expect(a.guardar).toHaveBeenCalledWith({ campo: "tope", valor: 45 })
  })

  it("ties each error to its own controls", async () => {
    mostrar(
      {},
      {
        guardar: vi.fn(async (cambio: CambioDeAjuste) => ({
          ok: false as const,
          error: cambio.campo === "tope" ? "No pude guardar tu tope." : "No pude apagar las ideas del domingo.",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" }))
    await esperarElGuardado()

    expect(await screen.findByRole("button", { name: "Subir el tope" })).toHaveAccessibleDescription(
      "No pude guardar tu tope.",
    )
    expect(screen.getByRole("button", { name: "Bajar el tope" })).toHaveAccessibleDescription(
      "No pude guardar tu tope.",
    )
    expect(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" })).toHaveAccessibleDescription(
      "No pude apagar las ideas del domingo.",
    )
    expect(screen.getByRole("button", { name: "Subir el límite" })).not.toHaveAttribute("aria-describedby")
  })

  it("offers no Deshacer when raising the cap took back the limit she set", async () => {
    mostrar(
      { limiteExplicito: 45, limite: 45 },
      {
        guardar: vi.fn(async () => ({
          ok: true as const,
          anterior: ANTERIOR,
          aviso: "Tu límite volvió al doble del tope: US$ 100,00.",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()

    expect(await screen.findByText("Tu límite volvió al doble del tope: US$ 100,00.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
  })
  it("saves and shows a limit tapped while a cap save hangs and then fails", async () => {
    let fallarElTope: (valor: { ok: false; error: string }) => void = () => {}
    const a = mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "tope"
            ? new Promise<{ ok: false; error: string }>((resolver) => {
                fallarElTope = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await act(async () => {
      fallarElTope({ ok: false, error: "No pude guardar tu tope." })
    })
    await esperarElGuardado()

    expect(a.guardar).toHaveBeenLastCalledWith({ campo: "limite", valor: 95 })
    const topeYLimite = screen.getByRole("region", { name: "Tope y límite" })
    expect(within(topeYLimite).getByText("US$ 40")).toBeInTheDocument()
    expect(within(topeYLimite).getByText("US$ 95")).toBeInTheDocument()
    expect(within(topeYLimite).getByText("No pude guardar tu tope.")).toBeInTheDocument()
  })

  it("saves a cap and a limit tapped together in one flush, the cap first and the limit after it", async () => {
    let terminarElTope: (valor: { ok: true; anterior: CambioDeAjuste }) => void = () => {}
    const a = mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "tope"
            ? new Promise<{ ok: true; anterior: CambioDeAjuste }>((resolver) => {
                terminarElTope = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: { campo: "limite", valor: null } as CambioDeAjuste }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await esperarElGuardado()
    expect(vi.mocked(a.guardar).mock.calls).toEqual([[{ campo: "tope", valor: 45 }]])

    await act(async () => {
      terminarElTope({ ok: true, anterior: ANTERIOR })
    })
    expect(vi.mocked(a.guardar).mock.calls).toEqual([[{ campo: "tope", valor: 45 }], [{ campo: "limite", valor: 95 }]])
  })
  it("shows what the database kept when an older switch save succeeds after a newer one failed", async () => {
    let terminarPrimero: (valor: { ok: true; anterior: CambioDeAjuste }) => void = () => {}
    mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "motor_semanal" && cambio.valor === false
            ? new Promise<{ ok: true; anterior: CambioDeAjuste }>((resolver) => {
                terminarPrimero = resolver
              })
            : Promise.resolve({ ok: false as const, error: "No pude encender las ideas del domingo." }),
        ),
      },
    )

    const interruptor = () => screen.getByRole("switch", { name: "Ideas nuevas cada domingo" })
    fireEvent.click(interruptor())
    fireEvent.click(interruptor())
    await act(async () => {})
    await act(async () => {
      terminarPrimero({ ok: true, anterior: { campo: "motor_semanal", valor: true } as CambioDeAjuste })
    })

    expect(interruptor()).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByText("Guardado")).toBeNull()
    expect(screen.getByText("No pude encender las ideas del domingo.")).toBeInTheDocument()
  })

  it("keeps an undo pressed while a stepper save is in flight that then fails", async () => {
    let fallarElLimite: (valor: { ok: false; error: string }) => void = () => {}
    const a = mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "limite"
            ? new Promise<{ ok: false; error: string }>((resolver) => {
                fallarElLimite = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    const deshacer = await screen.findByRole("button", { name: "Deshacer" })
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await esperarElGuardado()
    fireEvent.click(deshacer)
    await act(async () => {
      fallarElLimite({ ok: false, error: "No pude guardar tu límite." })
    })

    expect(a.guardar).toHaveBeenLastCalledWith({ campo: "tope", valor: 40 })
    expect(within(screen.getByRole("region", { name: "Tope y límite" })).getByText("US$ 40")).toBeInTheDocument()
  })

  it("still shows the cap's warning when the limit after it fails in the same flush", async () => {
    mostrar(
      {},
      {
        guardar: vi.fn(async (cambio: CambioDeAjuste) =>
          cambio.campo === "tope"
            ? { ok: true as const, anterior: ANTERIOR, aviso: "Ya gastaste US$ 50,00; lo nuevo queda en pausa." }
            : { ok: false as const, error: "No pude guardar tu límite." },
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await esperarElGuardado()

    const topeYLimite = screen.getByRole("region", { name: "Tope y límite" })
    expect(await screen.findByText("Ya gastaste US$ 50,00; lo nuevo queda en pausa.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
    expect(within(topeYLimite).getByText("US$ 45")).toBeInTheDocument()
    expect(within(topeYLimite).getByText("US$ 90 (el doble del tope)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir el límite" })).toHaveAccessibleDescription(
      "No pude guardar tu límite.",
    )
  })

  it("still sends the taps left behind when she leaves during a save", async () => {
    let terminarElTope: (valor: { ok: true; anterior: CambioDeAjuste }) => void = () => {}
    const a = mostrar(
      {},
      {
        guardar: vi.fn((cambio: CambioDeAjuste) =>
          cambio.campo === "tope"
            ? new Promise<{ ok: true; anterior: CambioDeAjuste }>((resolver) => {
                terminarElTope = resolver
              })
            : Promise.resolve({ ok: true as const, anterior: ANTERIOR }),
        ),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()
    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    a.unmount()
    await act(async () => {
      terminarElTope({ ok: true, anterior: ANTERIOR })
    })

    expect(a.guardar).toHaveBeenLastCalledWith({ campo: "limite", valor: 95 })
  })
})
