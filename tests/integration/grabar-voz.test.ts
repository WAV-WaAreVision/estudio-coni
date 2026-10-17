// tests/integration/grabar-voz.test.ts
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { leerPieza } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveDeToma } from "@/lib/dominio/voz"
import { TEXTO_TOPE } from "@/lib/produccion/comun"
import { type DepsGrabarVoz, grabarVoz } from "@/lib/produccion/grabar-voz"
import { asegurarVoz, claveDeGastoDeVoz, huellaDelGuion } from "@/lib/produccion/voz"
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
    esperar: async () => {},
  }
}

const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs

async function filaDe(id: string) {
  const fila = await leerPieza(clienteDeServicio(), id)
  if (fila === null) throw new Error(`No se sembró la pieza ${id}`)
  return fila
}

function intentar(d: DepsGrabarVoz, fila: Awaited<ReturnType<typeof filaDe>>) {
  return asegurarVoz(d, {
    fila,
    guion: GUION,
    config: ELEVENLABS,
    llave: async () => "sk_eleven_de_prueba",
    nueva: false,
  })
}

async function gastosDeVoz(id: string) {
  const { rows } = await pool.query<{ clave: string; estado: string; sin_cobro: boolean }>(
    "select clave, estado, sin_cobro from public.gastos where pieza_id = $1 and paso = 'voz' order by creado_en, id",
    [id],
  )
  return rows
}

function responder(...respuestas: (() => Response)[]) {
  let vez = 0
  servidor.use(
    http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", () => {
      llamadas += 1
      const respuesta = respuestas[Math.min(vez, respuestas.length - 1)]
      vez += 1
      if (!respuesta) throw new Error("Sin respuesta preparada")
      return respuesta()
    }),
  )
}

const audioOk = () => new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })

// sembrarPieza walks the real flow inside a committed transaction, so `asumir` (SET LOCAL) takes effect.
async function enEstado(estado: "grabando_voz" | "guion_por_aprobar"): Promise<string> {
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
  it("speaks the current script once, stores the take and returns the piece to guion_por_aprobar", async () => {
    const id = await grabando()
    const d = deps()
    const { intento } = await leerFila(id)

    const resultado = await grabarVoz(d, { piezaId: id, nueva: false })

    const clave = claveDeToma(id, HUELLA, intento)
    expect(resultado).toEqual({ resultado: "lista", audioId: clave })
    expect(llamadas).toBe(1)
    expect(d.almacen.obtener(clave)?.datos).toEqual(VOZ)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: clave, explicacion: null })
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
    const id = await enEstado("guion_por_aprobar")
    expect(await grabarVoz(deps(), { piezaId: id, nueva: false })).toEqual({ resultado: "nada_que_hacer" })
    expect(llamadas).toBe(0)
  })

  it("speaks the script on the row now, even when it changed after she asked", async () => {
    const id = await grabando()
    const editado = "Un guion que Coni cambió mientras se preparaba la voz."
    await ajustarPieza(id, { guion: editado })
    const d = deps()
    const { intento } = await leerFila(id)

    const resultado = await grabarVoz(d, { piezaId: id, nueva: false })

    const clave = claveDeToma(id, huellaDelGuion(editado, leerConfigProduccion(coniConfig).elevenlabs), intento)
    expect(resultado).toEqual({ resultado: "lista", audioId: clave })
    expect(llamadas).toBe(1)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: clave })
  })

  it("spends nothing and fails loudly for a piece asking for its voice without a script", async () => {
    const id = await grabando()
    await ajustarPieza(id, { guion: null })

    await expect(grabarVoz(deps(), { piezaId: id, nueva: false })).rejects.toThrow(FallaDeConfiguracion)
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "grabando_voz" })
  })

  it("explains the cap and spends nothing when the voice would pass it", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await grabando()
    const d = deps()

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "tope" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_TOPE })
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
    expect(despues).toMatchObject({ estado: "guion_por_aprobar", intento: antes.intento + 1 })
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

