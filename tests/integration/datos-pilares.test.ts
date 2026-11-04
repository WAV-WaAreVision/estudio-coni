import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { leerPilares, pesosDeRed, pilaresActivos, pilaresElegibles } from "@/lib/datos/pilares"
import type { CatalogoDePilares } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { clienteDeServicio } from "./servicio"

// The DB's ids are random: the fixture's are fakes.
const sinId = (catalogo: CatalogoDePilares) => catalogo.map(({ id: _id, ...resto }) => resto)

describe("leerPilares", () => {
  it("reads every pillar row with its network and layer flag, in the order the app uses", async () => {
    const leidos = await leerPilares(clienteDeServicio())
    expect(sinId(leidos)).toEqual(sinId(PILARES_DE_PRUEBA))
    for (const pilar of leidos) expect(pilar.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("reads the 13 active ones, and the 12 an idea can take", async () => {
    expect(await pilaresActivos(clienteDeServicio())).toHaveLength(13)
    expect((await pilaresElegibles(clienteDeServicio())).map((p) => p.slug)).not.toContain("capa-tdah")
  })

  it("says what failed when the database refuses", async () => {
    const sinLlave = createClient<Database>("http://127.0.0.1:54421", "no-es-una-llave", {
      auth: { persistSession: false },
    })
    await expect(leerPilares(sinLlave)).rejects.toThrow(/No pude leer los pilares/)
  })
})

describe("pesosDeRed", () => {
  it("gives each stage's weights of a network, adding up to 100", async () => {
    const hoy = await pesosDeRed(clienteDeServicio(), "linkedin", "2026-12-31")
    expect(hoy.pesos.map((p) => [p.slug, p.peso])).toEqual([
      ["diagnostico-doble", 30],
      ["bienestar-e-impacto", 25],
      ["psicologia-en-la-mesa", 30],
      ["mujeres-lideres", 15],
    ])
    expect(hoy.sumaCien).toBe(true)
    const segundo = await pesosDeRed(clienteDeServicio(), "linkedin", "2027-08-01")
    expect(segundo.pesos.map((p) => p.peso)).toEqual([25, 20, 30, 25])
    expect((await pesosDeRed(clienteDeServicio(), "instagram", "2026-11-04")).total).toBe(100)
  })
})
