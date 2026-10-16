import { describe, expect, it } from "vitest"
import { faltanDelVideo } from "@/lib/diseno/video"

describe("faltanDelVideo", () => {
  it("says what is left while it plays", () => {
    expect(faltanDelVideo({ duracion: 58, tiempo: 34, reproduciendo: true, visto: false })).toBe("faltan 0:24")
  })

  it("says nothing paused, once watched whole, or before the length is known", () => {
    expect(faltanDelVideo({ duracion: 58, tiempo: 34, reproduciendo: false, visto: false })).toBeNull()
    expect(faltanDelVideo({ duracion: 58, tiempo: 34, reproduciendo: true, visto: true })).toBeNull()
    expect(faltanDelVideo({ duracion: Number.NaN, tiempo: 0, reproduciendo: true, visto: false })).toBeNull()
  })

  it("never goes below zero", () => {
    expect(faltanDelVideo({ duracion: 58, tiempo: 60, reproduciendo: true, visto: false })).toBe("faltan 0:00")
  })
})
