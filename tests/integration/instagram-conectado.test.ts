import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { leerInstagramConectado } from "@/lib/datos/pantallas"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

afterAll(() => pool.end())

let coni: Awaited<ReturnType<typeof clienteDeConi>>
beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  await pool.query("update public.ajustes set meta_cuenta_id = null")
})

describe("leerInstagramConectado", () => {
  it("says Instagram is not connected while no account was saved, as Coni can see it", async () => {
    await pool.query("update public.ajustes set meta_cuenta_id = null")
    expect(await leerInstagramConectado(coni)).toBe(false)
  })

  it("says it is connected once the account is saved", async () => {
    await pool.query("update public.ajustes set meta_cuenta_id = '17841400000000001'")
    expect(await leerInstagramConectado(coni)).toBe(true)
  })
})
