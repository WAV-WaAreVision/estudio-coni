// tests/unit/refresco-automatico.test.tsx
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RefrescoAutomatico } from "@/components/refresco-automatico"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function visibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
  visibilidad("visible")
})
afterEach(() => vi.useRealTimers())

describe("RefrescoAutomatico", () => {
  it("refreshes every interval while active", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("does nothing while not active", () => {
    render(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("stops when it becomes inactive", () => {
    const { rerender } = render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    rerender(<RefrescoAutomatico activo={false} cadaMs={4000} />)
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("pauses while the tab is hidden and refreshes once when it comes back", () => {
    render(<RefrescoAutomatico activo cadaMs={4000} />)
    act(() => visibilidad("hidden"))
    act(() => vi.advanceTimersByTime(12_000))
    expect(refresh).not.toHaveBeenCalled()
    act(() => visibilidad("visible"))
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
