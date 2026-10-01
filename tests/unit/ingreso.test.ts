import { AuthError } from "@supabase/supabase-js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { correoDeConi, enmascararCorreo, pedirCodigo, verificarCodigo } from "@/lib/acciones/ingreso"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

const CORREO = "coni@delrosario.cl"

function authFalso(respuestas: { otp?: { error: AuthError | null }; verificar?: { error: AuthError | null } }) {
  return {
    signInWithOtp: vi.fn(async () => respuestas.otp ?? { data: {}, error: null }),
    verifyOtp: vi.fn(async () => respuestas.verificar ?? { data: {}, error: null }),
  }
}

describe("enmascararCorreo", () => {
  it("keeps the first letter and the domain", () => {
    expect(enmascararCorreo("coni@delrosario.cl")).toBe("c•••@delrosario.cl")
  })
})

describe("correoDeConi", () => {
  it("reads CORREO_CONI first and AVISOS_CORREO_CONI after it", () => {
    expect(correoDeConi({ CORREO_CONI: "a@b.cl", AVISOS_CORREO_CONI: "c@d.cl" })).toBe("a@b.cl")
    expect(correoDeConi({ AVISOS_CORREO_CONI: "c@d.cl" })).toBe("c@d.cl")
  })

  it("is a configuration failure for WAV when neither is set", () => {
    expect(() => correoDeConi({})).toThrow(FallaDeConfiguracion)
  })
})

describe("pedirCodigo", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("asks only for Coni's address and never creates a user", async () => {
    const auth = authFalso({})

    const resultado = await pedirCodigo({ auth, correoConi: CORREO })

    expect(resultado).toEqual({ ok: true })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: CORREO, options: { shouldCreateUser: false } })
  })

  it("tells Coni how long to wait when emails are being sent too fast", async () => {
    const auth = authFalso({
      otp: {
        error: new AuthError(
          "For security purposes, you can only request this after 45 seconds.",
          429,
          "over_email_send_rate_limit",
        ),
      },
    })

    const resultado = await pedirCodigo({ auth, correoConi: CORREO })

    expect(resultado).toEqual({ ok: false, error: "Espera 45 segundos para pedir otro código." })
  })

  it("asks to wait a moment when the limit gives no seconds", async () => {
    const auth = authFalso({ otp: { error: new AuthError("rate limit", 429, "over_email_send_rate_limit") } })

    const resultado = await pedirCodigo({ auth, correoConi: CORREO })

    expect(resultado).toEqual({ ok: false, error: "Espera un momento para pedir otro código." })
  })

  it("shows a generic message and logs anything unexpected", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const auth = authFalso({ otp: { error: new AuthError("smtp caído", 500, "unexpected_failure") } })

    const resultado = await pedirCodigo({ auth, correoConi: CORREO })

    expect(resultado).toEqual({ ok: false, error: "No pude mandar el código. Inténtalo de nuevo en un rato." })
    expect(registro).toHaveBeenCalled()
  })
})

describe("verificarCodigo", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("verifies the email code of Coni's address", async () => {
    const auth = authFalso({})

    const resultado = await verificarCodigo({ auth, correoConi: CORREO }, "123456")

    expect(resultado).toEqual({ ok: true })
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: CORREO, token: "123456", type: "email" })
  })

  it("does not call the server with something that is not six digits", async () => {
    const auth = authFalso({})

    const resultado = await verificarCodigo({ auth, correoConi: CORREO }, "12 34")

    expect(resultado).toEqual({ ok: false, error: "El código tiene seis números." })
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it("explains an expired or wrong code", async () => {
    const auth = authFalso({
      verificar: { error: new AuthError("Token has expired or is invalid", 403, "otp_expired") },
    })

    const resultado = await verificarCodigo({ auth, correoConi: CORREO }, "123456")

    expect(resultado).toEqual({ ok: false, error: "Ese código no sirve o ya venció. Pide otro." })
  })

  it("asks to wait after too many attempts", async () => {
    const auth = authFalso({ verificar: { error: new AuthError("too many", 429, "over_request_rate_limit") } })

    const resultado = await verificarCodigo({ auth, correoConi: CORREO }, "123456")

    expect(resultado).toEqual({ ok: false, error: "Demasiados intentos. Espera un momento y pide otro código." })
  })
})
