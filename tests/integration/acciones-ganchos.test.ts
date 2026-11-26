import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GANCHO_INEXISTENTE, marcarFavorito } from "@/lib/acciones/ganchos"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: Db
let wav: Db
let autora = ""
let material = ""
let idea = ""

const esFavorito = async (id: string) =>
  (await pool.query("select 1 from public.ganchos_favoritos where afirmacion_id = $1", [id])).rowCount === 1

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autora = await sembrarAutor(`Autora favoritos ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material favoritos ${SUFIJO}`, autorId: autora })
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, gancho)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', 'dato', 'estudio', '¿Y si fuera al revés?')
     returning id`,
    [material, autora],
  )
  idea = rows[0]?.id ?? ""
  if (!idea) throw new Error("No se creó la idea")
})

afterAll(async () => {
  await borrarSembrado([material], [], [autora])
  await pool.end()
})

describe("marcarFavorito", () => {
  it("marks and unmarks, and marking twice is not an error", async () => {
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: true })).toEqual({ ok: true })
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: true })).toEqual({ ok: true })
    expect(await esFavorito(idea)).toBe(true)
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: false })).toEqual({ ok: true })
    expect(await esFavorito(idea)).toBe(false)
  })

  it("refuses WAV's session", async () => {
    expect(await marcarFavorito({ db: wav }, { afirmacionId: idea, favorito: true })).toEqual({
      ok: false,
      error: SOLO_CONI,
    })
    expect(await esFavorito(idea)).toBe(false)
  })

  it("says the hook is gone when its claim no longer exists", async () => {
    expect(await marcarFavorito({ db: coni }, { afirmacionId: AUSENTE, favorito: true })).toEqual({
      ok: false,
      error: GANCHO_INEXISTENTE,
    })
  })
})
