import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useRedibujar } from "@/components/use-redibujar"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

beforeEach(() => {
  vi.useFakeTimers()
  replace.mockReset()
})
afterEach(() => vi.useRealTimers())

/** What the router would do with a replace that commits: the address shows the new marker. */
function comprometer(url: unknown) {
  window.history.replaceState(null, "", String(url))
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
    window.history.replaceState(null, "", "/biblioteca?m=abc")
    replace.mockImplementation(comprometer)
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(5000)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  // In the production build an action's own revalidated tree could commit after the redraw and put back the address
  // (and the screen) from before it.
  it("redraws again when the screen falls back to the address it left, a few times at most", () => {
    window.history.replaceState(null, "", "/biblioteca?m=abc")
    const { result } = renderHook(() => useRedibujar())

    result.current()
    vi.advanceTimersByTime(10_000)

    expect(replace.mock.calls.length).toBeGreaterThan(1)
    expect(replace.mock.calls.length).toBeLessThanOrEqual(4)
    for (const [url] of replace.mock.calls) expect(url).toMatch(/^\/biblioteca\?m=abc&v=\d+$/)
  })

  it("does not take her back when she went somewhere else meanwhile", () => {
    window.history.replaceState(null, "", "/biblioteca?m=abc")
    const { result } = renderHook(() => useRedibujar())

    result.current()
    window.history.replaceState(null, "", "/biblioteca?m=otro")
    vi.advanceTimersByTime(10_000)

    expect(replace).toHaveBeenCalledTimes(1)
  })
})
