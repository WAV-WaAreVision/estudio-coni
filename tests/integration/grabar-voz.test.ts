// tests/integration/grabar-voz.test.ts
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { leerPieza } from "@/lib/datos/repositorio"
import { claveDeToma } from "@/lib/dominio/voz"
import { TEXTO_TOPE } from "@/lib/produccion/comun"
import { type DepsGrabarVoz, grabarVoz } from "@/lib/produccion/grabar-voz"
import { asegurarVoz, huellaDelGuion } from "@/lib/produccion/voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { GUION } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { ajustarPieza, leerFila, sembrarPieza } from "./siembra"

afterAll(() => pool.end())

const VOZ = new Uint8Array([73, 68, 51, 4, 0, 1, 2])
const HUELLA = huellaDelGuion(GUION, leerConfigProduccion(coniConfig).elevenlabs)
const creadas: string[] = []
let llamadas = 0

function deps(): DepsGrabarVoz & { almacen: ReturnType<typeof almacenEnMemoria> } {
  return {
    db: clienteDeServicio(),
    almacen: almacenEnMemoria(),
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
  }
}

// sembrarPieza walks the real flow inside a committed transaction, so `asumir` (SET LOCAL) takes effect.
async function enEstado(estado: "grabando_voz" | "guion_aprobado"): Promise<string> {
  const id = await sembrarPieza(estado)
  creadas.push(id)
  return id
}
const grabando = () => enEstado("grabando_voz")

beforeEach(async () => {
  llamadas = 0
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [
    JSON.stringify(coniConfig),
  ])
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("select vault.create_secret('sk_eleven_de_prueba', 'elevenlabs')")
  servidor.use(
    http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => {
      llamadas += 1
      return new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
    }),
  )
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("delete from public.gastos where pieza_id = any($1::uuid[])", [creadas])
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
})

describe("grabarVoz", () => {
  it("speaks the approved script once, stores the take and returns the piece to guion_aprobado", async () => {
    const id = await grabando()
    const d = deps()
    const { intento } = await leerFila(id)

    const resultado = await grabarVoz(d, { piezaId: id, nueva: false })

    const clave = claveDeToma(id, HUELLA, intento)
    expect(resultado).toEqual({ resultado: "lista", audioId: clave })
    expect(llamadas).toBe(1)
    expect(d.almacen.obtener(clave)?.datos).toEqual(VOZ)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado", audio_id: clave, explicacion: null })
    const { rows } = await pool.query("select proveedor, paso, estado from public.gastos where pieza_id = $1", [id])
    expect(rows).toEqual([{ proveedor: "elevenlabs", paso: "voz", estado: "confirmado" }])
  })

  it("reuses an earlier take of the same text and spends nothing", async () => {
    const id = await grabando()
    const d = deps()
    const previa = claveDeToma(id, HUELLA, 0)
    await d.almacen.subir(previa, VOZ, "audio/mpeg")

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "lista", audioId: previa })
    expect(llamadas).toBe(0)
  })

  it("makes a new take when Coni asks to record again, even with an earlier one stored", async () => {
    const id = await grabando()
    const d = deps()
    await d.almacen.subir(claveDeToma(id, HUELLA, 0), VOZ, "audio/mpeg")

    const resultado = await grabarVoz(d, { piezaId: id, nueva: true })

    expect(llamadas).toBe(1)
    expect(resultado).toEqual({ resultado: "lista", audioId: claveDeToma(id, HUELLA, (await leerFila(id)).intento) })
  })

  it("does nothing for a piece that is not recording its voice", async () => {
    const id = await enEstado("guion_aprobado")
    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "nada_que_hacer" })
    expect(llamadas).toBe(0)
  })

  it("spends nothing and explains when the script changed after the approval", async () => {
    const id = await grabando()
    await ajustarPieza(id, { guion: "Un guion que nadie aprobó." })

    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "sin_aprobacion" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado" })
    expect((await leerFila(id)).explicacion).toMatch(/cambió después de aprobarlo/)
  })

  it("explains the cap and spends nothing when the voice would pass it", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await grabando()
    const d = deps()

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "tope" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_aprobado", explicacion: TEXTO_TOPE })
  })

  it("returns the piece with Coni's text when ElevenLabs has no characters", async () => {
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () =>
        HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
      ),
    )
    const id = await grabando()
    const antes = await leerFila(id)

    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "falla" })
    const despues = await leerFila(id)
    expect(despues).toMatchObject({ estado: "guion_aprobado", intento: antes.intento + 1 })
    expect(despues.explicacion).toMatch(/^ElevenLabs no tiene caracteres suficientes/)
  })

  it("lets Trigger.dev retry a server error without changing the piece", async () => {
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => new HttpResponse("x", { status: 503 })),
    )
    const id = await grabando()
    await expect(grabarVoz(deps(), { piezaId: id, nueva: false })).rejects.toThrow("503")
    expect((await leerFila(id)).estado).toBe("grabando_voz")
  })
})

describe("asegurarVoz with tone marks", () => {
  const CON_MARCAS = "[warm] Hola, soy Coni. [cálido] Hoy hablamos de límites."

  async function pedirVoz(modelo: string) {
    const textos: string[] = []
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", async ({ request }) => {
        const cuerpo: unknown = await request.json()
        if (typeof cuerpo === "object" && cuerpo !== null && "text" in cuerpo && typeof cuerpo.text === "string") {
          textos.push(cuerpo.text)
        }
        return new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
      }),
    )
    const id = await grabando()
    const fila = await leerPieza(clienteDeServicio(), id)
    if (fila === null) throw new Error(`No se sembró la pieza ${id}`)
    const config = { ...leerConfigProduccion(coniConfig).elevenlabs, model_id: modelo }
    const voz = await asegurarVoz(deps(), {
      fila,
      guion: CON_MARCAS,
      config,
      llave: async () => "sk_eleven_de_prueba",
      nueva: true,
    })
    return { textos, voz, fila, config }
  }

  it("sends the known marks to a model that speaks them and drops the unknown ones", async () => {
    const { textos, voz, fila, config } = await pedirVoz("eleven_v4")

    expect(textos).toEqual(["[warm] Hola, soy Coni. Hoy hablamos de límites."])
    expect(voz).toEqual({
      tipo: "lista",
      audioId: claveDeToma(fila.id, huellaDelGuion(CON_MARCAS, config), fila.intento),
    })
  })

  it("sends no mark at all to a model that would read them aloud", async () => {
    const { textos } = await pedirVoz("eleven_multilingual_v2")

    expect(textos).toEqual(["Hola, soy Coni. Hoy hablamos de límites."])
  })
})
