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

  it("refuses a LinkedIn override in production and where Trigger runs, not only on Vercel", () => {
    const porDefecto = "https://api.linkedin.com"
    expect(() =>
      baseDe(
        { LINKEDIN_API_BASE_URL: "http://127.0.0.1:1", NODE_ENV: "production" },
        "LINKEDIN_API_BASE_URL",
        porDefecto,
      ),
    ).toThrow(FallaDeConfiguracion)
    expect(() =>
      baseDe(
        { LINKEDIN_OAUTH_BASE_URL: "http://127.0.0.1:1", TRIGGER_SECRET_KEY: "tr_dev_x" },
        "LINKEDIN_OAUTH_BASE_URL",
        porDefecto,
      ),
    ).toThrow(FallaDeConfiguracion)
    expect(
      baseDe({ LINKEDIN_API_BASE_URL: "http://127.0.0.1:1", NODE_ENV: "test" }, "LINKEDIN_API_BASE_URL", porDefecto),
    ).toBe("http://127.0.0.1:1")
  })

  it("keeps allowing the other fake services under a production build, as the E2E runs them", () => {
    expect(
      baseDe(
        { HEYGEN_BASE_URL: "http://127.0.0.1:3201", NODE_ENV: "production" },
        "HEYGEN_BASE_URL",
        "https://api.heygen.com",
      ),
    ).toBe("http://127.0.0.1:3201")
  })

  it.each([
    "HEYGEN_BASE_URL",
    "ANTHROPIC_BASE_URL",
    "ELEVENLABS_BASE_URL",
    "PUSH_BASE_URL",
    "INSTAGRAM_OAUTH_BASE_URL",
    "INSTAGRAM_GRAPH_BASE_URL",
    "RESEND_BASE_URL",
  ])("refuses a %s override where Trigger runs the tasks: Coni's keys would travel there", (variable) => {
    expect(() =>
      baseDe({ [variable]: "http://127.0.0.1:1", TRIGGER_SECRET_KEY: "tr_prod_x" }, variable, "https://real.test"),
    ).toThrow(FallaDeConfiguracion)
  })

  it("names the place where the override was refused", () => {
    expect(() =>
      baseDe({ HEYGEN_BASE_URL: "http://127.0.0.1:1", TRIGGER_SECRET_KEY: "tr_prod_x" }, "HEYGEN_BASE_URL", "x"),
    ).toThrow("HEYGEN_BASE_URL no puede estar definida en Vercel ni en Trigger.dev")
  })

  it("uses the provider's own address where Trigger runs when nothing overrides it", () => {
    expect(baseDe({ TRIGGER_SECRET_KEY: "tr_prod_x" }, "HEYGEN_BASE_URL", "https://api.heygen.com")).toBe(
      "https://api.heygen.com",
    )
  })
})
