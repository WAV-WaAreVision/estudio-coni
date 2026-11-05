import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  BORRADOR_YA_DECIDIDO,
  descartarBorrador,
  editarBorradorDePilar,
  editarBorradorDeRed,
  guardarBorradorDePilar,
  guardarBorradorDeRed,
} from "@/lib/acciones/borradores"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { listarPilaresDeTemas } from "@/lib/datos/biblioteca"
import { contarBorradores, leerBorrador, listarBorradores } from "@/lib/datos/borradores"
import { pilaresActivos } from "@/lib/datos/pilares"
import type { Red } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { limpiarBorradores } from "./limpiar-borradores"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
let coni: Db
let wav: Db

const pilar = (nombreCorto: string, red: Red = "linkedin") => ({
  red,
  nombre: `${nombreCorto}: un pilar de prueba`,
  nombreCorto,
  descripcion: "Una definición de prueba.",
  peso: 10,
})

async function guardado(nuevo: ReturnType<typeof pilar>): Promise<string> {
  const resultado = await guardarBorradorDePilar({ db: coni }, nuevo)
  if (!resultado.ok) throw new Error(resultado.error)
  return resultado.id
}

beforeAll(async () => {
  await limpiarBorradores()
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
})

afterAll(async () => {
  await limpiarBorradores()
  await pool.end()
})

describe("drafts from the app", () => {
  it("saves Coni's pillar draft, lists, counts and reads it, and no pillar reader sees it", async () => {
    const corto = `Borrador ${SUFIJO}`
    const id = await guardado(pilar(corto))
    expect(await contarBorradores(coni)).toBe(1)
    const { pilares, redes } = await listarBorradores(coni)
    const esperado = {
      id,
      red: "linkedin",
      nombre: `${corto}: un pilar de prueba`,
      nombreCorto: corto,
      descripcion: "Una definición de prueba.",
      peso: 10,
    }
    expect(pilares).toEqual([esperado])
    expect(redes).toEqual([])
    expect(await leerBorrador(coni, id)).toEqual({ tipo: "pilar", borrador: esperado })
    expect((await pilaresActivos(coni)).map((p) => p.nombreCorto)).not.toContain(corto)
    expect((await listarPilaresDeTemas(coni)).map((p) => p.nombreCorto)).not.toContain(corto)
    const { data, error } = await coni.rpc("temas_de_red", { p_red: "linkedin", p_pilar: id })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("saves and edits a network draft with empty notes, and counts both kinds", async () => {
    const guardada = await guardarBorradorDeRed(
      { db: coni },
      { nombre: `TikTok ${SUFIJO}`, manual: "", receta: "", conexion: "" },
    )
    if (!guardada.ok) throw new Error(guardada.error)
    expect(await contarBorradores(coni)).toBe(2)
    expect(
      await editarBorradorDeRed(
        { db: coni },
        { id: guardada.id, nombre: `TikTok ${SUFIJO}`, manual: "Videos cortos.", receta: "", conexion: "" },
      ),
    ).toEqual({ ok: true })
    expect(await leerBorrador(coni, guardada.id)).toEqual({
      tipo: "red",
      borrador: { id: guardada.id, nombre: `TikTok ${SUFIJO}`, manual: "Videos cortos.", receta: "", conexion: "" },
    })
    expect((await listarBorradores(coni)).redes.map((red) => red.id)).toEqual([guardada.id])
  })

  it("edits a pillar draft until it is discarded; then it can be neither edited nor discarded again", async () => {
    const id = await guardado(pilar(`Editable ${SUFIJO}`, "instagram"))
    const edicion = {
      id,
      nombre: `Editable ${SUFIJO}`,
      nombreCorto: `Editado ${SUFIJO}`,
      descripcion: "Otra.",
      peso: 12.5,
    }
    expect(await editarBorradorDePilar({ db: coni }, edicion)).toEqual({ ok: true })
    expect(await leerBorrador(coni, id)).toEqual({ tipo: "pilar", borrador: { ...edicion, red: "instagram" } })
    expect(await descartarBorrador({ db: coni }, { tipo: "pilar", id })).toEqual({ ok: true })
    expect(await leerBorrador(coni, id)).toBeNull()
    expect(await editarBorradorDePilar({ db: coni }, edicion)).toEqual({ ok: false, error: BORRADOR_YA_DECIDIDO })
    expect(await descartarBorrador({ db: coni }, { tipo: "pilar", id })).toEqual({
      ok: false,
      error: BORRADOR_YA_DECIDIDO,
    })
  })

  it("refuses WAV from the app before the database is asked", async () => {
    const id = await guardado(pilar(`De Coni ${SUFIJO}`))
    expect(await guardarBorradorDePilar({ db: wav }, pilar(`De WAV ${SUFIJO}`))).toEqual({
      ok: false,
      error: ERROR_SOLO_CONI,
    })
    expect(await guardarBorradorDeRed({ db: wav }, { nombre: "De WAV", manual: "", receta: "", conexion: "" })).toEqual(
      {
        ok: false,
        error: ERROR_SOLO_CONI,
      },
    )
    expect(await descartarBorrador({ db: wav }, { tipo: "pilar", id })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect((await leerBorrador(coni, id))?.tipo).toBe("pilar")
  })
})
