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
  replace.mockClear()
  window.history.replaceState(null, "", "/biblioteca?estado=procesando&m=abc#tabla")
  visibilidad("visible")
})
afterEach(() => vi.useRealTimers())

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
})
