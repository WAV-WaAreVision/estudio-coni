import { http, passthrough } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { abrirPuente } from "@/lib/sesion/puente"
import { servidor } from "../msw"
import { clienteDeServicio } from "./servicio"
import { clienteAnonimoDePrueba } from "./sesion-coni"

const CORREO_DE_CONI = "coni@estudio.test"
// The local mail catcher of the stack (supabase/config.toml); never a real mailbox.
const BUZON = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424"

beforeEach(() => {
  // MSW refuses unknown hosts in tests: the local mail catcher is let through like the local Supabase.
  servidor.use(http.all(`${BUZON}/*`, () => passthrough()))
})

async function correosPara(correo: string): Promise<number> {
  const respuesta = await fetch(`${BUZON}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)
  if (!respuesta.ok) throw new Error(`No pude leer el buzón local: ${respuesta.status}`)
  return z.object({ messages_count: z.number() }).parse(await respuesta.json()).messages_count
}

async function tokenDelPuente(): Promise<string> {
  const puente = await abrirPuente({
    admin: clienteDeServicio().auth.admin,
    correo: CORREO_DE_CONI,
    urlDeIngesta: "http://localhost:3300",
    entorno: "test",
  })
  if (puente.tipo !== "formulario") throw new Error("El puente falló contra el Supabase local")
  const token = /name="token_hash" value="([^"]+)"/.exec(puente.html)?.[1]
  if (!token) throw new Error("La página del puente no trae el token")
  return token
}

describe("the Biblioteca bridge against the local Supabase (B11)", () => {
  it("mints Coni's token without sending her an email", async () => {
    const antes = await correosPara(CORREO_DE_CONI)

    await tokenDelPuente()
    // Give the mail catcher the time a real send would take to land.
    await new Promise((resolver) => setTimeout(resolver, 1500))

    expect(await correosPara(CORREO_DE_CONI)).toBe(antes)
  })

  it("opens Coni's session once with verifyOtp type email, and refuses the same token again", async () => {
    const token = await tokenDelPuente()

    const primera = await clienteAnonimoDePrueba().auth.verifyOtp({ token_hash: token, type: "email" })
    expect(primera.error).toBeNull()
    expect(primera.data.user?.email).toBe(CORREO_DE_CONI)

    const segunda = await clienteAnonimoDePrueba().auth.verifyOtp({ token_hash: token, type: "email" })
    expect(segunda.error?.status).toBe(403)
    expect(segunda.error?.code).toBe("otp_expired")
  })
})
