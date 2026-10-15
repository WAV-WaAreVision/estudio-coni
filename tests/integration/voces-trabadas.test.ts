import { afterAll, afterEach, describe, expect, it } from "vitest"
import { devolverVocesTrabadas } from "@/lib/mantenimiento/voces"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { leerFila, sembrarPieza } from "./siembra"

afterAll(() => pool.end())
const creadas: string[] = []
afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
})

const enMinutos = (minutos: number) => () => new Date(Date.now() + minutos * 60_000).toISOString()

describe("devolverVocesTrabadas", () => {
  it("hands back a voice nobody wrote for 15 minutes, with a reason and a new attempt", async () => {
    const id = await sembrarPieza("grabando_voz")
    creadas.push(id)
    const antes = await leerFila(id)

    expect(await devolverVocesTrabadas({ db: clienteDeServicio(), ahora: enMinutos(16) })).toEqual([id])
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: TEXTO_SIN_VOZ,
      intento: antes.intento + 1,
    })
  })

  it("leaves a voice that is still being recorded", async () => {
    const id = await sembrarPieza("grabando_voz")
    creadas.push(id)
    expect(await devolverVocesTrabadas({ db: clienteDeServicio(), ahora: enMinutos(5) })).toEqual([])
    expect((await leerFila(id)).estado).toBe("grabando_voz")
  })
})
