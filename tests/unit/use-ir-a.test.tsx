import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ERROR_AL_LLEGAR, EVENTO_DE_LLEGADA, useIrA } from "@/components/use-ir-a"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const ORIGEN = "/biblioteca/temas/red-nueva"
const DESTINO = "/biblioteca/temas?red=linkedin&aviso=borrador-guardado"

// jsdom has no PerformanceObserver: this one hands the hook the resource entries a test says arrived.
const observadores = new Set<(lista: { getEntries: () => { name: string }[] }) => void>()
class ObservadorFalso {
  constructor(private readonly alLlegar: (lista: { getEntries: () => { name: string }[] }) => void) {}
  observe() {
    observadores.add(this.alLlegar)
  }
  disconnect() {
    observadores.delete(this.alLlegar)
  }
}
/** The browser finished downloading this address with the router's `_rsc` marker. */
function llego(url: string) {
  const nombre = new URL(`${url}&_rsc=abc`, window.location.origin).href
  for (const alLlegar of observadores) alLlegar({ getEntries: () => [{ name: nombre }] })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("PerformanceObserver", ObservadorFalso)
  observadores.clear()
  replace.mockReset()
  window.history.replaceState(null, "", ORIGEN)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A replace the router commits; the page then takes its note out of the address (`TrasElAviso`). */
function comprometer(url: unknown) {
  window.history.replaceState(null, "", String(url).replace(/[?&]aviso=[^&]*/, ""))
}

describe("useIrA", () => {
  it("goes to the destination once when it lands at the first try, and is not going any more", () => {
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    expect(replace).toHaveBeenCalledWith(DESTINO)
    act(() => vi.advanceTimersByTime(60_000))
    expect(replace).toHaveBeenCalledTimes(1)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("tries again when the router downloaded the screen and dropped the navigation, then lands", () => {
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    expect(result.current.yendo).toBe(true)
    act(() => {
      llego(DESTINO)
      vi.advanceTimersByTime(900)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    replace.mockImplementation(comprometer)
    act(() => vi.advanceTimersByTime(300))
    expect(replace).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(60_000))
    expect(replace).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it("tries again when nothing arrived in time, without a download to go by", () => {
    vi.stubGlobal("PerformanceObserver", undefined)
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    act(() => vi.advanceTimersByTime(9_900))
    expect(replace).toHaveBeenCalledTimes(1)
    replace.mockImplementation(comprometer)
    act(() => vi.advanceTimersByTime(200))
    expect(replace).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it("gives up after its tries and says so in her words, never pending for ever", () => {
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    act(() => vi.advanceTimersByTime(60_000))
    expect(replace).toHaveBeenCalledTimes(3)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBe(ERROR_AL_LLEGAR)
    expect(ERROR_AL_LLEGAR).toBe("Listo, pero no pude abrir la pantalla siguiente. Recarga la página.")
  })

  it("stops watching, with no error, when she taps elsewhere", () => {
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    act(() => {
      document.dispatchEvent(new Event("pointerdown"))
      vi.advanceTimersByTime(60_000)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("keeps watching when she taps inside what started it (the busy form), and tries again", () => {
    const formulario = document.createElement("form")
    const boton = document.createElement("button")
    formulario.append(boton)
    document.body.append(formulario)
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO, formulario))
    act(() => {
      boton.dispatchEvent(new Event("pointerdown", { bubbles: true }))
      vi.advanceTimersByTime(10_100)
    })
    expect(result.current.yendo).toBe(true)
    expect(replace).toHaveBeenCalledTimes(2)
    formulario.remove()
  })

  it("stops for good on Back: the screen she went back to is never pulled forward again", () => {
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"))
      vi.advanceTimersByTime(60_000)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("on the same screen does not take the address as proof: only the note's arrival says it landed", () => {
    const AQUI = "/biblioteca/temas/borradores"
    window.history.replaceState(null, "", AQUI)
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(`${AQUI}?aviso=borrador-descartado`))
    act(() => vi.advanceTimersByTime(200))
    expect(result.current.yendo).toBe(true)
    // Dropped: downloaded and nothing arrived a second later.
    act(() => {
      llego(`${AQUI}?aviso=borrador-descartado`)
      vi.advanceTimersByTime(1_100)
    })
    expect(replace).toHaveBeenCalledTimes(2)
    act(() => {
      window.dispatchEvent(new Event(EVENTO_DE_LLEGADA))
      vi.advanceTimersByTime(60_000)
    })
    expect(replace).toHaveBeenCalledTimes(2)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("ends the watch on a link inside what started it (Cancelar): a late try must not pull her back", () => {
    const formulario = document.createElement("form")
    const cancelar = document.createElement("a")
    cancelar.href = "/biblioteca/temas"
    const etiqueta = document.createElement("span")
    cancelar.append(etiqueta)
    formulario.append(cancelar)
    document.body.append(formulario)
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO, formulario))
    act(() => {
      etiqueta.dispatchEvent(new Event("pointerdown", { bubbles: true }))
      vi.advanceTimersByTime(60_000)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(result.current.yendo).toBe(false)
    expect(result.current.error).toBeNull()
    formulario.remove()
  })
  it("ends quietly when the whole page is gone mid-watch (a test environment torn down), touching nothing", () => {
    const { result } = renderHook(() => useIrA())
    act(() => result.current.ir(DESTINO))
    vi.stubGlobal("window", undefined)
    vi.stubGlobal("document", undefined)
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
