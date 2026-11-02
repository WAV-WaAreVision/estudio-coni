import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerPresupuestoDelMes } from "@/lib/presupuesto/leer"
import { claveDelAvisoDeLimite, mesDelGasto } from "@/lib/presupuesto/limite"
import { ESTIMADO_POR_GUION_USD } from "@/lib/produccion/comun"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>
const MES = "date_trunc('month', now() at time zone 'America/Santiago')::date"
const CLAVE_DEL_MES = () => claveDelAvisoDeLimite(mesDelGasto(new Date().toISOString()))

async function gasto(proveedor: string, paso: string, clave: string, estado: string, usd: number): Promise<void> {
  await pool.query(
    `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ($1, $2, ${MES}, $5, case when $4 = 'confirmado' then $5::numeric end, $4, $3)`,
    [proveedor, paso, clave, estado, usd],
  )
}

async function reactivar(limite: number, fijadoEn: string): Promise<void> {
  await pool.query(
    `insert into public.limites_del_mes (mes, limite_usd, fijado_por, fijado_en) values (${MES}, $1, $2, ${fijadoEn})`,
    [limite, CONI],
  )
}

async function avisoDeLimite(creadoEn: string): Promise<void> {
  await pool.query(
    `insert into public.avisos (tipo, clave, mensaje, creado_en) values ('limite_alcanzado', $1, 'Llegaste a tu límite.', ${creadoEn})`,
    [CLAVE_DEL_MES()],
  )
}

async function limpiar(): Promise<void> {
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("leerPresupuestoDelMes", () => {
  it("reads the cap, the limit, the spend by provider and what spends by itself", async () => {
    await gasto("anthropic", "motor", "prueba-datos-motor", "confirmado", 1.25)
    await gasto("anthropic", "temas", "temas:fusionar:prueba-datos", "confirmado", 0.25)
    await gasto("heygen", "grabar", "prueba-datos-heygen", "reservado", 2)
    await gasto("elevenlabs", "voz", "prueba-datos-liberado", "liberado", 5)

    expect(await leerPresupuestoDelMes(coni, Date.now())).toEqual({
      tope: 40,
      limiteExplicito: null,
      limite: 80,
      reactivado: false,
      usado: 3.5,
      porProveedor: { anthropic: 1.5, elevenlabs: 0, heygen: 2, voyage: 0 },
      motor: { activo: true, usd: 1.25 },
      fusiones: { activas: true, usd: 0.25 },
      avisoSinLeer: false,
      margenUsd: ESTIMADO_POR_GUION_USD,
    })
  })

  it("rounds every sum to four decimals, so the screen never shows a float's tail", async () => {
    await gasto("anthropic", "motor", "prueba-redondeo-motor-1", "confirmado", 0.1)
    await gasto("anthropic", "motor", "prueba-redondeo-motor-2", "confirmado", 0.2)
    await gasto("anthropic", "temas", "temas:fusionar:prueba-redondeo-1", "confirmado", 0.1)
    await gasto("anthropic", "temas", "temas:fusionar:prueba-redondeo-2", "confirmado", 0.2)

    expect(await leerPresupuestoDelMes(coni, Date.now())).toMatchObject({
      usado: 0.6,
      porProveedor: { anthropic: 0.6 },
      motor: { usd: 0.3 },
      fusiones: { usd: 0.3 },
    })
  })

  it("knows a reactivated month and an unread limit notice that came after it", async () => {
    await reactivar(130, "now() - interval '1 minute'")
    await avisoDeLimite("now()")

    expect(await leerPresupuestoDelMes(coni, Date.now())).toMatchObject({
      limite: 130,
      reactivado: true,
      avisoSinLeer: true,
    })
  })

  it("counts an unread notice even without a reactivated month", async () => {
    await avisoDeLimite("now()")

    expect(await leerPresupuestoDelMes(coni, Date.now())).toMatchObject({ reactivado: false, avisoSinLeer: true })
  })

  it("ignores an unread notice older than the reactivation, a run that stopped against the old limit", async () => {
    // A run whose transaction began before «Reactivar» commits its notice after fijar_limite_del_mes marked the
    // month's notices read: the row stays unread but its creado_en (transaction time) is before fijado_en.
    await reactivar(130, "now()")
    await avisoDeLimite("now() - interval '1 second'")

    expect(await leerPresupuestoDelMes(coni, Date.now())).toMatchObject({ reactivado: true, avisoSinLeer: false })
  })
})
