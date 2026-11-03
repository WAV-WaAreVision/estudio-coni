import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useRedibujar } from "@/components/use-redibujar"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const ORIGEN = "/biblioteca?m=abc"

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
/** The browser finished downloading this address (the router's fetch of the fresh screen). */
function llego(url: string) {
  const nombre = new URL(url, window.location.origin).href
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

/** What the router would do with a replace that commits: the address shows the new marker. */
function comprometer(url: unknown) {
  window.history.replaceState(null, "", String(url))
}

/** A replace that commits and, `trasMs` later, an action's late commit that puts back the address it left. */
function comprometerYVolverAtras(trasMs: number) {
  return (url: unknown) => {
    comprometer(url)
    setTimeout(() => window.history.replaceState(null, "", ORIGEN), trasMs)
  }
}

describe("useRedibujar", () => {
  it("keeps the view and the anchor she was at, and changes only the marker", () => {
    window.history.replaceState(null, "", "/calendario?vista=agenda&v=1#semana-del-19")
    const { result } = renderHook(() => useRedibujar())

    result.current()

    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/calendario\?vista=agenda&v=\d+#semana-del-19$/), {
      scroll: false,
    })
  })

  it("redraws once its marker is on screen, and not again", () => {
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  // A slow server render (a phone on mobile data) is not a fallback: issuing the replace again would supersede the one
  // in flight, so nothing would ever commit.
  it("does not re-issue a replace that is still pending", () => {
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  // In the production build an action's own revalidated tree could commit after the redraw and put back the address
  // (and the screen) from before it.
  it("redraws again when the screen falls back after its marker was seen, three times at most", () => {
    replace.mockImplementation(comprometerYVolverAtras(300))
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(3)
    for (const [url] of replace.mock.calls) expect(url).toMatch(/^\/biblioteca\?m=abc&v=\d+$/)
  })

  it("redraws again when a slow render falls back once it finally showed its marker", () => {
    replace.mockImplementationOnce((url: unknown) => {
      setTimeout(() => comprometer(url), 3000)
      setTimeout(() => window.history.replaceState(null, "", ORIGEN), 3300)
    })
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(2)
  })

  // In the production build Next 16 sometimes fetches the screen and then drops the navigation: the address never
  // changes. Only a fetch that finished tells a dropped redraw from one still in flight.
  it("redraws again when the router fetched the fresh screen but never showed it", () => {
    replace.mockImplementationOnce((url: unknown) => {
      setTimeout(() => llego(`${String(url)}&_rsc=x`), 200)
    })
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(2)
  })

  it("does not take a download of another address for its own", () => {
    const { result } = renderHook(() => useRedibujar())

    result.current()
    llego("/biblioteca?m=abc&v=1&_rsc=x")
    llego("/biblioteca?m=otro&_rsc=x")
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("stops checking when she taps or types, so it never takes back the address she is going to", () => {
    for (const evento of [new Event("pointerdown"), new KeyboardEvent("keydown", { key: "Enter" })]) {
      replace.mockReset()
      window.history.replaceState(null, "", ORIGEN)
      replace.mockImplementation(comprometerYVolverAtras(300))
      const { result } = renderHook(() => useRedibujar())

      result.current()
      vi.advanceTimersByTime(100)
      document.dispatchEvent(evento)
      vi.advanceTimersByTime(20_000)

      expect(replace).toHaveBeenCalledTimes(1)
    }
  })

  it("does not take her back when she went somewhere else meanwhile", () => {
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(100)
    window.history.replaceState(null, "", "/biblioteca?m=otro")
    vi.advanceTimersByTime(500)
    window.history.replaceState(null, "", ORIGEN)
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("leaves another redraw's marker alone instead of taking it for a fallback", () => {
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(100)
    window.history.replaceState(null, "", `${ORIGEN}&v=999`)
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("stops checking when its caller calls it off", () => {
    replace.mockImplementation(comprometerYVolverAtras(300))
    const { result } = renderHook(() => useRedibujar())

    const dejar = result.current()
    vi.advanceTimersByTime(100)
    dejar()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(observadores.size).toBe(0)
  })

  // The check outlives the button that asked for it (the fresh screen may unmount it), so it has to end by itself.
  it("leaves no timer or listener behind once the check ends, even after the button unmounted", () => {
    const anadir = vi.spyOn(document, "addEventListener")
    const quitar = vi.spyOn(document, "removeEventListener")
    replace.mockImplementation(comprometerYVolverAtras(300))
    const { result, unmount } = renderHook(() => useRedibujar())

    result.current()
    unmount()
    vi.advanceTimersByTime(20_000)

    expect(replace).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
    expect(quitar.mock.calls.length).toBe(anadir.mock.calls.length)
    expect(observadores.size).toBe(0)
    anadir.mockRestore()
    quitar.mockRestore()
  })
})
