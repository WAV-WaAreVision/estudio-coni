import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerCostosDelMotor, leerSemana } from "@/lib/datos/semana"
import { SIN_CORRIDA } from "@/lib/dominio/biblioteca/semana"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { vaciarMotor } from "./siembra"
import { borrarSembrado, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
const temas: string[] = []
const AUSENTE = "00000000-0000-4000-8000-000000000000"
let carga = ""
let pausas = ""
let solo = ""

interface CamposDeCorrida {
  estado?: "corriendo" | "lista" | "fallida"
  costo?: number
  resumen?: unknown
  motivo?: string | null
}

/** As postgres: only the service role writes runs from the app. */
async function corrida(semana: string, campos: CamposDeCorrida = {}): Promise<void> {
  await pool.query(
    "insert into public.motor_corridas (semana, estado, costo_usd, resumen, motivo_fallo) values ($1, $2, $3, $4::jsonb, $5)",
    [semana, campos.estado ?? "lista", campos.costo ?? 0, JSON.stringify(campos.resumen ?? {}), campos.motivo ?? null],
  )
}

interface CamposDeTeoria {
  titulo: string
  estado?: "guardada" | "descartada_por_motor" | "borrador"
  origen?: "motor" | "manual"
  puntaje?: number | null
  nivel?: "alto" | "medio" | "debil" | null
  motivo?: string | null
  temas?: string[]
}

/** Titles end with the file's suffix, so `limpiar` finds the manual ones too. */
async function teoria(semana: string, campos: CamposDeTeoria): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.teorias (titulo, tesis, origen, estado, semana, puntaje, nivel_evidencia, motivo_fallo, temas)
     values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9::uuid[]) returning id`,
    [
      `${campos.titulo} ${SUFIJO}`,
      `Tesis de ${campos.titulo}`,
      campos.origen ?? "motor",
      campos.estado ?? "guardada",
      semana,
      campos.puntaje ?? null,
      campos.nivel ?? null,
      campos.motivo ?? null,
      campos.temas ?? [],
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la teoría ${campos.titulo}`)
  return id
}

/** The engine's runs and theories, and the manual theories this file wrote (vaciarMotor leaves those). */
async function limpiar(): Promise<void> {
  await vaciarMotor()
  await pool.query("delete from public.teorias where titulo like $1", [`%${SUFIJO}`])
}

beforeAll(async () => {
  coni = await clienteDeConi()
  carga = await sembrarTema(`Carga ${SUFIJO}`)
  pausas = await sembrarTema(`Pausas ${SUFIJO}`)
  solo = await sembrarTema(`Solo ${SUFIJO}`)
  temas.push(carga, pausas, solo)
})

beforeEach(limpiar)

afterAll(async () => {
  await limpiar()
  await borrarSembrado([], temas, [])
  await pool.end()
})

describe("leerCostosDelMotor", () => {
  it("reads the cost of the latest four runs that cost something, newest first", async () => {
    await corrida("2026-10-04", { costo: 0.4 })
    await corrida("2026-10-11", { costo: 0.3 })
    await corrida("2026-10-18", { costo: 0, estado: "fallida", motivo: "x" })
    await corrida("2026-10-25", { costo: 0.25 })
    await corrida("2026-11-01", { costo: 0.2 })
    await corrida("2026-11-08", { costo: 0.21 })
    expect(await leerCostosDelMotor(coni)).toEqual([0.21, 0.2, 0.25, 0.3])
  })

  it("reads nothing before any run", async () => {
    expect(await leerCostosDelMotor(coni)).toEqual([])
  })
})

describe("leerSemana", () => {
  it("reads nothing before the first run", async () => {
    expect(await leerSemana(coni)).toEqual(SIN_CORRIDA)
  })

  it("reads only the latest run: its engine theories by score, its discarded crossings, live topics only", async () => {
    await corrida("2026-10-25", { costo: 0.2 })
    await teoria("2026-10-25", { titulo: "Vieja", temas: [carga] })
    await corrida("2026-11-01", { costo: 0.21, resumen: { ideas: 3, manual: true, queSubir: null } })
    await teoria("2026-11-01", { titulo: "Media", puntaje: 0.61, nivel: "medio", temas: [carga] })
    const alta = await teoria("2026-11-01", {
      titulo: "Alta",
      puntaje: 0.82,
      nivel: "alto",
      temas: [carga, AUSENTE, pausas],
    })
    await teoria("2026-11-01", { titulo: "Sin puntaje" })
    const cruce = await teoria("2026-11-01", {
      titulo: "Cruce",
      estado: "descartada_por_motor",
      motivo: "No hay ideas de dos autores distintos.",
      puntaje: 0.3,
      temas: [pausas, AUSENTE],
    })
    await teoria("2026-11-01", { titulo: "Manual", origen: "manual" })
    await teoria("2026-11-01", { titulo: "Borrador", estado: "borrador" })

    const leida = await leerSemana(coni)
    expect(leida.corrida).toEqual({
      semana: "2026-11-01",
      estado: "lista",
      costoUsd: 0.21,
      ideas: 3,
      manual: true,
      motivoFallo: null,
      creadaEn: expect.any(String),
    })
    expect(leida.teorias.map((t) => t.titulo)).toEqual([`Alta ${SUFIJO}`, `Media ${SUFIJO}`, `Sin puntaje ${SUFIJO}`])
    expect(leida.teorias[0]).toEqual({
      id: alta,
      titulo: `Alta ${SUFIJO}`,
      tesis: "Tesis de Alta",
      puntaje: 0.82,
      nivelEvidencia: "alto",
      temas: [
        { id: carga, nombre: `Carga ${SUFIJO}` },
        { id: pausas, nombre: `Pausas ${SUFIJO}` },
      ],
    })
    expect(leida.descartadas).toEqual([
      {
        id: cruce,
        razon: "No hay ideas de dos autores distintos.",
        temas: [{ id: pausas, nombre: `Pausas ${SUFIJO}` }],
      },
    ])
    expect(leida.queSubir).toBeNull()
  })

  it("reads what to upload: topics matched to their ids, pillars named with their network, retired ones dropped", async () => {
    await corrida("2026-11-08", {
      resumen: {
        ideas: 0,
        queSubir: {
          unSoloAutor: [`Solo ${SUFIJO}`, `Ausente ${SUFIJO}`],
          pilaresSinMaterial: [
            "psicologia-en-la-mesa",
            "pareja",
            "capa-tdah",
            "ia-salud-mental",
            "inteligencia-emocional",
          ],
        },
      },
    })
    expect((await leerSemana(coni)).queSubir).toEqual({
      unSoloAutor: [
        { nombre: `Solo ${SUFIJO}`, id: solo },
        { nombre: `Ausente ${SUFIJO}`, id: null },
      ],
      pilaresSinMaterial: [
        { slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" },
        { slug: "inteligencia-emocional", nombreCorto: "Inteligencia emocional", red: "instagram" },
      ],
    })
  })

  it("reads a failed run with its reason, and a summary of another shape as empty", async () => {
    await corrida("2026-11-08", {
      estado: "fallida",
      motivo: "No pude armar las ideas de esta semana.",
      resumen: { ideas: "tres", queSubir: "x" },
    })
    const { corrida: leida, queSubir } = await leerSemana(coni)
    expect(leida).toMatchObject({ estado: "fallida", motivoFallo: "No pude armar las ideas de esta semana.", ideas: 0 })
    expect(leida?.manual).toBe(false)
    expect(queSubir).toBeNull()
  })
})
