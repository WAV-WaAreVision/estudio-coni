import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { limiteDelMes, reservarGasto, reservarGastoFirmado } from "@/lib/datos/repositorio"
import { pool, sinLimiteFijado } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarPieza } from "./siembra"

const db = clienteDeServicio()
const AHORA = new Date().toISOString()
const piezas: string[] = []
let piezaId = ""

async function gastado(usd: number): Promise<void> {
  await pool.query(
    "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_reserva', date_trunc('month', now() at time zone 'America/Santiago')::date, $1, $1, 'confirmado', 'prueba-reserva-base')",
    [usd],
  )
}

const pedido = (clave: string) => ({
  piezaId,
  proveedor: "anthropic" as const,
  paso: "prueba_reserva",
  estimadoUsd: 0.5,
  clave,
  ahora: AHORA,
})

beforeAll(async () => {
  piezaId = await sembrarPieza("guion_por_aprobar")
  piezas.push(piezaId)
})
afterEach(() => pool.query("delete from public.gastos where paso = 'prueba_reserva'"))
afterAll(async () => {
  await borrarSembrado(piezas, [])
  await pool.end()
})

beforeEach(sinLimiteFijado)
afterEach(sinLimiteFijado)

describe("reservarGasto y el límite", () => {
  it("says the limit stopped new spend, with the month's figures", async () => {
    await gastado(79.8)
    expect(await reservarGasto(db, pedido("prueba-reserva-1"))).toEqual({
      limite: true,
      usadoUsd: 79.8,
      limiteUsd: 80,
    })
  })

  it("reserves signed work over the limit", async () => {
    await gastado(79.8)
    const gasto = await reservarGastoFirmado(db, pedido("prueba-reserva-2"))
    expect(gasto).toMatchObject({ clave: "prueba-reserva-2", estado: "reservado" })
  })

  it("reads this month's limit", async () => {
    expect(await limiteDelMes(db, AHORA)).toBe(80)
  })
})