describe("asegurarVoz releases by outcome", () => {
  it.each([401, 403, 422, 429])("releases at once, as not charged, when ElevenLabs refuses with %i", async (estado) => {
    responder(() => HttpResponse.json({ detail: "No se puede" }, { status: estado }))
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow(`HTTP ${estado}`)

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "liberado", sin_cobro: true })])
  })

  it("releases at once, as not charged, when ElevenLabs has no characters", async () => {
    responder(() =>
      HttpResponse.json({ detail: { code: "insufficient_credits", message: "No credits" } }, { status: 402 }),
    )
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow(/caracteres suficientes/)

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "liberado", sin_cobro: true })])
  })

  it("lets a retry of the same attempt reopen the released key and pay once", async () => {
    responder(() => new HttpResponse("slow down", { status: 429 }), audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const d = deps()

    await expect(intentar(d, fila)).rejects.toThrow("429")
    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(2)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado", sin_cobro: false })])
  })

  it("counts a retry after an unknown outcome under a new key, leaving the old one for the sweeper", async () => {
    responder(() => new HttpResponse("x", { status: 503 }), audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const d = deps()

    await expect(intentar(d, fila)).rejects.toThrow("503")
    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(2)
    const base = claveDeGastoDeVoz(id, HUELLA, fila.intento)
    expect(await gastosDeVoz(id)).toEqual([
      expect.objectContaining({ clave: base, estado: "reservado" }),
      expect.objectContaining({ clave: `${base}:r1`, estado: "confirmado" }),
    ])
  })

  it("pays a new key after an outage whose four keys the sweeper released", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    for (let cobro = 0; cobro < 4; cobro += 1) {
      const clave = claveDeGastoDeVoz(id, HUELLA, fila.intento, cobro)
      await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.25, $2, now())", [id, clave])
      await pool.query("select public.liberar_gasto($1)", [clave])
    }

    const voz = await intentar(deps(), fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(1)
    const r4 = `${claveDeGastoDeVoz(id, HUELLA, fila.intento)}:r4`
    expect(await gastosDeVoz(id)).toContainEqual(expect.objectContaining({ clave: r4, estado: "confirmado" }))
  })

  it("stops without calling ElevenLabs after twelve keys of the attempt, open or swept", async () => {
    responder(() => new HttpResponse("x", { status: 503 }))
    const id = await grabando()
    const fila = await filaDe(id)
    for (let vez = 0; vez < 12; vez += 1) {
      await expect(intentar(deps(), fila)).rejects.toThrow("503")
    }

    await expect(intentar(deps(), fila)).rejects.toThrow(/usó 12 reservas de voz/)

    expect(llamadas).toBe(12)
  })

  it("never lets two racing runs of an attempt call ElevenLabs under the same key", async () => {
    let llegadas = 0
    let soltar: () => void = () => {}
    const ambas = new Promise<void>((resolver) => {
      soltar = resolver
    })
    servidor.use(
      http.post("https://api.elevenlabs.io/v1/text-to-speech/:voz", async () => {
        llamadas += 1
        llegadas += 1
        if (llegadas >= 2) soltar()
        // Both runs are inside ElevenLabs at once, or one gives up after a moment.
        await Promise.race([ambas, new Promise((resolver) => setTimeout(resolver, 1500))])
        return audioOk()
      }),
    )
    const id = await grabando()
    const fila = await filaDe(id)

    await Promise.all([intentar(deps(), fila), intentar(deps(), fila)])

    const gastos = await gastosDeVoz(id)
    expect(gastos).toHaveLength(llamadas)
    expect(new Set(gastos.map((g) => g.clave)).size).toBe(llamadas)
  })

  it.each([
    ["a server error", () => new HttpResponse("x", { status: 503 })],
    ["a network drop", () => HttpResponse.error()],
    ["an empty audio", () => new HttpResponse(new Uint8Array(), { headers: { "Content-Type": "audio/mpeg" } })],
  ])("keeps the reservation for the sweeper after %s", async (_caso, respuesta) => {
    responder(respuesta)
    const id = await grabando()

    await expect(intentar(deps(), await filaDe(id))).rejects.toThrow()

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "reservado", sin_cobro: false })])
  })
})

