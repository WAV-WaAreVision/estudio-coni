import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ERROR_AL_LLEGAR, useIrA } from "@/components/use-ir-a"

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
    expect(ERROR_AL_LLEGAR).toMatch(/recarga/i)
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
})
