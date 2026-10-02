import { describe, expect, test } from "vitest"
import config from "@/next.config"

describe("redirect from the old domain", () => {
  test("sends every path on estudio-coni.vercel.app to conidolly.vercel.app, permanently", async () => {
    const reglas = (await config.redirects?.()) ?? []
    expect(reglas).toContainEqual({
      source: "/:ruta*",
      has: [{ type: "host", value: "estudio-coni.vercel.app" }],
      destination: "https://conidolly.vercel.app/:ruta*",
      permanent: true,
    })
  })
})
