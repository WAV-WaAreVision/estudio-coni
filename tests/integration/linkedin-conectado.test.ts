import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { leerLinkedinConectado } from "@/lib/datos/pantallas"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

afterAll(() => pool.end())

let coni: Awaited<ReturnType<typeof clienteDeConi>>
beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

const AHORA = Date.parse("2031-01-01T12:00:00Z")

describe("leerLinkedinConectado", () => {
  it("says LinkedIn is not connected until Coni connects it, as she can see it", async () => {
    expect(await leerLinkedinConectado(coni, AHORA)).toBe(false)
  })

  it("says it is connected while the token lasts and not once it expired", async () => {
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = '2031-03-01T00:00:00Z'",
    )
    expect(await leerLinkedinConectado(coni, AHORA)).toBe(true)
    expect(await leerLinkedinConectado(coni, Date.parse("2031-03-02T00:00:00Z"))).toBe(false)
  })
})
