// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import type { Parte } from "@/lib/ingesta/partes"
import { type GastoDeTraduccion, traducirMaterial } from "@/lib/ingesta/traducir"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const CARPETA = "materiales/m1/traduccion"

interface Cuerpo {
  messages: { content: string }[]
}

const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

/** Three parts of ~6k characters: two do not fit in one batch, so each one is its own batch. */
function tresPartes(segunda = "B"): Parte[] {
  return [
    { texto: `${"vosotros ".repeat(700)}A`, ubicacion: { pagina: 1 } },
    { texto: `${"vosotros ".repeat(700)}${segunda}`, ubicacion: { pagina: 2 } },
    { texto: `${"vosotros ".repeat(700)}C`, ubicacion: { pagina: 3 } },
  ]
}

/** Adapts every part by prefixing it; fails the request number `fallaEn` (1-based) with a 500. */
function adaptando(fallaEn = -1) {
  const cuerpos: Cuerpo[] = []
  servidor.use(
    http.post<never, Cuerpo>(URL_MENSAJES, async ({ request }) => {
      const cuerpo = await request.json()
      cuerpos.push(cuerpo)
      if (cuerpos.length === fallaEn)
        return HttpResponse.json({ error: { type: "api_error", message: "sin creditos" } }, { status: 500 })
      const texto = cuerpo.messages[0]?.content ?? ""
      const partes: Parte[] = JSON.parse(texto.slice(texto.indexOf("["), texto.lastIndexOf("]") + 1))
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              idioma_original: "es",
              partes: partes.map((p) => ({ texto: `adaptado ${p.texto}`, ubicacion: p.ubicacion })),
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return cuerpos
}

function gastoFalso() {
  const llamadas: string[] = []
  const gasto: GastoDeTraduccion = {
    async reservar(r) {
      llamadas.push(`reservar:${r.clave}`)
      return { tope: false }
    },
    async confirmar(clave) {
      llamadas.push(`confirmar:${clave}`)
    },
    async liberar(clave) {
      llamadas.push(`liberar:${clave}`)
    },
  }
  return { gasto, llamadas }
}

const correr = (almacen: ReturnType<typeof almacenEnMemoria>, gasto: GastoDeTraduccion, partes: Parte[]) =>
  traducirMaterial({
    cliente: cliente(),
    gasto,
    almacen,
    carpetaDeLotes: CARPETA,
    clave: "traduccion:m1",
    partes,
    idiomaReportado: "es",
  })

describe("lotes de traduccion guardados", () => {
  it("keeps each paid batch the moment it is paid and confirms it", async () => {
    adaptando(3)
    const almacen = almacenEnMemoria()
    const { gasto, llamadas } = gastoFalso()

    await expect(correr(almacen, gasto, tresPartes())).rejects.toBeInstanceOf(Error)

    expect(almacen.claves().sort()).toEqual([`${CARPETA}/lote-000.json`, `${CARPETA}/lote-001.json`])
    expect(llamadas.map((l) => l.split(":")[0])).toEqual([
      "reservar",
      "confirmar",
      "reservar",
      "confirmar",
      "reservar",
      "liberar",
    ])
  })

  it("on a retry pays only the batch that failed and ends with the same parts as a clean run", async () => {
    const limpio = await (async () => {
      adaptando()
      return correr(almacenEnMemoria(), gastoFalso().gasto, tresPartes())
    })()

    adaptando(3)
    const almacen = almacenEnMemoria()
    await expect(correr(almacen, gastoFalso().gasto, tresPartes())).rejects.toBeInstanceOf(Error)

    const cuerpos = adaptando()
    const { gasto, llamadas } = gastoFalso()
    const r = await correr(almacen, gasto, tresPartes())

    expect(cuerpos).toHaveLength(1)
    expect(llamadas.filter((l) => l.startsWith("reservar"))).toHaveLength(1)
    expect(r.partes).toEqual(limpio.partes)
  })

  it("pays again a batch whose source text changed since it was kept", async () => {
    adaptando()
    const almacen = almacenEnMemoria()
    await correr(almacen, gastoFalso().gasto, tresPartes())

    const cuerpos = adaptando()
    const { gasto } = gastoFalso()
    const r = await correr(almacen, gasto, tresPartes("B cambiado"))

    expect(cuerpos).toHaveLength(1)
    expect(r.partes[1]?.texto).toContain("B cambiado")
  })

  it("pays again a batch whose kept fingerprint does not match", async () => {
    adaptando()
    const almacen = almacenEnMemoria()
    await correr(almacen, gastoFalso().gasto, tresPartes())
    const clave = `${CARPETA}/lote-001.json`
    const guardado = JSON.parse(new TextDecoder().decode(await almacen.bajar(clave)))
    await almacen.subir(
      clave,
      new TextEncoder().encode(JSON.stringify({ ...guardado, huella: "otra" })),
      "application/json",
    )

    const cuerpos = adaptando()
    await correr(almacen, gastoFalso().gasto, tresPartes())

    expect(cuerpos).toHaveLength(1)
  })

  it("splits the same input into the same batches every time", async () => {
    const primero = adaptando()
    await correr(almacenEnMemoria(), gastoFalso().gasto, tresPartes())
    const enviados = primero.map((c) => c.messages[0]?.content)

    const segundo = adaptando()
    await correr(almacenEnMemoria(), gastoFalso().gasto, tresPartes())

    expect(segundo.map((c) => c.messages[0]?.content)).toEqual(enviados)
    expect(enviados).toHaveLength(3)
  })
})
