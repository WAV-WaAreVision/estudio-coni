import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { cambiarPilaresDeTema } from "@/lib/acciones/biblioteca"
import { leerPilaresDeTema } from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarTema } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const AUSENTE = "00000000-0000-4000-8000-000000000000"
let coni: Db
let wav: Db
let tema = ""

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  tema = await sembrarTema(`Pilares de la acción ${SUFIJO}`)
})

afterAll(async () => {
  await borrarSembrado([], [tema], [])
  await pool.end()
})

describe("cambiarPilaresDeTema", () => {
  it("as Coni replaces the topic's pillars with hers", async () => {
    const resultado = await cambiarPilaresDeTema(
      { db: coni },
      {
        temaId: tema,
        filas: [
          { pilar: "psicologia-en-la-mesa", fuerza: "alta" },
          { pilar: "mujeres-lideres", fuerza: "media" },
          { pilar: "capa-tdah", fuerza: null },
        ],
      },
    )
    expect(resultado).toEqual({ ok: true })
    const pilares = await leerPilaresDeTema(coni, tema)
    expect(pilares.linkedin.principal?.slug).toBe("psicologia-en-la-mesa")
    expect(pilares.linkedin.secundarios.map((p) => p.slug)).toEqual(["mujeres-lideres"])
    expect(pilares.instagram.capa?.slug).toBe("capa-tdah")
    const { rows } = await pool.query<{ origen: string }>(
      "select distinct origen from public.tema_pilares where tema_id = $1",
      [tema],
    )
    expect(rows).toEqual([{ origen: "coni" }])
  })

  it.each([
    [
      "two pillars in one network",
      [
        { pilar: "psicologia-en-la-mesa", fuerza: "alta" as const },
        { pilar: "mujeres-lideres", fuerza: "alta" as const },
      ],
      "Elige un solo pilar por red, y «También toca» solo en una red con pilar.",
    ],
    [
      "a secondary in a network without a pillar",
      [{ pilar: "mi-nueva-partida", fuerza: "media" as const }],
      "Elige un solo pilar por red, y «También toca» solo en una red con pilar.",
    ],
    [
      "a pillar that is no longer there",
      [{ pilar: "caso-coni", fuerza: "alta" as const }],
      "Uno de esos pilares ya no está. Recarga la página y elige de nuevo.",
    ],
  ])("says it in her words when she picks %s, and keeps what was there", async (_caso, filas, error) => {
    expect(await cambiarPilaresDeTema({ db: coni }, { temaId: tema, filas })).toEqual({ ok: false, error })
    expect((await leerPilaresDeTema(coni, tema)).linkedin.principal?.slug).toBe("psicologia-en-la-mesa")
  })

  it("says the topic is gone when it is", async () => {
    expect(await cambiarPilaresDeTema({ db: coni }, { temaId: AUSENTE, filas: [] })).toEqual({
      ok: false,
      error: "Ese tema ya no existe.",
    })
  })

  it("refuses WAV from the app before the database is asked", async () => {
    expect(await cambiarPilaresDeTema({ db: wav }, { temaId: tema, filas: [] })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect((await leerPilaresDeTema(coni, tema)).linkedin.principal?.slug).toBe("psicologia-en-la-mesa")
  })
})
