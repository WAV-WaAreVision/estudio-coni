import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { despues, PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterAll(() => pool.end())
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

function doble(ahora: () => string) {
  const avisos = notificadorEnMemoria()
  const deps: DepsPublicacion = {
    db: clienteDeServicio(),
    almacen: almacenEnMemoria(),
    avisos,
    ahora,
    dormir: async () => {},
    sondeo: { cadaMs: 60_000, veces: 5 },
    sondeoLinkedin: { cadaMs: 15_000, veces: 8 },
  }
  return { deps, avisos }
}

async function programado() {
  // Signed for a far future time (the real flow refuses a past one), then the clock of the run is moved to it.
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  return id
}

describe("a scheduled carousel at its time (part 2: by hand only)", () => {
  beforeEach(async () => {
    await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = '2031-12-31T00:00:00Z'",
    )
  })

  it("is handed to Coni to upload, with LinkedIn connected and not one call to LinkedIn", async () => {
    const id = await programado()
    const sim = simularLinkedin()
    const d = doble(() => despues(1))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])

    expect(sim.iniciadas).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect((await leerFila(id)).estado).toBe("para_subir_a_mano")
    expect(await publicacionesConDetalle(id)).toMatchObject([{ destino: "linkedin", estado: "para_subir" }])
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContain(
      "Tu carrusel «Lo que un chatbot no ve de ti» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.",
    )
  })

  it("waits before its time", async () => {
    const id = await programado()
    expect(await publicarPendientes(doble(() => despues(-10)).deps)).toEqual([])
    expect((await leerFila(id)).estado).toBe("programado")
  })
})
