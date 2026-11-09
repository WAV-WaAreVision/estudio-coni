import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { aplicarModeloDeHuellas } from "@/lib/modelo/aplicar"
import { type DepsModelo, probarModeloDeHuellas } from "@/lib/modelo/probar"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool, sinLimiteFijado } from "./db"
import { afirmacion, reiniciarHuellas, vec } from "./huellas-comun"
import { clienteDeServicio } from "./servicio"

// `embeber` checks the count itself; this file stands in for a Voyage client that does not, so the guard inside the
// paid call is what keeps a short batch from being confirmed.
const respuesta = vi.hoisted(() => ({ cortar: false }))
vi.mock("@/lib/proveedores/voyage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/proveedores/voyage")>()
  return {
    ...original,
    embeber: async (entrada: { textos: readonly string[] }) => ({
      vectores: entrada.textos.slice(respuesta.cortar ? 1 : 0).map((_, i) => vec({ [i + 2]: 1 })),
      tokens: 10,
    }),
  }
})

afterAll(() => pool.end())
beforeEach(async () => {
  await reiniciarHuellas()
  respuesta.cortar = false
})
afterEach(reiniciarHuellas)

const deps = (): DepsModelo => ({
  db: clienteDeServicio(),
  almacen: almacenEnMemoria(),
  avisos: notificadorEnMemoria(),
  ahora: () => new Date().toISOString(),
  llaveVoyage: () => "pa-de-prueba",
})

async function sembrar(): Promise<void> {
  for (let n = 1; n <= 8; n++) await afirmacion(vec({ [n % 2]: 1, [10 + n]: 0.3 }), { texto: `T${n}` })
}

const estadosDeGastos = async (patron: string) =>
  (await pool.query("select estado from public.gastos where clave like $1", [patron])).rows

describe("a Voyage batch with fewer vectors than texts", () => {
  it("fails the dry run and releases the reservation", async () => {
    await sinLimiteFijado()
    await sembrar()
    respuesta.cortar = true
    await expect(probarModeloDeHuellas(deps(), { modelo: "voyage-4" })).rejects.toThrow(/un vector por afirmación/)
    expect(await estadosDeGastos("modelo:probar:%")).toEqual([{ estado: "liberado" }])
  })

  it("fails the top-up of a switch and releases the reservation", async () => {
    await sinLimiteFijado()
    await sembrar()
    const r = await probarModeloDeHuellas(deps(), { modelo: "voyage-4" })
    if ("omitida" in r) throw new Error("No debía omitirse.")
    await afirmacion(vec({ 30: 1 }), { texto: "Tarde" })
    respuesta.cortar = true
    await expect(aplicarModeloDeHuellas(deps(), { prueba: r.prueba })).rejects.toThrow(/un vector por afirmación/)
    expect(await estadosDeGastos("modelo:aplicar:%")).toEqual([{ estado: "liberado" }])
  })
})
