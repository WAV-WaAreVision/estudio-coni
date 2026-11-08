// @vitest-environment node
import { describe, expect, it } from "vitest"
import { exigirPreviewSinProduccion } from "@/lib/entorno/preview"

const PRODUCCION = "https://mvfytttfxmzzjajecsch.supabase.co"
const STAGING = "https://omvvgywjyuoqjjfpbpsy.supabase.co"

describe("exigirPreviewSinProduccion (issue 7)", () => {
  it.each(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])(
    "refuses a Vercel preview whose %s is production's database",
    (variable) => {
      const entorno = {
        VERCEL_ENV: "preview",
        SUPABASE_URL: STAGING,
        NEXT_PUBLIC_SUPABASE_URL: STAGING,
        [variable]: PRODUCCION,
      }
      expect(() => exigirPreviewSinProduccion(entorno)).toThrow(
        `${variable} apunta a la base de producción en una vista previa de Vercel: usa la de staging.`,
      )
    },
  )

  it("lets a preview on staging through", () => {
    expect(() =>
      exigirPreviewSinProduccion({ VERCEL_ENV: "preview", SUPABASE_URL: STAGING, NEXT_PUBLIC_SUPABASE_URL: STAGING }),
    ).not.toThrow()
  })

  it.each([{ VERCEL_ENV: "production" }, {}])("leaves production and local builds alone (%o)", (base) => {
    expect(() =>
      exigirPreviewSinProduccion({ ...base, SUPABASE_URL: PRODUCCION, NEXT_PUBLIC_SUPABASE_URL: PRODUCCION }),
    ).not.toThrow()
  })
})
