import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { recordarRed } from "@/lib/acciones/biblioteca"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { leerUltimaRed } from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { como, comoConi, comoMantenedor, fallaCon, pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

let coni: SupabaseClient<Database>
let wav: SupabaseClient<Database>

let antes: string | null = null

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  const { rows } = await pool.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
  antes = rows[0]?.ultima_red ?? null
})

afterAll(async () => {
  await pool.query("update public.ajustes set ultima_red = $1", [antes])
  await pool.end()
})

describe("ajustes.ultima_red", () => {
  it("is empty until a network is stored, and takes only LinkedIn or Instagram", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set ultima_red = null")
      const { rows } = await c.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
      expect(rows).toEqual([{ ultima_red: null }])
      const error = await fallaCon(c, "update public.ajustes set ultima_red = 'youtube'")
      expect(error.code).toBe("23514")
      expect(error.constraint).toBe("ultima_red_valida")
    })
  })

  it("is written by Coni through row level security; WAV's session changes no row", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.ajustes set ultima_red = 'instagram'")
      expect(rowCount).toBe(0)
    })
    await como(comoConi, async (c) => {
      const { rows } = await c.query("update public.ajustes set ultima_red = 'instagram' returning ultima_red")
      expect(rows).toEqual([{ ultima_red: "instagram" }])
    })
  })
})

describe("recordarRed and leerUltimaRed", () => {
  it("as Coni stores the network on screen and reads it back", async () => {
    expect(await recordarRed({ db: coni }, { red: "instagram" })).toEqual({ ok: true })
    expect(await leerUltimaRed(coni)).toBe("instagram")
    expect(await recordarRed({ db: coni }, { red: "linkedin" })).toEqual({ ok: true })
    expect(await leerUltimaRed(coni)).toBe("linkedin")
  })

  it("refuses WAV and leaves the stored network as it was", async () => {
    await pool.query("update public.ajustes set ultima_red = 'linkedin'")
    expect(await recordarRed({ db: wav }, { red: "instagram" })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect(await leerUltimaRed(coni)).toBe("linkedin")
  })

  it("reads nothing stored as null", async () => {
    await pool.query("update public.ajustes set ultima_red = null")
    expect(await leerUltimaRed(coni)).toBeNull()
  })
})
