import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import type { EntradaDeRender, Render } from "@/lib/carrusel/render"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { armarCarrusel, type DepsArmado } from "@/lib/produccion/armar-carrusel"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { asumir, comoConi, pool } from "./db"
import { aplicar } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterEach(() => servidor.resetHandlers())
afterAll(async () => {
  await borrarSembrado(creadas, [])
  await pool.end()
})

const PNG = new Uint8Array([137, 80, 78, 71])
const PDF = new Uint8Array([37, 80, 68, 70])

function doble(respuestas: Render[]) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  const pedidos: EntradaDeRender[] = []
  const deps: DepsArmado = {
    db: clienteDeServicio(),
    almacen,
    avisos,
    ahora: () => new Date().toISOString(),
    renderizar: async (entrada) => {
      pedidos.push(entrada)
      const respuesta = respuestas.shift()
      if (!respuesta) throw new Error("Se pidió un render de más")
      return respuesta
    },
    fuente: async () => "data:font/ttf;base64,AAAA",
    claude: async () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  }
  return { deps, almacen, avisos, pedidos }
}

const listo = (laminas: number): Render => ({
  tipo: "listo",
  pngs: Array.from({ length: laminas }, () => PNG),
  pdf: PDF,
})

async function carrusel(destino: "armando_carrusel" | "carrusel_por_aprobar" = "armando_carrusel") {
  const id = await sembrarCarrusel(destino)
  creadas.push(id)
  return id
}

/** Coni signs the latest version again (after a shortening), with the real transition. */
async function firmarDeNuevo(id: string) {
  const v = await leerVersionVigente(clienteDeServicio(), id)
  if (!v) throw new Error("sin versión")
  const hash = hashTextoDeCarrusel(v)
  const c = await pool.connect()
  try {
    // `asumir` sets the role with `set local`: it only holds inside a transaction.
    await c.query("begin")
    await aplicar(c, id, comoConi, {
      tipo: "firmar_carrusel",
      actor: "coni",
      hashVisto: hash,
      hashActual: hash,
      en: new Date(Date.now() - 60_000).toISOString(),
    })
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

describe("armarCarrusel", () => {
  it("renders the signed version, uploads one PNG per slide and the PDF, and puts the piece at gate 2", async () => {
    const id = await carrusel()
    const d = doble([listo(6)])

    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "armado" })

    const version = await leerVersionVigente(clienteDeServicio(), id)
    expect(version?.estado).toBe("listo")
    expect(d.almacen.claves().sort()).toEqual([...(version?.pngClaves ?? []), version?.pdfClave].sort())
    expect(d.almacen.obtener(version?.pdfClave ?? "")?.tipo).toBe("application/pdf")
    expect((await leerFila(id)).estado).toBe("carrusel_por_aprobar")
    expect(d.pedidos[0]).toMatchObject({ variante: "crema", marca: expect.stringMatching(/^Constanza del Rosario/) })
  })

  it("does nothing the second time: the version is already rendered", async () => {
    const id = await carrusel()
    const d = doble([listo(6)])
    await armarCarrusel(d.deps, id)
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(d.pedidos).toHaveLength(1)
  })

  it("shortens only the overflowing slides once, as a new text that goes back to gate 1", async () => {
    const id = await carrusel()
    const cuerpos: string[] = []
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        cuerpos.push(JSON.stringify(await request.json()))
        return HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [
            { type: "text", text: JSON.stringify({ laminas: [{ numero: 4, texto: "No ve cómo cambia tu voz." }] }) },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
        })
      }),
    )
    const d = doble([{ tipo: "desborda", laminas: [3] }])

    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "acortado" })

    expect(cuerpos).toHaveLength(1)
    expect(cuerpos[0]).toContain("Acorta solo estas láminas: 4")
    const nueva = await leerVersionVigente(clienteDeServicio(), id)
    expect(nueva).toMatchObject({ origen: "acortado", estado: "escrito" })
    expect(nueva?.laminas[3]).toEqual({ tipo: "idea", texto: "No ve cómo cambia tu voz.", destacado: "voz" })
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1_hash: null,
      explicacion: "Acorté la lámina 4 para que quepa. Léela y fírmala de nuevo.",
    })
    const { rows } = await pool.query("select estado from public.gastos where pieza_id = $1 and paso = 'carrusel'", [
      id,
    ])
    expect(rows).toEqual([{ estado: "confirmado" }])
    expect(d.almacen.claves()).toEqual([])
  })

  it("sends a shortened version that still overflows back to gate 1 without calling Claude again", async () => {
    const id = await carrusel()
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [
            { type: "text", text: JSON.stringify({ laminas: [{ numero: 4, texto: "No ve cómo cambia tu voz." }] }) },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
        }),
      ),
    )
    await armarCarrusel(doble([{ tipo: "desborda", laminas: [3] }]).deps, id)
    await firmarDeNuevo(id)
    servidor.resetHandlers()

    const d = doble([{ tipo: "desborda", laminas: [3, 4] }])
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "muy_largo" })

    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1_hash: null,
      explicacion: "Las láminas 4 y 5 quedaron muy largas. Pide un cambio para acortarlas.",
    })
    expect((await leerVersionVigente(clienteDeServicio(), id))?.estado).toBe("fallo")
  })

  it("drops a design change that does not fit and shows her the version she saw, without Claude", async () => {
    const id = await carrusel("carrusel_por_aprobar")
    const vista = await leerVersionVigente(clienteDeServicio(), id)
    const c = await pool.connect()
    try {
      await c.query("begin")
      await asumir(c, comoConi)
      const { rows } = await c.query("select version from public.piezas where id = $1", [id])
      await c.query('select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, \'{"variante": "oscura"}\'::jsonb)', [
        id,
        rows[0].version,
        JSON.stringify(vista?.laminas),
      ])
      await c.query("commit")
    } finally {
      c.release()
    }
    const d = doble([{ tipo: "desborda", laminas: [2] }])

    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "diseno_no_cabe" })

    expect(await leerVersionVigente(clienteDeServicio(), id)).toEqual(vista)
    expect(await leerFila(id)).toMatchObject({
      estado: "carrusel_por_aprobar",
      explicacion: "Ese cambio no cabe en la lámina. Prueba otro.",
      cambios_de_texto: 0,
    })
    expect(d.almacen.claves()).toEqual([])
  })

  it("leaves a piece that is not waiting for its slides alone", async () => {
    const id = await carrusel("carrusel_por_aprobar")
    const d = doble([])
    expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
  })
})
