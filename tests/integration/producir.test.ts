import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reservarGasto } from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"
import { type Alerta, AVISO_AVATAR, AVISO_AVATAR_LINKEDIN, CIERRE, LINEAS_AYUDA } from "@/lib/dominio/revision"
import { claveDeToma } from "@/lib/dominio/voz"
import { claveDelAvisoDeLimite, mesDelGasto, TEXTO_LIMITE, textoDelAvisoDeLimite } from "@/lib/presupuesto/limite"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { type DepsProduccion, producirPieza } from "@/lib/produccion/producir"
import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { comoConi, pool } from "./db"
import { aplicar } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { leerFila, sembrarIdeaDelMotor, type TeoriaSembrada, vaciarMotor } from "./siembra"

afterAll(() => pool.end())

const URL_CLAUDE = "https://api.anthropic.com/v1/messages"
const URL_VOZ = "https://api.elevenlabs.io/v1/text-to-speech/:voz"
const RECHAZO = "Claude no quiso escribir este guion. Prueba con otra idea."
const CLAVE_ELEVENLABS = "sk_eleven_de_prueba"
const AUDIO = new Uint8Array([73, 68, 51, 4, 0, 255, 251, 144, 1, 2, 3])
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
/** The take the writer makes for a new piece: its draft, Coni's voice, attempt 0. */
const tomaDe = (id: string, guion: string) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), 0)

const CUERPO_BUENO = Array.from({ length: 29 }, () => "una idea simple").join(". ")
const GUION_BUENO = `${CUERPO_BUENO}.\n\n${CIERRE}`
const TEXTO_BUENO = `Hablemos de límites con calma. ${AVISO_AVATAR}`
const TEXTO_CON_AYUDA = `Hablemos de límites con calma. ${LINEAS_AYUDA} ${AVISO_AVATAR}`
// A LinkedIn text that follows every rule: a short hook, short paragraphs, one question, the fixed notice, two hashtags.
const LINKEDIN_BUENO = [
  "Llevan diez años juntos y ya casi no se tocan.",
  ...Array.from(
    { length: 12 },
    () => "Cuando hablamos de límites conviene partir por lo que sí podemos observar en la rutina de cada día.",
  ),
  "¿En qué momento del día te cuesta más desconectarte?",
  AVISO_AVATAR_LINKEDIN,
  "#limites #psicologia",
].join("\n\n")
const LINKEDIN_CON_AYUDA = LINKEDIN_BUENO.replace(AVISO_AVATAR_LINKEDIN, `${LINEAS_AYUDA}\n\n${AVISO_AVATAR_LINKEDIN}`)

interface Borrador {
  guion: string
  texto: string
  /** The default is a LinkedIn text that follows every rule. */
  textoLinkedin?: string
}

interface CuerpoClaude {
  output_config: { effort: string }
  messages: { content: string }[]
}

// Token counts chosen so the cost of each call is easy to tell apart: 0.042 USD to write, 0.008 to review.
const USO_ESCRITURA = {
  input_tokens: 3000,
  output_tokens: 1500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
const USO_REVISION = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
const COSTO_ESCRITURA = 0.042
const COSTO_REVISION = 0.008

function mensajeClaude(salida: unknown, uso: typeof USO_ESCRITURA, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(salida) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: uso,
    ...extra,
  }
}

interface Simulacion {
  escrituras: CuerpoClaude[]
  revisiones: CuerpoClaude[]
  voces: { voz: string; llave: string | null; texto: string }[]
}

interface OpcionesSimulacion {
  /** The draft of the n-th writer call (0 based). */
  borrador?: (n: number) => Borrador
  hallazgos?: { regla: string; frase: string; mensaje: string }[]
  rechazaEscritura?: boolean
  rechazaRevision?: boolean
  /** The ElevenLabs answer to the n-th call (0 based); the default is a good audio. */
  voz?: (n: number) => Response | Promise<Response>
  /** Runs while Claude is "writing", after the spend was reserved. */
  enEscritura?: () => Promise<void>
}

function simular(opciones: OpcionesSimulacion = {}): Simulacion {
  const sim: Simulacion = { escrituras: [], revisiones: [], voces: [] }
  const audioBueno = () => new HttpResponse(AUDIO, { headers: { "Content-Type": "audio/mpeg" } })
  servidor.use(
    http.post<never, CuerpoClaude>(URL_CLAUDE, async ({ request }) => {
      const cuerpo = await request.json()
      if (cuerpo.output_config.effort === "low") {
        sim.revisiones.push(cuerpo)
        if (opciones.rechazaRevision)
          return HttpResponse.json(mensajeClaude({}, USO_REVISION, { content: [], stop_reason: "refusal" }))
        return HttpResponse.json(mensajeClaude({ hallazgos: opciones.hallazgos ?? [] }, USO_REVISION))
      }
      sim.escrituras.push(cuerpo)
      await opciones.enEscritura?.()
      if (opciones.rechazaEscritura)
        return HttpResponse.json(mensajeClaude({}, USO_ESCRITURA, { content: [], stop_reason: "refusal" }))
      const borrador = opciones.borrador?.(sim.escrituras.length - 1) ?? { guion: GUION_BUENO, texto: TEXTO_BUENO }
      return HttpResponse.json(mensajeClaude({ textoLinkedin: LINKEDIN_BUENO, ...borrador }, USO_ESCRITURA))
    }),
    http.post<{ voz: string }, { text: string }>(URL_VOZ, async ({ request, params }) => {
      const cuerpo = await request.json()
      sim.voces.push({ voz: String(params.voz), llave: request.headers.get("xi-api-key"), texto: cuerpo.text })
      return opciones.voz ? await opciones.voz(sim.voces.length - 1) : audioBueno()
    }),
  )
  return sim
}

