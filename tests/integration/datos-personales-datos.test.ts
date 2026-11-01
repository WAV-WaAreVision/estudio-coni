import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { unAnioDespues } from "@/lib/datos-personales/fechas"
import { leerRegistroDeDatos } from "@/lib/datos-personales/leer"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>

beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  await pool.query("delete from public.registro_de_borrados where borrado_en >= '2031-01-01'")
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

describe("leerRegistroDeDatos", () => {
  it("reads the rows in order, the latest deletions first and when the first review is due", async () => {
    await pool.query(
      "insert into public.registro_de_borrados (regla, cantidad, borrado_en) values ('respaldos', 1, '2031-01-02T06:00:00Z'), ('huella_de_visitas', 4, '2031-01-03T06:00:00Z')",
    )

    const registro = await leerRegistroDeDatos(coni)

    expect(registro.filas[0]).toMatchObject({ clave: "rostro_de_coni", dato: "Tu rostro (biometría)" })
    expect(registro.filas.find((fila) => fila.clave === "respaldos")).toMatchObject({
      regla_de_borrado: "respaldos",
      plazo_dias: 30,
    })
    expect(registro.borrados.slice(0, 2)).toEqual([
      {
        id: expect.any(String),
        regla: "huella_de_visitas",
        cantidad: 4,
        borradoEn: expect.stringMatching(/^2031-01-03T06:00:00/),
      },
      {
        id: expect.any(String),
        regla: "respaldos",
        cantidad: 1,
        borradoEn: expect.stringMatching(/^2031-01-02T06:00:00/),
      },
    ])
    expect(registro.ultimaRevision).toBeNull()
    const { rows } = await pool.query<{ desde: string }>("select inventario_desde::text as desde from public.ajustes")
    expect(registro.vence).toBe(unAnioDespues(rows[0]?.desde ?? ""))
    expect(registro.zona).toBe("America/Santiago")
  })

  it("counts the next review from her latest one", async () => {
    await pool.query(
      "insert into public.revisiones_de_inventario (revisado_por, revisado_en) values ($1, '2031-01-05T15:00:00Z')",
      [CONI],
    )

    const registro = await leerRegistroDeDatos(coni)

    expect(registro.ultimaRevision).toMatch(/^2031-01-05T15:00:00/)
    expect(registro.vence).toBe("2032-01-05")
  })
})
