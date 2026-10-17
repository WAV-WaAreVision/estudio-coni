import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRedibujar } from "@/components/use-redibujar"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

describe("useRedibujar", () => {
  it("keeps the view and the anchor she was at, and changes only the marker", () => {
    window.history.replaceState(null, "", "/calendario?vista=agenda&v=1#semana-del-19")
    const { result } = renderHook(() => useRedibujar())

    result.current()

    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/calendario\?vista=agenda&v=\d+#semana-del-19$/), {
      scroll: false,
    })
  })
})
