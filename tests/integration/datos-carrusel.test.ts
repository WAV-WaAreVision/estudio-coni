import { afterAll, describe, expect, it } from "vitest"
import {
  contarCambiosDeTexto,
  guardarArmado,
  guardarCarrusel,
  laminasAJson,
  leerCarruselVigente,
  leerVersion,
  leerVersionVigente,
  marcarArmadoFallido,
  marcarVersion,
} from "@/lib/datos/carrusel"
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

describe("a version's render", () => {
  it("reads the latest version with its design, state and files", async () => {
    const id = await sembrarCarrusel("carrusel_por_aprobar")
    sembradas.push(id)
    const version = await leerVersionVigente(clienteDeServicio(), id)
    expect(version).toMatchObject({ diseno: { variante: "crema" }, estado: "listo", origen: "inicial" })
    expect(version?.pngClaves).toHaveLength(6)
    expect(version?.pdfClave).toMatch(/carrusel\.pdf$/)
    expect(await leerVersion(clienteDeServicio(), version?.id ?? "")).toEqual(version)
  })

  it("saves a render and moves the piece to gate 2, and answers null on a stale piece", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    sembradas.push(id)
    const db = clienteDeServicio()
    const version = await leerVersionVigente(db, id)
    if (!version) throw new Error("sin versión")
    const pngs = version.laminas.map((_, i) => `carruseles/${id}/${version.id}/lamina-0${i + 1}.png`)
    const vieja = (await leerFila(id)).version - 1
    expect(await guardarArmado(db, { carruselId: version.id, versionLeida: vieja, pdf: "x.pdf", pngs })).toBeNull()

    const guardada = await guardarArmado(db, {
      carruselId: version.id,
      versionLeida: (await leerFila(id)).version,
      pdf: `carruseles/${id}/${version.id}/carrusel.pdf`,
      pngs,
    })
    expect(guardada?.estado).toBe("carrusel_por_aprobar")
  })

  it("marks the latest version fallo after a failed render, and leaves a rendered one alone", async () => {
    const id = await sembrarCarrusel("armando_carrusel")
    sembradas.push(id)
    const db = clienteDeServicio()
    const version = await leerVersionVigente(db, id)
    await marcarVersion(db, version?.id ?? "", "armando")
    await marcarArmadoFallido(db, id)
    expect((await leerVersionVigente(db, id))?.estado).toBe("fallo")

    const lista = await sembrarCarrusel("carrusel_por_aprobar")
    sembradas.push(lista)
    await marcarArmadoFallido(db, lista)
    expect((await leerVersionVigente(db, lista))?.estado).toBe("listo")
  })
})
