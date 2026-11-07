import { afterAll, afterEach, describe, expect, it } from "vitest"
import { notificadorConRegistro } from "@/lib/avisos/registrado"
import { cerrarPausas } from "@/lib/mantenimiento/pausas"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { ResultadoDeChequeo } from "@/lib/proveedores/chequeos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.avisos where clave like 'pausa:%'")
  await pool.query("delete from public.pausas_de_proveedor")
})

const db = clienteDeServicio()
const AHORA = "2026-11-07T15:00:00.000Z"

function deps(respuesta: ResultadoDeChequeo) {
  const canal = notificadorEnMemoria()
  const preguntas: string[] = []
  return {
    canal,
    preguntas,
    deps: {
      db,
      avisos: notificadorConRegistro({ db, canal, ahora: () => AHORA }),
      ahora: () => AHORA,
      chequear: async (pausa: { proveedor: string }) => {
        preguntas.push(pausa.proveedor)
        return respuesta
      },
    },
  }
}

async function abierta(proveedor: string) {
  const { rows } = await pool.query<{ pausa_id: string }>(
    "select pausa_id from public.abrir_pausa_de_proveedor($1, 'pago', 'x')",
    [proveedor],
  )
  return rows[0]?.pausa_id ?? ""
}

describe("cerrarPausas", () => {
  it("closes a pause on a good check and tells Coni once, keyed by the pause", async () => {
    const id = await abierta("elevenlabs")
    const { deps: d, canal } = deps({ ok: true })

    expect(await cerrarPausas(d)).toEqual({ cerradas: ["elevenlabs"], abiertas: [] })
    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [] })

    const { rows } = await pool.query(
      "select cerrada_en is not null as cerrada from public.pausas_de_proveedor where id = $1",
      [id],
    )
    expect(rows[0]).toEqual({ cerrada: true })
    expect(canal.aConiEnviados).toEqual([{ mensaje: "Ya puedes preparar tu voz de nuevo.", urgente: true }])
    expect(canal.avisosEnviados).toEqual([{ tipo: "pausa_cerrada", clave: `pausa:${id}` }])
  })

  it("leaves the pause open and writes nothing on a bad check", async () => {
    await abierta("heygen")
    const { deps: d, canal } = deps({ ok: false, motivo: "sin saldo" })

    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [{ proveedor: "heygen", motivo: "sin saldo" }] })
    const { rows } = await pool.query(
      "select count(*)::int as n from public.pausas_de_proveedor where cerrada_en is null",
    )
    expect(rows[0]?.n).toBe(1)
    expect(canal.aConiEnviados).toEqual([])
    const avisos = await pool.query("select count(*)::int as n from public.avisos where clave like 'pausa:%'")
    expect(avisos.rows[0]?.n).toBe(0)
  })

  it("closes a Voyage pause without telling Coni (A6)", async () => {
    await abierta("voyage")
    const { deps: d, canal } = deps({ ok: true })
    expect(await cerrarPausas(d)).toEqual({ cerradas: ["voyage"], abiertas: [] })
    expect(canal.aConiEnviados).toEqual([])
  })

  it("asks nothing when no pause is open", async () => {
    const { deps: d, preguntas } = deps({ ok: true })
    expect(await cerrarPausas(d)).toEqual({ cerradas: [], abiertas: [] })
    expect(preguntas).toEqual([])
  })
})
