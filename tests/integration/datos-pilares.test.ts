import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { leerPilares, pilaresActivos } from "@/lib/datos/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { clienteDeServicio } from "./servicio"

describe("leerPilares", () => {
  it("reads every pillar row, active first in order, as the catalog the app uses", async () => {
    expect(await leerPilares(clienteDeServicio())).toEqual(PILARES_DE_PRUEBA)
  })

  it("reads the five active pillars", async () => {
    expect((await pilaresActivos(clienteDeServicio())).map((p) => p.slug)).toEqual([
      "ia-salud-mental",
      "practica-clinica",
      "etica-regulacion",
      "acceso-salud-publica",
      "caso-coni",
    ])
  })

  it("says what failed when the database refuses", async () => {
    const sinLlave = createClient<Database>("http://127.0.0.1:54421", "no-es-una-llave", {
      auth: { persistSession: false },
    })
    await expect(leerPilares(sinLlave)).rejects.toThrow(/No pude leer los pilares/)
  })
})
