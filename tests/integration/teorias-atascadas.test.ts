import { afterAll, afterEach, describe, expect, it } from "vitest"
import { mantenimientoFrecuente } from "@/lib/mantenimiento/ejecutar"
import { MINUTOS_PARA_RESCATAR_TEORIA, rescatarTeoriasAtascadas } from "@/lib/mantenimiento/teorias"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const MINUTO = 60_000
const creadas: string[] = []

afterEach(async () => {
  await pool.query("delete from public.teorias where id = any($1)", [creadas.splice(0)])
})
afterAll(() => pool.end())

async function teoria(estado: string, titulo: string | null = null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.teorias (estado, titulo, tesis, motivo_fallo, motivo_codigo)
     values ($1, $2, $3, case when $1 = 'fallida' then 'x' end, case when $1 = 'fallida' then 'error' end) returning id`,
    [estado, titulo, titulo],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la teoría")
  creadas.push(id)
  return id
}

async function fila(id: string) {
  const { rows } = await pool.query<{ estado: string; motivo_fallo: string | null; motivo_codigo: string | null }>(
    "select estado, motivo_fallo, motivo_codigo from public.teorias where id = $1",
    [id],
  )
  return rows[0]
}

const dentroDe = (minutos: number) => () => new Date(Date.now() + minutos * MINUTO).toISOString()

describe("rescatarTeoriasAtascadas", () => {
  it("marks a theory still sintetizando past the limit as fallida, with a reason Coni can act on", async () => {
    const id = await teoria("sintetizando")

    const r = await rescatarTeoriasAtascadas({
      db: clienteDeServicio(),
      ahora: dentroDe(MINUTOS_PARA_RESCATAR_TEORIA + 1),
    })

    expect(r.rescatadas).toBeGreaterThanOrEqual(1)
    expect(await fila(id)).toEqual({
      estado: "fallida",
      motivo_fallo: "No alcancé a sintetizar la teoría. Reintenta.",
      motivo_codigo: "error",
    })
  })

  it("counts from when the synthesis started, so a retried old theory is not rescued under the task's feet", async () => {
    const id = await teoria("sintetizando")
    await pool.query("update public.teorias set creada_en = now() - interval '2 days' where id = $1", [id])

    await rescatarTeoriasAtascadas({
      db: clienteDeServicio(),
      ahora: dentroDe(MINUTOS_PARA_RESCATAR_TEORIA - 1),
    })

    expect((await fila(id))?.estado).toBe("sintetizando")
  })

  it("leaves alone a theory that is still within the limit", async () => {
    const id = await teoria("sintetizando")

    await rescatarTeoriasAtascadas({
      db: clienteDeServicio(),
      ahora: dentroDe(MINUTOS_PARA_RESCATAR_TEORIA - 1),
    })

    expect((await fila(id))?.estado).toBe("sintetizando")
  })

  it("never touches a theory that got its result, however old", async () => {
    const borrador = await teoria("borrador", "T")
    const guardada = await teoria("guardada", "T")

    await rescatarTeoriasAtascadas({ db: clienteDeServicio(), ahora: dentroDe(600) })

    expect((await fila(borrador))?.estado).toBe("borrador")
    expect((await fila(guardada))?.estado).toBe("guardada")
  })

  it("runs inside the ten-minute maintenance", async () => {
    const id = await teoria("sintetizando")

    const resultado = await mantenimientoFrecuente({
      db: clienteDeServicio(),
      avisos: notificadorEnMemoria(),
      ahora: dentroDe(MINUTOS_PARA_RESCATAR_TEORIA + 1),
      dispararGrabacion: async () => undefined,
      dispararProduccion: async () => undefined,
      temas: async () => null,
    })

    expect(resultado.teorias.rescatadas).toBeGreaterThanOrEqual(1)
    expect((await fila(id))?.estado).toBe("fallida")
  })
})
