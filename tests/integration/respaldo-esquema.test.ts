import { afterAll, afterEach, describe, expect, it } from "vitest"
import { cargarRespaldoDeIdea, leerRespaldo, respaldoAJson } from "@/lib/datos/respaldo"
import { MAXIMO_AFIRMACIONES_DE_RESPALDO } from "@/lib/dominio/respaldo"
import { como, comoConi, fallaCon, pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { sembrarIdea, sembrarIdeaDelMotor, vaciarMotor } from "./siembra"

afterAll(() => pool.end())
afterEach(() => vaciarMotor())

const TEORIA = {
  titulo: "El deseo se cuida",
  tesis: "El deseo baja con la rutina.",
  nivel: "medio" as const,
  respaldo: [
    { autor: "Siembra Ana Pérez", cita: "Novelty is the fuel of desire in long relationships" },
    { autor: "Siembra Luis Soto", cita: "la rutina apaga lo que no se nombra en la pareja" },
  ],
}

describe("respaldo_de_idea", () => {
  it("returns the theory and its claims, sorted by id, with author and whether they are Coni's", async () => {
    const idea = await sembrarIdeaDelMotor({ gancho: "g", semana: "2026-09-27", teoria: TEORIA })
    const respaldo = await cargarRespaldoDeIdea(clienteDeServicio(), idea)
    expect(respaldo?.teoria).toMatchObject({ titulo: TEORIA.titulo, tesis: TEORIA.tesis, porQue: "" })
    expect(respaldo?.afirmaciones.map((a) => [a.autor, a.cita, a.deConi, a.aporte])).toEqual(
      expect.arrayContaining([
        ["Siembra Ana Pérez", TEORIA.respaldo[0]?.cita, false, "aporta"],
        ["Siembra Luis Soto", TEORIA.respaldo[1]?.cita, false, "aporta"],
      ]),
    )
    const ids = respaldo?.afirmaciones.map((a) => a.id) ?? []
    expect(ids).toEqual([...ids].sort())
  })

  it("leaves out excluded claims", async () => {
    const idea = await sembrarIdeaDelMotor({ gancho: "g", semana: "2026-09-27", teoria: TEORIA })
    await pool.query("update public.afirmaciones set excluida = true where cita = $1", [TEORIA.respaldo[0]?.cita])
    const respaldo = await cargarRespaldoDeIdea(clienteDeServicio(), idea)
    expect(respaldo?.afirmaciones.map((a) => a.autor)).toEqual(["Siembra Luis Soto"])
  })

  it(`keeps at most ${MAXIMO_AFIRMACIONES_DE_RESPALDO} claims`, async () => {
    const muchas = Array.from({ length: 15 }, (_, i) => ({ autor: `Siembra Autor ${i}`, cita: `cita número ${i}` }))
    const idea = await sembrarIdeaDelMotor({
      gancho: "g",
      semana: "2026-09-27",
      teoria: { ...TEORIA, respaldo: muchas },
    })
    const respaldo = await cargarRespaldoDeIdea(clienteDeServicio(), idea)
    expect(respaldo?.afirmaciones).toHaveLength(MAXIMO_AFIRMACIONES_DE_RESPALDO)
  })

  it("cuts a very long quote to 500 characters", async () => {
    const larga = "palabra ".repeat(200)
    const idea = await sembrarIdeaDelMotor({
      gancho: "g",
      semana: "2026-09-27",
      teoria: { ...TEORIA, respaldo: [{ autor: "Siembra Ana Pérez", cita: larga }] },
    })
    const respaldo = await cargarRespaldoDeIdea(clienteDeServicio(), idea)
    expect(respaldo?.afirmaciones[0]?.cita).toHaveLength(500)
  })

  it("is null for an idea that is not from the engine, and for an engine idea without theory", async () => {
    const propia = await sembrarIdea()
    expect(await cargarRespaldoDeIdea(clienteDeServicio(), propia)).toBeNull()
    const sinTeoria = await sembrarIdeaDelMotor({ gancho: "g", semana: "2026-09-27" })
    expect(await cargarRespaldoDeIdea(clienteDeServicio(), sinTeoria)).toBeNull()
    await pool.query("delete from public.ideas where id = $1", [propia])
  })

  it("is for the service role only", async () => {
    const idea = await sembrarIdeaDelMotor({ gancho: "g", semana: "2026-09-27", teoria: TEORIA })
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.respaldo_de_idea($1, 12)", [idea])
      expect(error.code).toBe("42501")
    })
  })
})

describe("leerRespaldo", () => {
  it("reads null as no backing and round-trips what respaldoAJson writes", () => {
    expect(leerRespaldo(null)).toBeNull()
    const respaldo = { teoria: { id: "t", titulo: "T", tesis: "Te", porQue: "P" }, afirmaciones: [] }
    expect(leerRespaldo(respaldoAJson(respaldo))).toEqual(respaldo)
  })

  it("reads undefined as no backing", () => {
    expect(leerRespaldo(undefined)).toBeNull()
  })

  it("throws a plain error on a malformed column: a bug to fix, not something to show Coni", () => {
    expect(() => leerRespaldo({ teoria: "x" })).toThrow("El respaldo guardado de la pieza no tiene el formato esperado")
  })
})
