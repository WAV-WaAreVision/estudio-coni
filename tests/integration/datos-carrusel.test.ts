import { afterAll, describe, expect, it } from "vitest"
import { contarCambiosDeTexto, guardarCarrusel, laminasAJson, leerCarruselVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const sembradas: string[] = []
afterAll(async () => {
  await borrarSembrado(sembradas, [])
  await pool.end()
})

const HASH = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })

async function otraVersion(piezaId: string, pedido: string) {
  await pool.query(
    `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido)
     values ($1, 2, $2::jsonb, 'Otro texto', $3, 'cambio_texto', $4)`,
    [piezaId, JSON.stringify(LAMINAS_DE_PRUEBA), "e".repeat(64), pedido],
  )
}

describe("leerCarruselVigente", () => {
  it("reads the latest version through Coni's session", async () => {
    const id = await sembrarCarrusel("guion_por_aprobar")
    sembradas.push(id)
    const coni = await clienteDeConi()
    expect(await leerCarruselVigente(coni, id)).toMatchObject({
      version: 1,
      laminas: LAMINAS_DE_PRUEBA,
      textoPost: TEXTO_POST_DE_PRUEBA,
      hashTexto: HASH,
      origen: "inicial",
      pedido: null,
    })
    await otraVersion(id, "Más corto")
    expect(await leerCarruselVigente(coni, id)).toMatchObject({
      version: 2,
      origen: "cambio_texto",
      pedido: "Más corto",
    })
  })

  it("is null for a carousel still being written", async () => {
    const id = await sembrarCarrusel("guion_en_proceso")
    sembradas.push(id)
    expect(await leerCarruselVigente(await clienteDeConi(), id)).toBeNull()
  })
})

describe("contarCambiosDeTexto", () => {
  it("counts her pending request before the writer delivers it, and one the writer could not carry out", async () => {
    const id = await sembrarCarrusel("guion_por_aprobar")
    sembradas.push(id)
    const coni = await clienteDeConi()
    expect(await contarCambiosDeTexto(coni, id)).toBe(0)
    const pedido = await coni.rpc("pedir_cambio_de_carrusel", {
      p_pieza: id,
      p_version: (await leerFila(id)).version,
      p_pedido: "Más corto",
    })
    expect(pedido.error).toBeNull()
    expect(await contarCambiosDeTexto(coni, id)).toBe(1)
    // Declined: back at gate 1 with no new version.
    await pool.query(
      "update public.piezas set estado = 'guion_por_aprobar', pedido_de_cambio = null, version = version + 1 where id = $1",
      [id],
    )
    expect(await contarCambiosDeTexto(coni, id)).toBe(1)
  })
})

describe("guardarCarrusel", () => {
  it("saves the version with its spend and hands back the piece, or null when the piece moved", async () => {
    const id = await sembrarCarrusel("guion_en_proceso")
    sembradas.push(id)
    await pool.query("select public.reservar_gasto($1, 'anthropic', 'carrusel', 0.5, $2)", [id, `datos-${id}`])
    const { version } = await leerFila(id)
    const servicio = clienteDeServicio()
    const entrada = {
      piezaId: id,
      laminas: laminasAJson(LAMINAS_DE_PRUEBA),
      textoPost: TEXTO_POST_DE_PRUEBA,
      hashTexto: HASH,
      revision: [],
      clave: `datos-${id}`,
      realUsd: 0.05,
      respaldo: null,
    }
    expect(await guardarCarrusel(servicio, { ...entrada, versionLeida: version - 1 })).toBeNull()
    const guardada = await guardarCarrusel(servicio, { ...entrada, versionLeida: version })
    expect(guardada).toMatchObject({ id, version: version + 1, estado: "guion_en_proceso" })
  })
})