const piezasCreadas: string[] = []
const ideasCreadas: string[] = []

async function crearPiezaEnProduccion(alertas: Alerta[] = []): Promise<string> {
  const idea = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas)
     values ('ia-salud-mental', 'Hay una palabra que enciende cualquier discusión de pareja.', 'Cambiar el por qué por un qué.',
             'Ejercicio de la semana', 'alta', $1::jsonb) returning id`,
    [JSON.stringify(alertas)],
  )
  const ideaId = idea.rows[0]?.id
  if (!ideaId) throw new Error("No se creó la idea")
  ideasCreadas.push(ideaId)
  const pieza = await pool.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Prueba de producción') returning id",
    [ideaId],
  )
  const id = pieza.rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  piezasCreadas.push(id)
  await pool.query("update public.piezas set estado = 'guion_en_proceso', version = 1 where id = $1", [id])
  return id
}

interface FilaPieza {
  estado: string
  version: number
  intento: number
  guion: string | null
  texto: string | null
  audio_id: string | null
  revision: unknown
  explicacion: string | null
  puerta1_hash: string | null
  puerta1_por: string | null
}

async function pieza(id: string): Promise<FilaPieza> {
  const { rows } = await pool.query<FilaPieza>(
    "select estado, version, intento, guion, texto, audio_id, revision, explicacion, puerta1_hash, puerta1_por from public.piezas where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

interface FilaGasto {
  proveedor: string
  paso: string
  estado: string
  estimado: number
  real: number | null
}

async function gastos(id: string): Promise<FilaGasto[]> {
  const { rows } = await pool.query<FilaGasto>(
    `select proveedor, paso, estado, estimado_usd::float8 as estimado, real_usd::float8 as real
     from public.gastos where pieza_id = $1 order by id`,
    [id],
  )
  return rows
}

/** Coni asks for changes: the real transition, written as her, in a transaction that is committed. */
async function comoConiConfirmado(id: string): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await aplicar(c, id, comoConi, { tipo: "pedir_cambios" })
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

function deps(avisos = notificadorEnMemoria(), almacen = almacenEnMemoria()): DepsProduccion {
  return {
    db: clienteDeServicio(),
    avisos,
    almacen,
    // Retries belong to Trigger.dev; a failing test should not wait for the SDK's backoff.
    claude: new Anthropic({ apiKey: "sk-ant-de-prueba", maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
  }
}

beforeEach(async () => {
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [
    JSON.stringify(coniConfig),
  ])
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("select vault.create_secret($1, 'elevenlabs')", [CLAVE_ELEVENLABS])
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("delete from public.gastos where pieza_id = any($1::uuid[])", [piezasCreadas])
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  await pool.query("delete from public.ideas where id = any($1::uuid[])", [ideasCreadas])
  await vaciarMotor()
  piezasCreadas.length = 0
  ideasCreadas.length = 0
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
})

describe("producirPieza", () => {
  it("writes and reviews the script, makes her voice of it and leaves the piece waiting for Coni", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular()
    const almacen = almacenEnMemoria()

    const resultado = await producirPieza(deps(notificadorEnMemoria(), almacen), id)

    expect(resultado).toEqual({ resultado: "producida" })
    const toma = tomaDe(id, GUION_BUENO)
    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      audio_id: toma,
      guion: GUION_BUENO,
      texto: TEXTO_BUENO,
      revision: [],
      explicacion: null,
    })
    expect(sim.voces).toEqual([{ voz: ELEVENLABS.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION_BUENO }])
    expect(almacen.obtener(toma)?.datos).toEqual(AUDIO)
    expect(sim.escrituras).toHaveLength(1)
    expect(sim.revisiones).toHaveLength(1)
  })

  it("names a retired pillar without its description, which no longer guides the writing", async () => {
    const { rows: antes } = await pool.query<{ descripcion: string | null }>(
      "select descripcion from public.categorias where slug = 'pareja'",
    )
    await pool.query("update public.categorias set descripcion = 'Una descripción de antes' where slug = 'pareja'")
    // A used idea of a pillar retired after it was written: the trigger refuses a new one, so it is seeded around it.
    const cliente = await pool.connect()
    let ideaId: string | undefined
    try {
      await cliente.query("set session_replication_role = replica")
      const { rows } = await cliente.query<{ id: string }>(
        `insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, estado)
         values ('pareja', 'Una idea de antes', 'tema', 'Mito o realidad', 'alta', '[]', 'usada') returning id`,
      )
      ideaId = rows[0]?.id
    } finally {
      await cliente.query("reset session_replication_role")
      cliente.release()
    }
    if (!ideaId) throw new Error("No se creó la idea")
    ideasCreadas.push(ideaId)
    const { rows } = await pool.query<{ id: string }>(
      "insert into public.piezas (idea_id, titulo) values ($1, 'Pilar retirado') returning id",
      [ideaId],
    )
    const id = rows[0]?.id
    if (!id) throw new Error("No se creó la pieza")
    piezasCreadas.push(id)
    await pool.query("update public.piezas set estado = 'guion_en_proceso', version = 1 where id = $1", [id])
    const sim = simular()

    try {
      await producirPieza(deps(), id)
    } finally {
      await pool.query("update public.categorias set descripcion = $1 where slug = 'pareja'", [
        antes[0]?.descripcion ?? null,
      ])
    }

    const pedido = sim.escrituras[0]?.messages[0]?.content ?? ""
    expect(pedido).toContain("Pilar: Pareja y conversación\n")
    expect(pedido).not.toContain("Una descripción de antes")
  })

  it("records the Claude spend at its real cost and the voice at its estimate", async () => {
    const id = await crearPiezaEnProduccion()
    simular()

    await producirPieza(deps(), id)

    const filas = await gastos(id)
    expect(filas.map((g) => [g.proveedor, g.paso, g.estado])).toEqual([
      ["anthropic", "guion", "confirmado"],
      ["elevenlabs", "voz", "confirmado"],
    ])
    expect(filas[0]).toMatchObject({ estimado: 0.5 })
    expect(filas[0]?.real).toBeCloseTo(COSTO_ESCRITURA + COSTO_REVISION, 6)
    expect(filas[1]?.real).toBeCloseTo(estimarCostoVoz(GUION_BUENO), 6)
  })

  it("never approves anything: gate 1 stays empty and the writes come from the service role", async () => {
    const id = await crearPiezaEnProduccion()
    simular()

    await producirPieza(deps(), id)

    const fila = await pieza(id)
    expect(fila.puerta1_hash).toBeNull()
    expect(fila.puerta1_por).toBeNull()
    const { rows } = await pool.query<{ actor_rol: string }>(
      "select actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' and operacion = 'update' order by id",
      [id],
    )
    // The first update is the test's own setup; every later one was written by the task.
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.slice(1).map((r) => r.actor_rol)).toEqual(rows.slice(1).map(() => "service_role"))
    const gastosRoles = await pool.query<{ actor_rol: string }>(
      "select distinct actor_rol from public.eventos where pieza_id = $1 and tabla = 'gastos'",
      [id],
    )
    expect(gastosRoles.rows).toEqual([{ actor_rol: "service_role" }])
  })

  it("asks Claude to correct a blocking first draft exactly once", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      borrador: (n) =>
        n === 0
          ? { guion: `${CUERPO_BUENO}. Gracias por ver este video.`, texto: TEXTO_BUENO }
          : { guion: GUION_BUENO, texto: TEXTO_BUENO },
    })

    await producirPieza(deps(), id)

    expect(sim.escrituras).toHaveLength(2)
    expect(sim.escrituras[0]?.messages[0]?.content).not.toContain("CORRECCIONES")
    expect(sim.escrituras[1]?.messages[0]?.content).toContain("CORRECCIONES")
    expect(sim.escrituras[1]?.messages[0]?.content).toContain("El guion tiene que terminar con")
    expect(sim.revisiones).toHaveLength(1)
    const fila = await pieza(id)
    expect(fila.guion).toBe(GUION_BUENO)
    expect(fila.revision).toEqual([])
    const [claude] = await gastos(id)
    expect(claude?.real).toBeCloseTo(2 * COSTO_ESCRITURA + COSTO_REVISION, 6)
  })

  it("stops after one correction round and leaves the blocking finding for Coni", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({ borrador: () => ({ guion: `${CUERPO_BUENO}. Gracias.`, texto: TEXTO_BUENO }) })

    const resultado = await producirPieza(deps(), id)

    expect(resultado.resultado).toBe("producida")
    expect(sim.escrituras).toHaveLength(2)
    const fila = await pieza(id)
    expect(fila.revision).toEqual([
      { regla: "cierre", tipo: "bloquea", mensaje: "El guion tiene que terminar con «Soy Coni del Rosario.»" },
    ])
  })

  it("stores the findings of Claude's review next to the deterministic ones", async () => {
    const id = await crearPiezaEnProduccion()
    simular({
      hallazgos: [
        { regla: "cifra_sin_verificar", frase: "el setenta por ciento", mensaje: "Hay una cifra sin fuente." },
      ],
    })

    await producirPieza(deps(), id)

    expect((await pieza(id)).revision).toEqual([
      {
        regla: "cifra_sin_verificar",
        tipo: "advierte",
        mensaje: "Hay una cifra sin fuente.",
        frase: "el setenta por ciento",
      },
    ])
  })

  it("asks for the help lines when the idea carries that alert and passes the alerts to Claude", async () => {
    const alertas = [{ tipo: "líneas de ayuda", texto: "Si hay miedo o control constante, derivar a ayuda." }]
    const id = await crearPiezaEnProduccion(alertas)
    const sim = simular({
      borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_CON_AYUDA, textoLinkedin: LINKEDIN_CON_AYUDA }),
    })

    await producirPieza(deps(), id)

    const pedido = sim.escrituras[0]?.messages[0]?.content ?? ""
    expect(pedido).toContain(LINEAS_AYUDA)
    expect(pedido).toContain("Si hay miedo o control constante, derivar a ayuda.")
    expect(sim.escrituras).toHaveLength(1)
    expect((await pieza(id)).revision).toEqual([])
  })

  it("checks the help lines again when Claude flags a risky topic the idea did not mark", async () => {
    const id = await crearPiezaEnProduccion()
    simular({ hallazgos: [{ regla: "tema_de_riesgo", frase: "violencia", mensaje: "El tema toca violencia." }] })

    await producirPieza(deps(), id)

    const regla = (await pieza(id)).revision
    expect(regla).toEqual([
      expect.objectContaining({ regla: "lineas_ayuda", tipo: "bloquea" }),
      expect.objectContaining({ regla: "lineas_ayuda", tipo: "bloquea", campo: "linkedin" }),
      expect.objectContaining({ regla: "tema_de_riesgo", tipo: "advierte" }),
    ])
  })

  it("writes only an explanation, calls nobody and tells her, when the month's limit is reached", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    const id = await crearPiezaEnProduccion()
    // A cap of 0 makes a limit of 0: nothing new fits.
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const sim = simular()
    const avisos = notificadorEnMemoria()

    const resultado = await producirPieza(deps(avisos), id)

    expect(resultado).toEqual({ resultado: "limite" })
    expect(avisos.aConiEnviados).toEqual([{ mensaje: textoDelAvisoDeLimite(0), urgente: true }])
    expect(avisos.avisosEnviados).toEqual([
      { tipo: "limite_alcanzado", clave: claveDelAvisoDeLimite(mesDelGasto(new Date().toISOString())) },
    ])
    expect(avisos.aWavEnviados).toHaveLength(1)
    const fila = await pieza(id)
    expect(fila).toMatchObject({ estado: "guion_en_proceso", explicacion: TEXTO_LIMITE, guion: null, audio_id: null })
    expect(fila.version).toBe(2)
    expect(sim.escrituras).toHaveLength(0)
    expect(sim.voces).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("explains the refusal, releases the reservation and never reaches the voice", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({ rechazaEscritura: true })

    const resultado = await producirPieza(deps(), id)

    expect(resultado).toEqual({ resultado: "rechazado" })
    expect(await pieza(id)).toMatchObject({ estado: "guion_en_proceso", explicacion: RECHAZO, guion: null })
    expect(await gastos(id)).toMatchObject([{ proveedor: "anthropic", estado: "liberado" }])
    expect(sim.voces).toHaveLength(0)
  })

  it("explains the refusal when Claude only refuses the review, after writing", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({ rechazaRevision: true })

    const resultado = await producirPieza(deps(), id)

    expect(resultado).toEqual({ resultado: "rechazado" })
    expect(sim.escrituras).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({ explicacion: RECHAZO, guion: null })
    expect((await gastos(id)).map((g) => g.estado)).toEqual(["liberado"])
  })

  it("does not ask Claude again for a key whose reservation was released by a refusal", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({ rechazaEscritura: true })
    await producirPieza(deps(), id)

    const otra = await producirPieza(deps(), id)

    expect(otra).toEqual({ resultado: "rechazado" })
    expect(sim.escrituras).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({ explicacion: RECHAZO })
  })

  it("does nothing, and calls nobody, when the piece is no longer in production", async () => {
    const id = await crearPiezaEnProduccion()
    simular()
    await producirPieza(deps(), id)
    const sim = simular()
    const antes = await pieza(id)

    const resultado = await producirPieza(deps(), id)

    expect(resultado).toEqual({ resultado: "nada_que_hacer" })
    expect(sim.escrituras).toHaveLength(0)
    expect(sim.revisiones).toHaveLength(0)
    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toEqual(antes)
    expect(await gastos(id)).toHaveLength(2)
  })

  it("delivers the script without a voice, and says why, when the voice setup does not read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")
    await pool.query("update public.ajustes set produccion = '{}'::jsonb")
    const sim = simular()

    const resultado = await producirPieza(deps(), id)

    expect(resultado).toEqual({ resultado: "producida" })
    expect(sim.escrituras).toHaveLength(1)
    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(error).toHaveBeenCalledWith(`No pude preparar la voz de la pieza ${id}`, expect.any(Error))
  })

  it("delivers the script without a voice, reserving nothing, when only Coni's ElevenLabs key is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    // The production settings are valid (beforeEach); the key is read before the voice reserves anything.
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(sim.voces).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
    expect(error).toHaveBeenCalledWith(`No pude preparar la voz de la pieza ${id}`, expect.any(FallaDeConfiguracion))
  })

  it("starts a new round, with a new spend, when Coni asks for changes", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      borrador: (n) => ({
        guion: n === 0 ? GUION_BUENO : GUION_BUENO.replace("una idea simple", "otra idea"),
        texto: TEXTO_BUENO,
      }),
    })
    await producirPieza(deps(), id)
    await comoConiConfirmado(id)
    expect(await pieza(id)).toMatchObject({ estado: "guion_en_proceso", intento: 1, audio_id: null })

    const resultado = await producirPieza(deps(), id)

    expect(resultado.resultado).toBe("producida")
    expect(sim.escrituras).toHaveLength(2)
    // Each round speaks its own draft, under its own attempt.
    expect(sim.voces).toHaveLength(2)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["anthropic", "confirmado"],
      ["elevenlabs", "confirmado"],
      ["anthropic", "confirmado"],
      ["elevenlabs", "confirmado"],
    ])
    expect((await pieza(id)).guion).toContain("otra idea")
  })

  it("keeps the spend reserved and the piece alone when it changed while Claude was writing", async () => {
    const id = await crearPiezaEnProduccion()
    simular({
      enEscritura: () =>
        pool
          .query("update public.piezas set titulo = 'Cambiado', version = version + 1 where id = $1", [id])
          .then(() => undefined),
    })

    await expect(producirPieza(deps(), id)).rejects.toThrow("La pieza cambió mientras se producía.")

    expect(await pieza(id)).toMatchObject({ estado: "guion_en_proceso", guion: null, texto: null, version: 2 })
    expect(await gastos(id)).toEqual([
      { proveedor: "anthropic", paso: "guion", estado: "reservado", estimado: 0.5, real: null },
    ])
  })

  it("saves no draft when its spend was already settled, because the draft and its payment are saved together", async () => {
    const id = await crearPiezaEnProduccion()
    simular({
      // Another run of the same round settles the spend while this one is still waiting for Claude.
      enEscritura: () =>
        pool
          .query("select public.confirmar_gasto(clave, 0.01) from public.gastos where pieza_id = $1", [id])
          .then(() => undefined),
    })

    await expect(producirPieza(deps(), id)).rejects.toThrow("gasto_no_reservado")

    expect(await pieza(id)).toMatchObject({ estado: "guion_en_proceso", guion: null, texto: null, version: 1 })
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado, g.real])).toEqual([["anthropic", "confirmado", 0.01]])
  })

  it("fails as a configuration error when the piece has no idea", async () => {
    const id = await crearPiezaEnProduccion()
    await pool.query("update public.piezas set idea_id = null, version = version + 1 where id = $1", [id])
    const sim = simular()

    await expect(producirPieza(deps(), id)).rejects.toBeInstanceOf(FallaDeConfiguracion)
    expect(sim.escrituras).toHaveLength(0)
  })

  it("fails as a configuration error when the settings row that holds the cap is missing", async () => {
    const id = await crearPiezaEnProduccion()
    await pool.query("delete from public.ajustes")
    try {
      await expect(
        reservarGasto(clienteDeServicio(), {
          piezaId: id,
          proveedor: "anthropic",
          paso: "guion",
          estimadoUsd: 0.5,
          clave: "clave-sin-ajustes",
          ahora: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(FallaDeConfiguracion)
    } finally {
      await pool.query("insert into public.ajustes default values")
    }
  })

  it("fails as a configuration error when there is no current guide", async () => {
    const id = await crearPiezaEnProduccion()
    await pool.query("update public.guias set vigente = false")
    try {
      const sim = simular()
      await expect(producirPieza(deps(), id)).rejects.toBeInstanceOf(FallaDeConfiguracion)
      expect(sim.escrituras).toHaveLength(0)
    } finally {
      await pool.query("update public.guias set vigente = (version = (select max(version) from public.guias))")
    }
  })

  it("delivers the script voiceless when ElevenLabs has no characters, and frees the voice from the cap", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      voz: () => HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
    })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      guion: GUION_BUENO,
      audio_id: null,
      explicacion: TEXTO_SIN_VOZ,
    })
    expect(sim.voces).toHaveLength(1)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs").map((g) => g.estado)).toEqual(["liberado"])
    // A Falla is a reason for Coni, not a bug for WAV.
    expect(error).not.toHaveBeenCalled()
  })

  it("delivers the script without a voice when the month has no room left for it", async () => {
    const id = await crearPiezaEnProduccion()
    // The cap drops after Claude's reservation: the script is paid, the voice no longer fits.
    const sim = simular({
      enEscritura: () => pool.query("update public.ajustes set tope_mensual_usd = 0").then(() => undefined),
    })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(sim.voces).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("logs an ElevenLabs server error, delivers the script and keeps the reservation for the sweeper", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await crearPiezaEnProduccion()
    simular({ voz: () => new HttpResponse("caído", { status: 503 }) })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(await pieza(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, explicacion: TEXTO_SIN_VOZ })
    expect(error).toHaveBeenCalledWith(`No pude preparar la voz de la pieza ${id}`, expect.any(Error))
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs").map((g) => g.estado)).toEqual(["reservado"])
  })

  it("reuses the take a run of this round already paid for, instead of paying again", async () => {
    const id = await crearPiezaEnProduccion()
    const almacen = almacenEnMemoria()
    const toma = tomaDe(id, GUION_BUENO)
    await almacen.subir(toma, AUDIO, "audio/mpeg")
    const sim = simular()

    expect(await producirPieza(deps(notificadorEnMemoria(), almacen), id)).toEqual({ resultado: "producida" })

    expect(sim.voces).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
    expect(await pieza(id)).toMatchObject({ audio_id: toma, explicacion: null })
  })

  it("pays the voice once when the piece changes under the run and Trigger.dev retries it", async () => {
    const id = await crearPiezaEnProduccion()
    const almacen = almacenEnMemoria()
    const sim = simular({
      // The piece changes while ElevenLabs speaks the draft: the draft is saved and paid, and the take is stored and
      // paid right after.
      voz: async (n) => {
        if (n === 0)
          await pool.query("update public.piezas set titulo = 'Cambiado', version = version + 1 where id = $1", [id])
        return new HttpResponse(AUDIO, { headers: { "Content-Type": "audio/mpeg" } })
      },
    })

    await expect(producirPieza(deps(notificadorEnMemoria(), almacen), id)).rejects.toThrow("La pieza cambió")
    expect(await pieza(id)).toMatchObject({ estado: "guion_en_proceso", audio_id: null })

    expect(await producirPieza(deps(notificadorEnMemoria(), almacen), id)).toEqual({ resultado: "producida" })

    expect(sim.escrituras).toHaveLength(1)
    expect(sim.voces).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      audio_id: tomaDe(id, GUION_BUENO),
      explicacion: null,
    })
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["anthropic", "confirmado"],
      ["elevenlabs", "confirmado"],
    ])
  })
})

const CITA_AJENA = "el deseo no se apaga, se esconde debajo de la rutina y del cansancio de todos los días"

const RESPALDO_DEL_MOTOR: TeoriaSembrada["respaldo"] = [
  { autor: "Siembra Esther Prueba", cita: CITA_AJENA },
  { autor: "Siembra Luis Soto", cita: "la rutina apaga lo que no se nombra" },
]

async function crearPiezaDelMotor(respaldo = RESPALDO_DEL_MOTOR): Promise<string> {
  const ideaId = await sembrarIdeaDelMotor({
    gancho: "El deseo se esconde",
    semana: "2026-09-27",
    teoria: {
      titulo: "El deseo se cuida",
      tesis: "El deseo baja con la rutina.",
      nivel: "medio",
      respaldo,
    },
  })
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Prueba del motor') returning id",
    [ideaId],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  piezasCreadas.push(id)
  await pool.query("update public.piezas set estado = 'guion_en_proceso', version = 1 where id = $1", [id])
  return id
}

describe("producirPieza con una idea del motor", () => {
  it("writes from the backing without author names and freezes it on the piece", async () => {
    const id = await crearPiezaDelMotor()
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    const pedido = sim.escrituras[0]?.messages[0]?.content ?? ""
    expect(pedido).toContain("<respaldo>")
    expect(pedido).toContain("El deseo baja con la rutina.")
    expect(pedido).toContain(CITA_AJENA)
    // The backing the script is written from carries no names; only the LinkedIn sources do.
    const bloque = pedido.slice(pedido.indexOf("<respaldo>"), pedido.indexOf("</respaldo>"))
    expect(bloque).not.toContain("Siembra Esther Prueba")
    const fuentes = pedido.slice(pedido.indexOf("FUENTES QUE PUEDES CITAR EN LINKEDIN"))
    expect(fuentes).toContain("\n- Siembra Esther Prueba\n")
    expect(fuentes).toContain("\n- Siembra Luis Soto\n")
    const respaldo = leerRespaldo((await leerFila(id)).respaldo)
    expect(respaldo?.afirmaciones.map((a) => a.autor).sort()).toEqual(["Siembra Esther Prueba", "Siembra Luis Soto"])
  })

  it("signs the caption with the source line right before the avatar notice and freezes the source", async () => {
    const id = await crearPiezaDelMotor([
      {
        autor: "Siembra Stanford",
        cita: "la ia ya se usa para la salud mental",
        titulo: "AI for Mental Health",
        anio: 2026,
      },
    ])
    const sim = simular({
      borrador: () => ({ guion: GUION_BUENO, texto: `Hablemos de esto, como dice Siembra Stanford. ${AVISO_AVATAR}` }),
    })

    await producirPieza(deps(), id)

    const fila = await leerFila(id)
    expect(fila.texto).toBe(
      `Hablemos de esto, como dice Siembra Stanford.\n\nFuente: Siembra Stanford · AI for Mental Health (2026)\n\n${AVISO_AVATAR}`,
    )
    expect(leerRespaldo(fila.respaldo)?.afirmaciones[0]?.fuente).toEqual({
      autor: "Siembra Stanford",
      titulo: "AI for Mental Health",
      anio: 2026,
    })
    expect(fila.revision).not.toEqual(expect.arrayContaining([expect.objectContaining({ regla: "nombra_autor" })]))
    const pedido = sim.escrituras[0]?.messages[0]?.content ?? ""
    expect(pedido).toContain("- Siembra Stanford · AI for Mental Health (2026)")
    expect(pedido).toContain("Pilar: IA y salud mental (")
  })

  it("warns, without blocking, when the draft copies 8 words of a quote", async () => {
    const id = await crearPiezaDelMotor()
    const copia = "el deseo no se apaga, se esconde debajo de la rutina"
    simular({ borrador: () => ({ guion: `${copia}. ${GUION_BUENO}`, texto: TEXTO_BUENO }) })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    const fila = await pieza(id)
    expect(fila.estado).toBe("guion_por_aprobar")
    expect(fila.revision).toEqual(
      expect.arrayContaining([expect.objectContaining({ regla: "copia_de_fuente", tipo: "advierte", frase: copia })]),
    )
  })

  it("keeps the copy warning after the review flags a risky topic", async () => {
    const id = await crearPiezaDelMotor()
    const copia = "el deseo no se apaga, se esconde debajo de la rutina"
    simular({
      borrador: () => ({ guion: `${copia}. ${GUION_BUENO}`, texto: TEXTO_CON_AYUDA }),
      hallazgos: [{ regla: "tema_de_riesgo", frase: "rutina", mensaje: "Toca un tema de riesgo." }],
    })
    await producirPieza(deps(), id)
    expect((await pieza(id)).revision).toEqual(
      expect.arrayContaining([expect.objectContaining({ regla: "copia_de_fuente" })]),
    )
  })

  it("resumes from the saved draft with its frozen backing, without asking Claude again", async () => {
    const id = await crearPiezaDelMotor()
    const ideaId = (await leerFila(id)).idea_id
    // The key the producer derives for this round (`claveDeGasto`): a new piece is at intento 0.
    const clave = claveIdempotencia({
      piezaId: id,
      paso: "producir",
      hash: hashTexto(`claude:${id}:${ideaId}`),
      intento: 0,
    })
    await reservarGasto(clienteDeServicio(), {
      piezaId: id,
      proveedor: "anthropic",
      paso: "guion",
      estimadoUsd: 0.5,
      clave,
      ahora: new Date().toISOString(),
    })
    const congelado = { teoria: { id: "t", titulo: "Antes", tesis: "Tesis de antes", porQue: "" }, afirmaciones: [] }
    // A previous run saved the draft and settled its spend, then died before moving the piece on.
    await pool.query("select public.guardar_borrador($1, 1, $2, $3, '[]'::jsonb, $4, 0.04, $5::jsonb)", [
      id,
      GUION_BUENO,
      TEXTO_BUENO,
      clave,
      JSON.stringify(congelado),
    ])
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(sim.escrituras).toHaveLength(0)
    expect((await leerFila(id)).respaldo).toEqual(congelado)
  })

  it("leaves the backing empty and sends no section for an idea that is not from the engine", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular()
    await producirPieza(deps(), id)
    expect(sim.escrituras[0]?.messages[0]?.content).not.toContain("<respaldo>")
    expect((await leerFila(id)).respaldo).toBeNull()
  })
})

describe("producirPieza: el texto para LinkedIn", () => {
  const SIN_AVISO = LINKEDIN_BUENO.replace(AVISO_AVATAR_LINKEDIN, "Hasta pronto.")

  it("stores the LinkedIn text of the draft next to the script and the caption", async () => {
    const id = await crearPiezaEnProduccion()
    simular()

    await producirPieza(deps(), id)

    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      texto: TEXTO_BUENO,
      texto_linkedin: LINKEDIN_BUENO,
      revision: [],
    })
  })

  it("stores a warning about the LinkedIn text with its field and asks for no correction round", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      borrador: () => ({
        guion: GUION_BUENO,
        texto: TEXTO_BUENO,
        textoLinkedin: LINKEDIN_BUENO.replace("#limites #psicologia", "#a #b #c #d"),
      }),
    })

    await producirPieza(deps(), id)

    expect(sim.escrituras).toHaveLength(1)
    expect((await leerFila(id)).revision).toEqual([
      {
        regla: "hashtags_linkedin",
        tipo: "advierte",
        mensaje: "En LinkedIn van como máximo 3 hashtags. Tiene 4.",
        campo: "linkedin",
      },
    ])
  })

  it("asks Claude to correct a LinkedIn text that blocks, once, and stores the corrected one", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular({
      borrador: (n) => ({
        guion: GUION_BUENO,
        texto: TEXTO_BUENO,
        textoLinkedin: n === 0 ? SIN_AVISO : LINKEDIN_BUENO,
      }),
    })

    await producirPieza(deps(), id)

    expect(sim.escrituras).toHaveLength(2)
    expect(sim.escrituras[1]?.messages[0]?.content).toContain("CORRECCIONES")
    expect(sim.escrituras[1]?.messages[0]?.content).toContain("El texto para LinkedIn tiene que avisar")
    expect(await leerFila(id)).toMatchObject({ texto_linkedin: LINKEDIN_BUENO, revision: [] })
  })

  it("asks Claude to rewrite a numbered emoji in the LinkedIn text and stores the plain list", async () => {
    const id = await crearPiezaEnProduccion()
    const conLista = (marca: string) =>
      LINKEDIN_BUENO.replace("¿En qué momento", `${marca} Primero, mira tu rutina.\n\n¿En qué momento`)
    const sim = simular({
      borrador: (n) => ({ guion: GUION_BUENO, texto: TEXTO_BUENO, textoLinkedin: conLista(n === 0 ? "1️⃣" : "1.") }),
    })

    await producirPieza(deps(), id)

    expect(sim.escrituras).toHaveLength(2)
    expect(await leerFila(id)).toMatchObject({ texto_linkedin: conLista("1."), revision: [] })
  })

  it("leaves a LinkedIn finding that still blocks after the correction round for Coni, with its field", async () => {
    const id = await crearPiezaEnProduccion()
    simular({ borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_BUENO, textoLinkedin: SIN_AVISO }) })

    await producirPieza(deps(), id)

    const { revision } = await leerFila(id)
    expect(revision).toEqual([expect.objectContaining({ regla: "aviso_avatar", tipo: "bloquea", campo: "linkedin" })])
  })

  it("stores a LinkedIn text over 3000 characters and leaves the blocking finding for Coni instead of failing the run", async () => {
    const id = await crearPiezaEnProduccion()
    const largo = `${"a".repeat(3200)}\n\n${AVISO_AVATAR_LINKEDIN}`
    simular({ borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_BUENO, textoLinkedin: largo }) })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    const fila = await leerFila(id)
    expect(fila.texto_linkedin).toBe(largo)
    expect(fila.revision).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ regla: "largo_linkedin", tipo: "bloquea", campo: "linkedin" }),
      ]),
    )
  })

  it("asks for the help lines in the LinkedIn text too when the idea needs them", async () => {
    const id = await crearPiezaEnProduccion([{ tipo: "líneas de ayuda", texto: "El tema roza la violencia." }])
    simular({ borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_CON_AYUDA }) })

    await producirPieza(deps(), id)

    expect((await leerFila(id)).revision).toEqual([
      expect.objectContaining({ regla: "lineas_ayuda", tipo: "bloquea", campo: "linkedin" }),
    ])
  })

  it("passes with the help lines in both texts", async () => {
    const id = await crearPiezaEnProduccion([{ tipo: "líneas de ayuda", texto: "El tema roza la violencia." }])
    simular({
      borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_CON_AYUDA, textoLinkedin: LINKEDIN_CON_AYUDA }),
    })

    await producirPieza(deps(), id)

    expect((await leerFila(id)).revision).toEqual([])
  })

  it("tags a Claude finding with the LinkedIn field when its phrase is only in that text", async () => {
    const id = await crearPiezaEnProduccion()
    const conCifra = LINKEDIN_BUENO.replace(
      "Llevan diez años",
      "El setenta por ciento de las parejas lo vive. Llevan diez años",
    )
    simular({
      borrador: () => ({ guion: GUION_BUENO, texto: TEXTO_BUENO, textoLinkedin: conCifra }),
      hallazgos: [
        { regla: "cifra_sin_verificar", frase: "El setenta por ciento de las parejas", mensaje: "Cifra sin fuente." },
      ],
    })

    await producirPieza(deps(), id)

    expect((await leerFila(id)).revision).toEqual([
      expect.objectContaining({ regla: "cifra_sin_verificar", tipo: "advierte", campo: "linkedin" }),
    ])
  })

  it("sends the LinkedIn text to Claude's review", async () => {
    const id = await crearPiezaEnProduccion()
    const sim = simular()

    await producirPieza(deps(), id)

    expect(sim.revisiones[0]?.messages[0]?.content).toContain(`<texto_linkedin>\n${LINKEDIN_BUENO}\n</texto_linkedin>`)
  })

  it("keeps the LinkedIn text of a draft that an earlier run of the same round saved and paid for", async () => {
    const id = await crearPiezaEnProduccion()
    const ideaId = (await leerFila(id)).idea_id
    const clave = claveIdempotencia({
      piezaId: id,
      paso: "producir",
      hash: hashTexto(`claude:${id}:${ideaId}`),
      intento: 0,
    })
    await reservarGasto(clienteDeServicio(), {
      piezaId: id,
      proveedor: "anthropic",
      paso: "guion",
      estimadoUsd: 0.5,
      clave,
      ahora: new Date().toISOString(),
    })
    await pool.query("select public.guardar_borrador($1, 1, $2, $3, '[]'::jsonb, $4, 0.04, null, $5)", [
      id,
      GUION_BUENO,
      TEXTO_BUENO,
      clave,
      LINKEDIN_BUENO,
    ])
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(sim.escrituras).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", texto_linkedin: LINKEDIN_BUENO })
  })
})
