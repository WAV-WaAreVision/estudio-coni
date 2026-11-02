import { describe, expect, it } from "vitest"
import { exigirEnv, FaltaVariableDeEntorno } from "@/lib/env"

describe("exigirEnv", () => {
  it("devuelve el valor cuando la variable existe", () => {
    expect(exigirEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321")
  })

  it("falla nombrando la variable cuando falta o está vacía", () => {
    expect(() => exigirEnv("NEXT_PUBLIC_SUPABASE_URL", undefined)).toThrow(
      "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL.",
    )
    expect(() => exigirEnv("NEXT_PUBLIC_SUPABASE_URL", "")).toThrow("NEXT_PUBLIC_SUPABASE_URL")
  })

  it("falla con un error que lleva solo el nombre de la variable, para reconocerlo sin leer el mensaje", () => {
    const fallo = (() => {
      try {
        exigirEnv("SUPABASE_SERVICE_ROLE_KEY", undefined)
      } catch (error) {
        return error
      }
    })()
    expect(fallo).toBeInstanceOf(FaltaVariableDeEntorno)
    expect(fallo).toBeInstanceOf(Error)
    expect(fallo).toMatchObject({ nombre: "SUPABASE_SERVICE_ROLE_KEY" })
  })
})
