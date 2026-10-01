// @vitest-environment node
import { describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"

describe("baseDe", () => {
  it("uses the provider's own address when nothing overrides it", () => {
    expect(baseDe({}, "HEYGEN_BASE_URL", "https://api.heygen.com")).toBe("https://api.heygen.com")
  })

  it("uses the address of a fake service in local runs, without a trailing slash", () => {
    expect(baseDe({ HEYGEN_BASE_URL: "http://127.0.0.1:3201/" }, "HEYGEN_BASE_URL", "https://api.heygen.com")).toBe(
      "http://127.0.0.1:3201",
    )
  })

  it("refuses an override on Vercel: keys would travel to the wrong place", () => {
    expect(() =>
      baseDe({ HEYGEN_BASE_URL: "http://127.0.0.1:3201", VERCEL: "1" }, "HEYGEN_BASE_URL", "https://api.heygen.com"),
    ).toThrow(FallaDeConfiguracion)
  })

  it("ignores an empty value", () => {
    expect(baseDe({ HEYGEN_BASE_URL: "" }, "HEYGEN_BASE_URL", "https://api.heygen.com")).toBe("https://api.heygen.com")
  })
})
