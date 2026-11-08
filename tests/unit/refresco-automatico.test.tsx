// tests/unit/refresco-automatico.test.tsx
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RefrescoAutomatico } from "@/components/refresco-automatico"

// A `router.refresh()` loses the race with the address's prefetches in the production build (`useRedibujar`): each
// round redraws the screen on its own address with a fresh marker, replacing the history entry.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

function visibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  // The router commits each redraw: the address shows its marker, so no redraw is tried again.
  replace.mockReset()
  replace.mockImplementation((url: string) => window.history.replaceState(null, "", url))
  window.history.replaceState(null, "", "/biblioteca?estado=procesando&m=abc#tabla")
  visibilidad("visible")
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("RefrescoAutomatico", () => {
  it("redraws on its own address every interval while active, keeping filters, anchor and scroll", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).toHaveBeenCalledTimes(3)
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/biblioteca\?estado=procesando&m=abc&v=\d+#tabla$/),
      { scroll: false },
    )
  })

  it("does nothing while not active", () => {
    render(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).not.toHaveBeenCalled()
  })

  it("stops when it becomes inactive", () => {
    const { rerender } = render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    rerender(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("pauses while the tab is hidden and redraws once when it comes back", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => visibilidad("hidden"))
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).not.toHaveBeenCalled()
    act(() => visibilidad("visible"))
    expect(replace).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it("skips the round that falls right after she taps or types, so it never undoes the address she is going to", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(3500))
    act(() => {
      document.dispatchEvent(new Event("pointerdown"))
    })
    act(() => vi.advanceTimersByTime(500))
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    })
    act(() => vi.advanceTimersByTime(4000))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  // A slow render (a phone on mobile data) is never superseded: not by its own check, nor by the next round (issue 115).
  it("never re-issues a round's redraw that is still in flight", () => {
    replace.mockReset()
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    act(() => vi.advanceTimersByTime(3900))
    expect(replace).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(100))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  // Issue 115: on a slow network a round must not ask for another tree on top of the one still downloading.
  it("skips its rounds while the last redraw has not reached the screen, and resumes once it has", () => {
    const pendientes: string[] = []
    replace.mockImplementation((url: string) => {
      pendientes.push(url)
    })
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    expect(replace).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(8000))
    expect(replace).toHaveBeenCalledTimes(1)

    act(() => {
      window.history.replaceState(null, "", pendientes[0])
      vi.advanceTimersByTime(50)
    })
    act(() => vi.advanceTimersByTime(4000))
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it("keeps skipping when she taps during a slow redraw, since the tap ends the watch but not the download", () => {
    replace.mockImplementation(() => undefined)
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    act(() => {
      document.dispatchEvent(new Event("pointerdown"))
    })
    act(() => vi.advanceTimersByTime(8000))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("gives up on a redraw that never reaches the screen after 15 s and polls again", () => {
    replace.mockImplementation(() => undefined)
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    act(() => {
      document.dispatchEvent(new Event("pointerdown"))
    })
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it("does not redraw on coming back to the tab while the last redraw is still on its way", () => {
    replace.mockImplementation(() => undefined)
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    act(() => visibilidad("hidden"))
    act(() => visibilidad("visible"))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("leaves no timer or listener behind when it unmounts", () => {
    const anadir = vi.spyOn(document, "addEventListener")
    const quitar = vi.spyOn(document, "removeEventListener")
    const { unmount } = render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(vi.getTimerCount()).toBe(0)
    expect(quitar.mock.calls.length).toBe(anadir.mock.calls.length)
    act(() => vi.advanceTimersByTime(12_000))
    expect(replace).toHaveBeenCalledTimes(1)
    anadir.mockRestore()
    quitar.mockRestore()
  })
})
