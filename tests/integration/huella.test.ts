import { afterAll, afterEach, describe, expect, it } from "vitest"
import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"
import { diaAntes } from "@/lib/datos-personales/fechas"
import { diaLocal } from "@/lib/dominio/fechas"
import { borrarHuellaDeVisitas } from "@/lib/mantenimiento/huella"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const AHORA = new Date().toISOString()
// The local seed keeps ajustes.zona at America/Santiago, the calendar registrar_clic is called with.
const HOY = diaLocal(Date.parse(AHORA), "America/Santiago")
const HUELLA = "a".repeat(64)

afterEach(async () => {
  await pool.query("delete from public.visitas_clic")
  await pool.query("delete from public.registro_de_borrados where regla = 'huella_de_visitas' and borrado_en = $1", [
    AHORA,
  ])
})
afterAll(() => pool.end())

async function visitasDe(...dias: string[]): Promise<void> {
  for (const dia of dias) {
    await pool.query("insert into public.visitas_clic (dia, enlace, visitante) values ($1, 'agenda', $2)", [
      dia,
      HUELLA,
    ])
  }
}

async function diasQueQuedan(): Promise<string[]> {
  const { rows } = await pool.query<{ dia: string }>("select dia::text as dia from public.visitas_clic order by dia")
  return rows.map((fila) => fila.dia)
}

function anotarEn(anotados: [string, number][]) {
  return async (regla: string, cantidad: number) => {
    anotados.push([regla, cantidad])
  }
}

describe("borrarHuellaDeVisitas", () => {
  it("deletes the visits older than yesterday every night, even when nobody clicked", async () => {
    await visitasDe(diaAntes(HOY, 3), diaAntes(HOY, 2), diaAntes(HOY, 1), HOY)
    const anotados: [string, number][] = []

    const resultado = await borrarHuellaDeVisitas({
      db: clienteDeServicio(),
      ahora: () => AHORA,
      anotarBorrado: anotarEn(anotados),
    })

    expect(resultado).toEqual({ huellas: 2 })
    expect(await diasQueQuedan()).toEqual([diaAntes(HOY, 1), HOY])
    expect(anotados).toEqual([["huella_de_visitas", 2]])
  })

  it("writes its row in registro_de_borrados", async () => {
    await visitasDe(diaAntes(HOY, 5))
    const db = clienteDeServicio()

    await borrarHuellaDeVisitas({ db, ahora: () => AHORA, anotarBorrado: anotadorDeBorrados(db, () => AHORA) })

    const { rows } = await pool.query<{ cantidad: number }>(
      "select cantidad from public.registro_de_borrados where regla = 'huella_de_visitas' and borrado_en = $1",
      [AHORA],
    )
    expect(rows).toEqual([{ cantidad: 1 }])
  })

  it("keeps yesterday and today and writes nothing down when nothing is old", async () => {
    await visitasDe(diaAntes(HOY, 1), HOY)
    const anotados: [string, number][] = []

    expect(
      await borrarHuellaDeVisitas({ db: clienteDeServicio(), ahora: () => AHORA, anotarBorrado: anotarEn(anotados) }),
    ).toEqual({ huellas: 0 })

    expect(await diasQueQuedan()).toEqual([diaAntes(HOY, 1), HOY])
    expect(anotados).toEqual([])
  })

  it("keeps the deletion and fails the step when the log cannot be written", async () => {
    await visitasDe(diaAntes(HOY, 4), HOY)

    await expect(
      borrarHuellaDeVisitas({
        db: clienteDeServicio(),
        ahora: () => AHORA,
        anotarBorrado: async () => {
          throw new Error("No pude anotar el borrado de huella_de_visitas: sin conexión")
        },
      }),
    ).rejects.toThrow("sin conexión")

    expect(await diasQueQuedan()).toEqual([HOY])
  })
})
