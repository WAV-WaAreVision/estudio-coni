import { describe, expect, it } from "vitest"
import { dolares, mmss } from "@/lib/formato"

describe("mmss", () => {
  it("writes minutes and padded seconds", () => {
    expect(mmss(0)).toBe("0:00")
    expect(mmss(46)).toBe("0:46")
    expect(mmss(62.4)).toBe("1:02")
  })

  it("reads an unknown length as zero", () => {
    expect(mmss(Number.NaN)).toBe("0:00")
    expect(mmss(Number.POSITIVE_INFINITY)).toBe("0:00")
  })
})

describe("dolares", () => {
  it("uses a decimal comma", () => {
    expect(dolares(2.4)).toBe("US$ 2,40")
    expect(dolares(37)).toBe("US$ 37,00")
  })
})
