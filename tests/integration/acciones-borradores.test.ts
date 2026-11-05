import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  aprobarBorradorDePilar,
  BORRADOR_YA_DECIDIDO,
  descartarBorrador,
  ETAPA_INVALIDA,
  editarBorradorDePilar,
  editarBorradorDeRed,
  guardarBorradorDePilar,
  guardarBorradorDeRed,
  NOMBRE_EN_USO,
  PILAR_DE_OTRA_RED,
} from "@/lib/acciones/borradores"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { listarPilaresDeTemas } from "@/lib/datos/biblioteca"
import { contarBorradores, leerBorrador, listarBorradores } from "@/lib/datos/borradores"
import { etapasDeRed, pesosDeRed, pilaresActivos } from "@/lib/datos/pilares"
import { ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { diaLocal } from "@/lib/dominio/fechas"
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

const hoy = () => diaLocal(Date.now(), ZONA_DE_LA_BIBLIOTECA)

describe("approving a draft from the app", () => {
  it("makes it an active pillar every reader sees, accepts a total over 100 that pesosDeRed flags, and approves once", async () => {
    const corto = `Aprobado ${SUFIJO}`
    const id = await guardado(pilar(corto))
    const resultado = await aprobarBorradorDePilar({ db: coni }, { id, pesos: {} })
    expect(resultado).toEqual({ ok: true, pilarId: expect.stringMatching(/^[0-9a-f-]{36}$/), red: "linkedin" })
    expect((await pilaresActivos(coni)).find((p) => p.nombreCorto === corto)).toMatchObject({
      red: "linkedin",
      activa: true,
      esCapa: false,
      descripcion: "Una definición de prueba.",
    })
    expect((await listarPilaresDeTemas(coni)).map((p) => p.nombreCorto)).toContain(corto)
    const pesos = await pesosDeRed(coni, "linkedin", hoy())
    expect(pesos.pesos.find((p) => p.nombreCorto === corto)?.peso).toBe(10)
    expect(pesos.total).toBe(110)
    expect(pesos.sumaCien).toBe(false)
    expect(await leerBorrador(coni, id)).toBeNull()
    expect(await aprobarBorradorDePilar({ db: coni }, { id, pesos: {} })).toEqual({
      ok: false,
      error: BORRADOR_YA_DECIDIDO,
    })
  })

  it("gives the new pillar its weight in every stage of the network, whatever today's date is", async () => {
    const corto = `Etapas ${SUFIJO}`
    const id = await guardado(pilar(corto))
    const etapas = await etapasDeRed(coni, "linkedin", hoy())
    const pesos = Object.fromEntries(etapas.map((etapa) => [etapa.desde, { nuevo: 12 }]))
    expect((await aprobarBorradorDePilar({ db: coni }, { id, pesos })).ok).toBe(true)
    for (const etapa of await etapasDeRed(coni, "linkedin", hoy())) {
      expect(etapa.pesos.find((p) => p.nombreCorto === corto)?.peso, etapa.desde).toBe(12)
    }
  })

  it("says in her words a name already in use, a weight of the other network and a stage that is gone", async () => {
    const enUso = await guardado({ ...pilar(`Otro ${SUFIJO}`), nombre: "Pareja y conversación" })
    expect(await aprobarBorradorDePilar({ db: coni }, { id: enUso, pesos: {} })).toEqual({
      ok: false,
      error: NOMBRE_EN_USO,
    })
    const deLinkedin = await guardado(pilar(`Cruce ${SUFIJO}`))
    const deInstagram = (await pilaresActivos(coni)).find((p) => p.red === "instagram" && !p.esCapa)
    if (!deInstagram) throw new Error("No hay pilares de Instagram")
    expect(
      await aprobarBorradorDePilar({ db: coni }, { id: deLinkedin, pesos: { [hoy()]: { [deInstagram.id]: 30 } } }),
    ).toEqual({ ok: false, error: PILAR_DE_OTRA_RED })
    expect(
      await aprobarBorradorDePilar({ db: coni }, { id: deLinkedin, pesos: { "2020-01-01": { nuevo: 10 } } }),
    ).toEqual({ ok: false, error: ETAPA_INVALIDA })
  })

  it("refuses WAV before the database is asked", async () => {
    const id = await guardado(pilar(`Para WAV ${SUFIJO}`))
    expect(await aprobarBorradorDePilar({ db: wav }, { id, pesos: {} })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect((await leerBorrador(coni, id))?.tipo).toBe("pilar")
  })
})
