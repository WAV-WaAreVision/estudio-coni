import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { leerBanco } from "@/lib/datos/banco"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { lineaDeFuente } from "@/lib/dominio/fuente"
import type { Database, Json } from "@/lib/supabase/database.types"
import { como, comoServicio, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { sembrarCorrida, sembrarIdea, sembrarIdeaDelMotor, vaciarMotor } from "./siembra"

type Db = SupabaseClient<Database>

const SEMANA = "2026-09-27"
const SEMANA_ANTERIOR = "2026-09-20"
const AHORA = Date.parse("2026-09-28T12:00:00Z")
const TEORIA = {
  titulo: "El deseo se esconde detrás del cansancio",
  tesis: "Quien dice estar cansada muchas veces protege su deseo.",
  nivel: "medio" as const,
  respaldo: [
    { autor: "Siembra Autora Uno", cita: "El cansancio es una forma de decir que no." },
    { autor: "Siembra Autora Dos", cita: "El deseo necesita seguridad para aparecer." },
  ],
}

let coni: Db

beforeAll(async () => {
  coni = await clienteDeConi()
})

afterEach(async () => {
  await vaciarMotor()
  await pool.query("delete from public.ideas")
})

afterAll(() => pool.end())

describe("leerBanco con el motor", () => {
  it("puts this week's engine ideas first and the rest as before", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdea({ gancho: "Una idea de siempre", numero: 1 })
    const nueva = await sembrarIdeaDelMotor({ gancho: "Nueva del motor", semana: SEMANA })

    const banco = await leerBanco(coni, AHORA)

    expect(banco.map((idea) => idea.gancho)).toEqual(["Nueva del motor", "Una idea de siempre"])
    expect(banco.find((idea) => idea.id === nueva)?.nueva).toBe(true)
    expect(banco.find((idea) => idea.gancho === "Una idea de siempre")?.nueva).toBe(false)
  })

  it("lists the used ideas by number and the ones of the engine, which have none, after them", async () => {
    await sembrarCorrida(SEMANA_ANTERIOR)
    await sembrarIdeaDelMotor({ gancho: "Usada del motor", semana: SEMANA_ANTERIOR, estado: "usada" })
    await sembrarIdea({ gancho: "Usada tres", numero: 3, estado: "usada" })
    await sembrarIdea({ gancho: "Usada dos", numero: 2, estado: "usada" })

    const banco = await leerBanco(coni, AHORA)

    expect(banco.map((idea) => idea.gancho)).toEqual(["Usada dos", "Usada tres", "Usada del motor"])
  })

  it("does not call new an engine idea from an older week", async () => {
    await sembrarCorrida(SEMANA_ANTERIOR)
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({ gancho: "Vieja del motor", semana: SEMANA_ANTERIOR })

    const [vieja] = await leerBanco(coni, AHORA)

    expect(vieja?.nueva).toBe(false)
  })

  it("does not call new an engine idea while the week's run is not ready", async () => {
    await sembrarCorrida(SEMANA, "corriendo")
    await sembrarIdeaDelMotor({ gancho: "A medias", semana: SEMANA })

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.nueva).toBe(false)
  })

  it("never lists archived or discarded ideas", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({ gancho: "Archivada", semana: SEMANA, estado: "archivada" })
    await sembrarIdeaDelMotor({ gancho: "Descartada", semana: SEMANA, estado: "descartada" })
    await sembrarIdeaDelMotor({ gancho: "Viva", semana: SEMANA })

    const banco = await leerBanco(coni, AHORA)

    expect(banco.map((idea) => idea.gancho)).toEqual(["Viva"])
  })

  it("brings the theory and the backing as author and quote", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({ gancho: "Con teoría", semana: SEMANA, teoria: TEORIA })

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.porQue?.titulo).toBe(TEORIA.titulo)
    expect(idea?.porQue?.tesis).toBe(TEORIA.tesis)
    expect(idea?.porQue?.nivel).toBe("medio")
    expect(idea?.porQue?.respaldo).toEqual(expect.arrayContaining(TEORIA.respaldo))
    expect(idea?.porQue?.respaldo).toHaveLength(2)
  })

  it("brings the weak backing alert as stored", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({
      gancho: "Débil",
      semana: SEMANA,
      alertas: [{ tipo: "respaldo", texto: "respaldo débil" }],
      teoria: { ...TEORIA, nivel: "debil" },
    })

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.alertas).toEqual([{ tipo: "respaldo", texto: "respaldo débil" }])
    expect(idea?.porQue?.nivel).toBe("debil")
  })

  it("brings the source line of the claims still in force", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({
      gancho: "Con fuente",
      semana: SEMANA,
      teoria: {
        ...TEORIA,
        respaldo: [
          {
            autor: "Siembra Stanford",
            cita: "La IA ya se usa para la salud mental.",
            titulo: "AI for Mental Health",
            anio: 2026,
          },
          { autor: "Siembra Excluida", cita: "Una afirmación que ya no vale." },
        ],
      },
    })
    await pool.query("update public.afirmaciones set excluida = true where cita = 'Una afirmación que ya no vale.'")

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.porQue?.fuente).toBe("Fuente: Siembra Stanford · AI for Mental Health (2026)")
    expect(idea?.porQue?.respaldo.map((r) => r.autor)).toEqual(["Siembra Stanford"])
  })

  it("names the same sources as the backing the script is written from, past its cap and evidence first", async () => {
    await sembrarCorrida(SEMANA)
    const opiniones = Array.from({ length: 12 }, (_, i) => ({
      autor: `Siembra Opinión ${i}`,
      cita: `Opinión ${i}`,
      titulo: `Columna ${i}`,
    }))
    const estudios = ["A", "B"].map((letra) => ({
      autor: `Siembra Estudio ${letra}`,
      cita: `Estudio ${letra}`,
      titulo: `Paper ${letra}`,
      evidencia: "estudio" as const,
    }))
    const id = await sembrarIdeaDelMotor({
      gancho: "Muchas fuentes",
      semana: SEMANA,
      teoria: { ...TEORIA, respaldo: [...opiniones, ...estudios] },
    })
    const respaldo = await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ r: Json }>("select public.respaldo_de_idea($1, 12) as r", [id])
      return leerRespaldo(rows[0]?.r)
    })

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.porQue?.fuente).toMatch(/ y 10 más$/)
    expect(idea?.porQue?.fuente).toBe(lineaDeFuente(respaldo?.afirmaciones ?? []))
  })

  it("has no theory for an idea that did not come from the engine", async () => {
    await sembrarIdea({ gancho: "Mía" })

    const [idea] = await leerBanco(coni, AHORA)

    expect(idea?.porQue).toBeNull()
  })
})

describe("Inicio con el motor", () => {
  it("offers only ideas still in the bank", async () => {
    await sembrarCorrida(SEMANA)
    await sembrarIdeaDelMotor({ gancho: "Archivada", semana: SEMANA, estado: "archivada" })
    await sembrarIdeaDelMotor({ gancho: "Descartada", semana: SEMANA, estado: "descartada" })
    await sembrarIdeaDelMotor({ gancho: "Viva", semana: SEMANA })

    const { banco } = await leerDatosDeInicio(coni, AHORA)

    expect(banco.map((idea) => idea.gancho)).toEqual(["Viva"])
  })
})
