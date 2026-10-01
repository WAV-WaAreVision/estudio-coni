// @vitest-environment node
import { createECDH, randomBytes } from "node:crypto"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { generateVAPIDKeys } from "web-push"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { servicioPushReal, servicioPushVapid } from "@/lib/proveedores/push"
import { servidor } from "../msw"

const vapid = generateVAPIDKeys()
const OPCIONES = { clavePublica: vapid.publicKey, clavePrivada: vapid.privateKey, asunto: "mailto:wav@estudio.test" }
const ENDPOINT = "https://push.example.test/send/abc123secret"

function suscripcion(endpoint = ENDPOINT) {
  const navegador = createECDH("prime256v1")
  navegador.generateKeys()
  return {
    endpoint,
    p256dh: navegador.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  }
}

const MENSAJE = { titulo: "Estudio de Coni", cuerpo: "Tienes un guion listo para revisar", url: "/guion/abc" }

interface Capturada {
  url: string
  cabeceras: Headers
  cuerpo: ArrayBuffer
}

function respondiendo(estado: number, endpoint = ENDPOINT): Capturada[] {
  const capturas: Capturada[] = []
  servidor.use(
    http.post(endpoint, async ({ request }) => {
      capturas.push({ url: request.url, cabeceras: request.headers, cuerpo: await request.arrayBuffer() })
      return new HttpResponse("", { status: estado })
    }),
  )
  return capturas
}

describe("servicioPushVapid", () => {
  // RFC 8030 (HTTP push), RFC 8291 (aes128gcm encryption) and RFC 8292 (VAPID): a POST to the endpoint with
  // `Authorization: vapid t=<jwt>, k=<public key>`, `Content-Encoding: aes128gcm`, `TTL`, and the encrypted payload.
  it("posts the message encrypted and signed with the VAPID keys", async () => {
    const capturas = respondiendo(201)
    const resultado = await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: false })
    expect(resultado).toEqual({ estado: "enviado" })
    expect(capturas).toHaveLength(1)
    const { cabeceras, cuerpo } = capturas[0] as Capturada
    expect(cabeceras.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/)
    expect(cabeceras.get("authorization")).toContain(`k=${vapid.publicKey}`)
    expect(cabeceras.get("content-encoding")).toBe("aes128gcm")
    expect(Number(cabeceras.get("ttl"))).toBeGreaterThan(0)
    expect(cuerpo.byteLength).toBeGreaterThan(80)
    expect(Buffer.from(cuerpo).toString("utf-8")).not.toContain("guion listo")
  })

  it("asks the push service to deliver at once only for an urgent notice", async () => {
    const normal = respondiendo(201)
    await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: false })
    expect(normal[0]?.cabeceras.get("urgency")).toBe("normal")
    const urgente = respondiendo(201)
    await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: true })
    expect(urgente[0]?.cabeceras.get("urgency")).toBe("high")
  })

  // RFC 8030 section 7.3: 404 and 410 mean the subscription is gone and must not be used again.
  it("reports a subscription the push service no longer knows as expired", async () => {
    for (const estado of [404, 410]) {
      respondiendo(estado)
      expect(await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({
        estado: "caducada",
      })
    }
  })

  it("reports any other answer as a failure that says the HTTP status and nothing about the device", async () => {
    respondiendo(503)
    const resultado = await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: false })
    expect(resultado.estado).toBe("fallo")
    if (resultado.estado !== "fallo") throw new Error("se esperaba un fallo")
    expect(resultado.detalle).toContain("503")
    expect(resultado.detalle).not.toContain("abc123secret")
  })

  it("reports a network error as a failure without the endpoint in it", async () => {
    servidor.use(http.post(ENDPOINT, () => HttpResponse.error()))
    const resultado = await servicioPushVapid(OPCIONES).enviar(suscripcion(), MENSAJE, { urgente: false })
    expect(resultado.estado).toBe("fallo")
    if (resultado.estado !== "fallo") throw new Error("se esperaba un fallo")
    expect(resultado.detalle).not.toContain("abc123secret")
  })

  it("refuses a message too big for a push before sending anything", async () => {
    const capturas = respondiendo(201)
    const grande = { ...MENSAJE, cuerpo: "x".repeat(5000) }
    await expect(servicioPushVapid(OPCIONES).enviar(suscripcion(), grande, { urgente: false })).rejects.toThrow(
      /demasiado grande/,
    )
    expect(capturas).toEqual([])
  })

  it("sends through the address of the override when there is one, keeping the path", async () => {
    const capturas = respondiendo(201, "http://127.0.0.1:3201/send/abc123secret")
    const servicio = servicioPushVapid({ ...OPCIONES, base: "http://127.0.0.1:3201" })
    expect(await servicio.enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({ estado: "enviado" })
    expect(capturas).toHaveLength(1)
  })
})

describe("servicioPushReal", () => {
  const ENTORNO = {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:wav@estudio.test",
  }

  it("reads the keys and the subject from the environment", async () => {
    const capturas = respondiendo(201)
    expect(await servicioPushReal(ENTORNO).enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({
      estado: "enviado",
    })
    expect(capturas[0]?.cabeceras.get("authorization")).toContain(`k=${vapid.publicKey}`)
  })

  it("names the missing variable", () => {
    expect(() => servicioPushReal({ ...ENTORNO, VAPID_PRIVATE_KEY: undefined })).toThrow(/VAPID_PRIVATE_KEY/)
  })

  it("refuses the address override on Vercel: the message would go to another place", () => {
    expect(() => servicioPushReal({ ...ENTORNO, PUSH_BASE_URL: "http://127.0.0.1:3201", VERCEL: "1" })).toThrow(
      FallaDeConfiguracion,
    )
  })

  it("rejects a subject that is neither a mailto nor an https address", () => {
    expect(() => servicioPushReal({ ...ENTORNO, VAPID_SUBJECT: "wav@estudio.test" })).toThrow(/VAPID_SUBJECT/)
  })
})