function almacenQueFalla(veces: number) {
  const almacen = almacenEnMemoria()
  let quedan = veces
  let subidas = 0
  return {
    almacen: {
      ...almacen,
      async subir(clave: string, datos: Uint8Array, tipo: string) {
        subidas += 1
        if (quedan > 0) {
          quedan -= 1
          throw new Error("R2 no respondió")
        }
        return almacen.subir(clave, datos, tipo)
      },
    },
    subidas: () => subidas,
  }
}

describe("asegurarVoz keeps a paid audio", () => {
  it("retries the upload with the audio in memory and pays once", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const falla = almacenQueFalla(3)

    const voz = await intentar({ ...deps(), almacen: falla.almacen }, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(1)
    expect(falla.subidas()).toBe(4)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado" })])
  })

  it("confirms the reservation when the upload still fails, because the audio was paid", async () => {
    responder(audioOk)
    const id = await grabando()
    const falla = almacenQueFalla(4)

    await expect(intentar({ ...deps(), almacen: falla.almacen }, await filaDe(id))).rejects.toThrow("R2 no respondió")

    expect(falla.subidas()).toBe(4)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado", sin_cobro: false })])
  })

  it("pays a new key when the attempt's key was confirmed but its take was lost", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const d = deps()
    await expect(intentar({ ...d, almacen: almacenQueFalla(4).almacen }, fila)).rejects.toThrow("R2 no respondió")

    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(2)
    const base = claveDeGastoDeVoz(id, HUELLA, fila.intento)
    expect(await gastosDeVoz(id)).toEqual([
      expect.objectContaining({ clave: base, estado: "confirmado" }),
      expect.objectContaining({ clave: `${base}:r1`, estado: "confirmado" }),
    ])
  })

  it("stops, without paying again, after three new keys lost their take", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    for (let vez = 0; vez < 4; vez += 1) {
      await expect(intentar({ ...deps(), almacen: almacenQueFalla(4).almacen }, fila)).rejects.toThrow("R2")
    }

    const error = intentar(deps(), fila)
    await expect(error).rejects.toThrow(FallaDeConfiguracion)
    await expect(error).rejects.toThrow(/pagó 4 tomas que no se pudieron guardar/)

    expect(llamadas).toBe(4)
  })

  it("uses the take another run stored and confirmed while this one was reserving", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const toma = claveDeToma(id, HUELLA, fila.intento)
    const clave = claveDeGastoDeVoz(id, HUELLA, fila.intento)
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.25, $2, now())", [id, clave])
    await pool.query("select public.confirmar_gasto($1, 0.25)", [clave])
    const almacen = almacenEnMemoria()
    await almacen.subir(toma, VOZ, "audio/mpeg")
    let miradas = 0
    // The first look (before reserving) misses the take; the other run lands it right after.
    const tardio = { ...almacen, existe: async (k: string) => (miradas++ === 0 ? false : almacen.existe(k)) }

    // `nueva` skips the earlier-take lookup, so only the look after reserving can find it.
    const voz = await asegurarVoz(
      { ...deps(), almacen: tardio },
      { fila, guion: GUION, config: ELEVENLABS, llave: async () => "sk_eleven_de_prueba", nueva: true },
    )

    expect(voz).toEqual({ tipo: "lista", audioId: toma })
    expect(llamadas).toBe(0)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ clave, estado: "confirmado" })])
  })

  // The database refuses to confirm this piece's spend the first `veces` times, as a dropped connection would. A
  // sequence counts the refusals because it survives the rollback of the failed update.
  async function confirmacionQueFalla(piezaId: string, veces: number) {
    await pool.query("create sequence public.prueba_fallas_confirmar")
    await pool.query(`
      create function public.prueba_fallar_confirmar() returns trigger language plpgsql as $$
      begin
        if new.pieza_id = '${piezaId}' and nextval('public.prueba_fallas_confirmar') <= ${veces} then
          raise exception 'confirmación caída';
        end if;
        return new;
      end $$`)
    await pool.query(`
      create trigger prueba_fallar_confirmar before update on public.gastos for each row
      when (new.estado = 'confirmado') execute function public.prueba_fallar_confirmar()`)
  }

  async function quitarFallaDeConfirmar() {
    await pool.query("drop trigger if exists prueba_fallar_confirmar on public.gastos")
    await pool.query("drop function if exists public.prueba_fallar_confirmar()")
    await pool.query("drop sequence if exists public.prueba_fallas_confirmar")
  }

  it("retries the confirmation once when it fails after a stored take", async () => {
    responder(audioOk)
    const id = await grabando()
    await confirmacionQueFalla(id, 1)
    let voz: unknown
    try {
      voz = await intentar(deps(), await filaDe(id))
    } finally {
      await quitarFallaDeConfirmar()
    }

    expect(voz).toMatchObject({ tipo: "lista" })
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado" })])
  })

  it("carries both confirmation failures when a stored take cannot be confirmed twice", async () => {
    responder(audioOk)
    const id = await grabando()
    await confirmacionQueFalla(id, 2)
    let error: unknown
    try {
      error = await intentar(deps(), await filaDe(id)).catch((e: unknown) => e)
    } finally {
      await quitarFallaDeConfirmar()
    }

    expect(error).toMatchObject({
      message: expect.stringMatching(/no pude confirmar el gasto de la voz/i),
      cause: {
        primera: expect.objectContaining({ message: expect.stringContaining("confirmación caída") }),
        segunda: expect.objectContaining({ message: expect.stringContaining("confirmación caída") }),
      },
    })
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "reservado" })])
  })

  it("retries the confirmation once when it fails after a lost upload", async () => {
    responder(audioOk)
    const id = await grabando()
    await confirmacionQueFalla(id, 1)
    try {
      await expect(intentar({ ...deps(), almacen: almacenQueFalla(4).almacen }, await filaDe(id))).rejects.toThrow(
        "R2 no respondió",
      )
    } finally {
      await quitarFallaDeConfirmar()
    }

    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "confirmado" })])
  })

  it("carries both the upload and the confirmation failure when the confirmation fails twice", async () => {
    responder(audioOk)
    const id = await grabando()
    await confirmacionQueFalla(id, 2)
    let error: unknown
    try {
      error = await intentar({ ...deps(), almacen: almacenQueFalla(4).almacen }, await filaDe(id)).catch(
        (e: unknown) => e,
      )
    } finally {
      await quitarFallaDeConfirmar()
    }

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      message: expect.stringMatching(/no pude guardar la toma ni confirmar su gasto/i),
      cause: {
        subida: expect.objectContaining({ message: "R2 no respondió" }),
        confirmacion: expect.objectContaining({
          message: expect.stringMatching(/no pude confirmar el gasto de la voz/i),
          cause: {
            primera: expect.objectContaining({ message: expect.stringContaining("confirmación caída") }),
            segunda: expect.objectContaining({ message: expect.stringContaining("confirmación caída") }),
          },
        }),
      },
    })
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ estado: "reservado" })])
  })

  it("confirms the open reservation of a run that died between the upload and the confirmation", async () => {
    responder(audioOk)
    const id = await grabando()
    const fila = await filaDe(id)
    const clave = claveDeGastoDeVoz(id, HUELLA, fila.intento)
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.25, $2, now())", [id, clave])
    const d = deps()
    await d.almacen.subir(claveDeToma(id, HUELLA, fila.intento), VOZ, "audio/mpeg")

    const voz = await intentar(d, fila)

    expect(voz).toEqual({ tipo: "lista", audioId: claveDeToma(id, HUELLA, fila.intento) })
    expect(llamadas).toBe(0)
    expect(await gastosDeVoz(id)).toEqual([expect.objectContaining({ clave, estado: "confirmado" })])
  })

  it("waits a little longer before each upload retry", async () => {
    responder(audioOk)
    const id = await grabando()
    const esperas: number[] = []

    const esperar = async (ms: number) => {
      esperas.push(ms)
    }

    await intentar({ ...deps(), almacen: almacenQueFalla(3).almacen, esperar }, await filaDe(id))

    expect(esperas).toEqual([1000, 2000, 4000])
  })
})
