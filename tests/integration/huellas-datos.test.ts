import { afterAll, afterEach, describe, expect, it } from "vitest"
import { leerCalibracion } from "@/lib/datos/huellas"
import { CALIBRACION_INICIAL } from "@/lib/dominio/parecido"
import { pool } from "./db"
import { reiniciarCalibracion } from "./huellas-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(reiniciarCalibracion)

const db = clienteDeServicio()

describe("leerCalibracion", () => {
  it("reads the vigente calibration as numbers", async () => {
    expect(await leerCalibracion(db)).toEqual(CALIBRACION_INICIAL)
  })

  it("reads a given version, vigente or not", async () => {
    await pool.query(
      `insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, motivo)
       values (2, 'voyage-4', 0.61, 0.62, 0.63, 0.41, 0.64, 'x')`,
    )
    expect(await leerCalibracion(db, 2)).toEqual({
      version: 2,
      modelo: "voyage-4",
      tema: 0.61,
      grupo: 0.62,
      fusion: 0.63,
      puenteMin: 0.41,
      puenteMax: 0.64,
    })
    expect((await leerCalibracion(db)).version).toBe(1)
  })
})
