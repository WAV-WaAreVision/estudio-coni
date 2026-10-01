// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { avisosReales, canalReal, notificadorEnMemoria, notificadorResend } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"

const AVISO = { tipo: "publicado", clave: "publicado:p1:0" } as const
const CLAVE = "re_clave_secreta_de_prueba"
const OPCIONES = {
  clave: CLAVE,
  remitente: "Estudio Coni <avisos@estudio.test>",
  correoConi: "coni@estudio.test",
  correoWav: "wav@estudio.test",
}

interface Capturada {
  cabeceras: Headers
  cuerpo: Record<string, unknown>
}

function capturando(respuesta: () => Response): { capturas: Capturada[] } {
  const capturas: Capturada[] = []
  servidor.use(
    http.post("https://api.resend.com/emails", async ({ request }) => {
      capturas.push({ cabeceras: request.headers, cuerpo: (await request.json()) as Record<string, unknown> })
      return respuesta()
    }),
  )
  return { capturas }
}

async function rechazo(promesa: Promise<unknown>): Promise<Error> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error("Se esperaba un rechazo")
}

function esReintentable(error: Error): boolean {
  return !(error instanceof FallaDeConfiguracion) && !(error instanceof Falla)
}

describe("notificadorResend", () => {
  // https://resend.com/docs/api-reference/emails/send-email : POST https://api.resend.com/emails, Bearer key,
  // `from`, `to`, `subject` and `text`; answers `{ "id": "..." }`.
  it("sends Coni's notice to her address with the key as a bearer token", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "49a3999c" }))
    expect(await notificadorResend(OPCIONES).aConi("Tu reel ya está publicado.", false, AVISO)).toBe("correo")
    expect(capturas).toHaveLength(1)
    expect(capturas[0]?.cabeceras.get("authorization")).toBe(`Bearer ${CLAVE}`)
    expect(capturas[0]?.cuerpo).toMatchObject({
      from: OPCIONES.remitente,
      to: [OPCIONES.correoConi],
      text: "Tu reel ya está publicado.",
    })
  })

  it("marks an urgent notice in the subject so it is told apart from the rest", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1" }))
    const avisos = notificadorResend(OPCIONES)
    await avisos.aConi("Algo falló.", true, AVISO)
    await avisos.aConi("Todo bien.", false, AVISO)
    const asuntos = capturas.map((c) => String(c.cuerpo.subject))
    expect(asuntos[0]).not.toBe(asuntos[1])
    expect(asuntos[0]).toContain("importante")
    expect(asuntos.join(" ")).not.toContain("—")
  })

  it("sends the daily summary to her address under its own subject", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1" }))
    const canal = await notificadorResend(OPCIONES).resumenAConi({
      cuerpoPush: "Tienes 2 cosas nuevas",
      texto: "Tienes un guion listo.\nTienes un video listo.",
    })
    expect(canal).toBe("correo")
    expect(capturas[0]?.cuerpo).toMatchObject({
      to: [OPCIONES.correoConi],
      subject: "Resumen de tu estudio",
      text: "Tienes un guion listo.\nTienes un video listo.",
    })
  })

  it("sends WAV's alert to WAV's address with the subject and the technical detail", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1" }))
    await notificadorResend(OPCIONES).aWav("Falló grabar-pieza", "pieza p1: HeyGen respondió HTTP 500")
    expect(capturas[0]?.cuerpo).toMatchObject({
      from: OPCIONES.remitente,
      to: [OPCIONES.correoWav],
      subject: "Falló grabar-pieza",
      text: "pieza p1: HeyGen respondió HTTP 500",
    })
  })

  it.each([400, 401, 403, 422])("treats HTTP %i as a configuration problem for WAV", async (estado) => {
    capturando(() =>
      HttpResponse.json({ name: "validation_error", message: "domain not verified" }, { status: estado }),
    )
    const error = await rechazo(notificadorResend(OPCIONES).aWav("a", "b"))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toContain("domain not verified")
  })

  it.each([409, 429, 500, 503])("treats HTTP %i as a plain error that is retried", async (estado) => {
    capturando(() => HttpResponse.json({ name: "rate_limit_exceeded", message: "slow down" }, { status: estado }))
    const error = await rechazo(notificadorResend(OPCIONES).aConi("a", true, AVISO))
    expect(esReintentable(error)).toBe(true)
  })

  it("treats a dropped connection as a plain error that is retried", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(notificadorResend(OPCIONES).aConi("a", true, AVISO))
    expect(esReintentable(error)).toBe(true)
  })

  it("never puts the key in an error message", async () => {
    capturando(() => new HttpResponse(`bad key ${CLAVE}`, { status: 401 }))
    const error = await rechazo(notificadorResend(OPCIONES).aWav("a", "b"))
    expect(error.message).not.toContain(CLAVE)
  })
})

describe("notificadorEnMemoria", () => {
  it("remembers what was sent to each side", async () => {
    const avisos = notificadorEnMemoria()
    await avisos.aConi("hola", true, AVISO)
    await avisos.resumenAConi({ cuerpoPush: "corto", texto: "largo" })
    await avisos.aWav("asunto", "detalle")
    expect(avisos.aConiEnviados).toEqual([{ mensaje: "hola", urgente: true }])
    expect(avisos.avisosEnviados).toEqual([AVISO])
    expect(avisos.resumenesEnviados).toEqual([{ cuerpoPush: "corto", texto: "largo" }])
    expect(avisos.aWavEnviados).toEqual([{ asunto: "asunto", detalle: "detalle" }])
  })
})

describe("canalReal y avisosReales", () => {
  const CORREO = {
    RESEND_API_KEY: CLAVE,
    AVISOS_REMITENTE: OPCIONES.remitente,
    AVISOS_CORREO_CONI: OPCIONES.correoConi,
    AVISOS_CORREO_WAV: OPCIONES.correoWav,
  }

  it("sends everything by email while push is not set up (no VAPID variable at all)", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1" }))
    expect(await canalReal(CORREO).aConi("hola", false, AVISO)).toBe("correo")
    expect(capturas).toHaveLength(1)
  })

  it("fails loudly when push is half set up instead of quietly dropping it", () => {
    expect(() => canalReal({ ...CORREO, VAPID_SUBJECT: "mailto:wav@estudio.test" })).toThrow(/SUPABASE_URL/)
  })

  it("needs the database to store notices, and says which variable is missing", () => {
    expect(() => avisosReales(CORREO)).toThrow(/SUPABASE_URL/)
  })
})
