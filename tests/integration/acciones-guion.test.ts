import { readFileSync } from "node:fs"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { claveVoz } from "@/lib/acciones/disparos"
import { type DepsGuion, editarGuion, tieneVersionDeClaude, volverAVersionDeClaude } from "@/lib/acciones/guion"
import { MAXIMO_DEL_TEXTO } from "@/lib/acciones/piezas"
import { MAXIMO_DEL_GUION } from "@/lib/dominio/revision"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { costoClaude, MODELO_POR_TAREA } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, leerFila, sembrarPieza } from "./siembra"

type Db = SupabaseClient<Database>

const URL_CLAUDE = "https://api.anthropic.com/v1/messages"
const LLAVE = "sk-ant-llave-de-coni-de-prueba"
const USO = { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const GUION_VALIDO = readFileSync(
  join(__dirname, "../fixtures/goldens/2026-09-30-deseo-se-esconde/guion.txt"),
  "utf-8",
).trim()
const TEXTO_VALIDO = "El deseo no se apaga, se esconde. Video hecho con mi avatar digital."
const GUION_DE_CLAUDE = `${GUION_VALIDO}\n`

const RESPALDO_GUARDADO = {
  teoria: { id: "t", titulo: "T", tesis: "Te", porQue: "P" },
  afirmaciones: [
    {
      id: "a",
      texto: "x",
      cita: "el deseo no se apaga, se esconde debajo de la rutina de todos los días",
      aporte: "y",
      autor: "Esther Perel",
      deConi: false,
      esPersona: true,
    },
  ],
}

const JUICIO = { regla: "cifra_sin_verificar", mensaje: "Confirma esa cifra.", frase: "ocho de cada diez" }

let coni: Db
let mantenedor: Db
const piezasCreadas: string[] = []

interface Disparo {
  tarea: "voz"
  piezaId: string
  clave: string
  nueva: boolean
}
const disparos: Disparo[] = []

function deps(db: Db = coni, fallos: { voz?: Error } = {}): DepsGuion {
  return {
    db,
    servicio: clienteDeServicio,
    crearClaude: (llave) => new Anthropic({ apiKey: llave, maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
    disparar: {
      producir: async () => {
        throw new Error("editarGuion no escribe guiones")
      },
      grabar: async () => {
        throw new Error("editarGuion no graba videos")
      },
      voz: async (piezaId, clave, nueva) => {
        if (fallos.voz) throw fallos.voz
        disparos.push({ tarea: "voz", piezaId, clave, nueva })
      },
    },
  }
}

function claudeRevisa(hallazgos: unknown[] = []) {
  const pedidos: unknown[] = []
  servidor.use(
    http.post(URL_CLAUDE, async ({ request }) => {
      pedidos.push(await request.json())
      return HttpResponse.json({
        id: "msg_revision",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ hallazgos }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return pedidos
}

async function pieza(destino: Parameters<typeof sembrarPieza>[0] = "guion_por_aprobar"): Promise<string> {
  const id = await sembrarPieza(destino)
  piezasCreadas.push(id)
  return id
}

async function conVersionDeClaude(id: string, guion = GUION_DE_CLAUDE, texto = TEXTO_VALIDO): Promise<void> {
  await pool.query(
    "insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values ($1, 1, $2, $3, 'claude')",
    [id, guion, texto],
  )
}

async function gastosDe(id: string) {
  const { rows } = await pool.query(
    "select proveedor, paso, estado, real_usd::float as real from public.gastos where pieza_id = $1 order by id",
    [id],
  )
  return rows
}

async function versionesDe(id: string) {
  const { rows } = await pool.query(
    "select numero, guion, autor from public.guion_versiones where pieza_id = $1 order by numero",
    [id],
  )
  return rows
}

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("select vault.create_secret($1, 'anthropic')", [LLAVE])
})

afterEach(async () => {
  vi.restoreAllMocks()
  disparos.length = 0
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
  await pool.query("delete from public.guion_versiones where pieza_id = any($1::uuid[])", [piezasCreadas])
})

afterAll(async () => {
  await borrarSembrado(piezasCreadas, [])
  await pool.end()
})

describe("editarGuion", () => {
  it("reviews the edit, stores the merged findings and writes her version", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa([JUICIO])

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    if (!resultado.ok) return
    expect(resultado.revision.map((h) => h.regla)).toContain("cifra_sin_verificar")
    expect(pedidos).toHaveLength(1)
    const guardada = await leerFila(id)
    expect(guardada).toMatchObject({ guion: GUION_VALIDO, texto: TEXTO_VALIDO, version: version + 1 })
    expect(guardada.revision).toEqual(resultado.revision)
    expect((await versionesDe(id)).map((v) => v.autor)).toEqual(["coni"])
  })

  it("keeps the review of the LinkedIn text in what it stores and does not let it block the edit of the script", async () => {
    const id = await pieza()
    await ajustarPieza(id, { texto_linkedin: "Sin el aviso de avatar." })
    const { version } = await leerFila(id)
    claudeRevisa([JUICIO])

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    const guardada = (await leerFila(id)).revision as { regla: string; campo?: string }[]
    expect(guardada.filter((h) => h.campo === "linkedin").map((h) => h.regla)).toContain("aviso_avatar")
    expect(guardada.map((h) => h.regla)).toContain("cifra_sin_verificar")
    // Gate 1 is about the script and the caption: the LinkedIn findings are shown at gate 2.
    expect(resultado.revision.some((h) => h.campo === "linkedin")).toBe(false)
    expect(resultado.revision.map((h) => h.regla)).toContain("cifra_sin_verificar")
  })

  it("sends the LinkedIn text of the piece to Claude's review", async () => {
    const id = await pieza()
    await ajustarPieza(id, { texto_linkedin: "Para colegas." })
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(JSON.stringify(pedidos[0])).toContain("<texto_linkedin>\\nPara colegas.\\n</texto_linkedin>")
  })

  it("sends no LinkedIn block to Claude when the piece has no LinkedIn text yet", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(JSON.stringify(pedidos[0])).not.toContain("texto_linkedin")
  })

  it("warns when her edit copies a quote of the piece's backing or names its author", async () => {
    const id = await pieza()
    await ajustarPieza(id, { respaldo: JSON.stringify(RESPALDO_GUARDADO) })
    claudeRevisa()
    const guion = `Como dice Esther Perel, el deseo no se apaga, se esconde debajo de la rutina. ${GUION_VALIDO}`
    const { version } = await leerFila(id)

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion, texto: TEXTO_VALIDO })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.revision.map((h) => h.regla)).toEqual(expect.arrayContaining(["copia_de_fuente", "nombra_autor"]))
  })

  it("reserves and confirms the spend of the review at its real cost", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(await gastosDe(id)).toEqual([
      {
        proveedor: "anthropic",
        paso: "revision",
        estado: "confirmado",
        real: Number(costoClaude(USO, MODELO_POR_TAREA.revisarConClaude.modelo).toFixed(4)),
      },
    ])
  })

  it("saves nothing and does not call Claude when a rule blocks", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const antes = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await editarGuion(deps(), {
      piezaId: id,
      version,
      guion: "Un guion sin cierre.",
      texto: TEXTO_VALIDO,
    })

    expect(resultado).toMatchObject({ ok: false, motivo: "revision_bloquea" })
    if (resultado.ok) return
    expect(resultado.hallazgos?.map((h) => h.regla)).toContain("cierre")
    expect(pedidos).toHaveLength(0)
    expect(await gastosDe(id)).toEqual([])
    expect(await leerFila(id)).toMatchObject({ guion: antes.guion, version })
    expect(await versionesDe(id)).toEqual([])
  })

  it("stops at the monthly cap without writing", async () => {
    const id = await pieza()
    const { version, guion } = await leerFila(id)
    const pedidos = claudeRevisa()
    await pool.query("update public.ajustes set tope_mensual_usd = 0.01")

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: false, motivo: "tope" })
    expect(pedidos).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({ guion, version })
  })

  it("releases the spend and writes nothing when Claude fails", async () => {
    const id = await pieza()
    const { version, guion } = await leerFila(id)
    servidor.use(http.post(URL_CLAUDE, () => HttpResponse.json({ error: { type: "api_error" } }, { status: 500 })))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("revisar") })
    expect((await gastosDe(id)).map((g) => g.estado)).toEqual(["liberado"])
    expect(await leerFila(id)).toMatchObject({ guion, version })
  })

  it("keeps a paid review reserved and surfaces the error when confirming the spend fails", async () => {
    const id = await pieza()
    const { version, guion } = await leerFila(id)
    claudeRevisa()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const real = clienteDeServicio()
    const servicioQueFallaAlConfirmar = new Proxy(real, {
      get(destino, propiedad) {
        if (propiedad === "rpc") {
          return (funcion: string, ...resto: unknown[]) =>
            funcion === "confirmar_gasto"
              ? Promise.resolve({ data: null, error: { message: "sin conexión" } })
              : Reflect.apply(destino.rpc, destino, [funcion, ...resto])
        }
        const valor = Reflect.get(destino, propiedad)
        return typeof valor === "function" ? valor.bind(destino) : valor
      },
    })

    const resultado = await editarGuion(
      { ...deps(), servicio: () => servicioQueFallaAlConfirmar },
      { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO },
    )

    expect(resultado.ok).toBe(false)
    expect((await gastosDe(id)).map((g) => g.estado)).toEqual(["reservado"])
    expect(await leerFila(id)).toMatchObject({ guion, version })
  })

  it("refuses a script or a caption over the limit before calling Claude", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    expect(
      await editarGuion(deps(), { piezaId: id, version, guion: "a".repeat(MAXIMO_DEL_GUION + 1), texto: TEXTO_VALIDO }),
    ).toMatchObject({ ok: false, error: "El guion es demasiado largo para un reel." })
    expect(
      await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: "a".repeat(MAXIMO_DEL_TEXTO + 1) }),
    ).toMatchObject({ ok: false, error: "Instagram acepta hasta 2.200 caracteres en el texto." })
    expect(pedidos).toHaveLength(0)
    expect(await gastosDe(id)).toEqual([])
  })

  it("tells her when somebody changed the script meanwhile", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    await ajustarPieza(id, { titulo: "Otro título" })
    claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({
      ok: false,
      error: "Alguien cambió este guion mientras lo editabas. Recarga para ver la última versión.",
    })
  })

  it("refuses a piece that is no longer in review", async () => {
    const id = await pieza("en_render")
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: false, error: "Este guion ya no se puede editar." })
    expect(pedidos).toHaveLength(0)
  })

  it("refuses a blank script and a blank caption", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    expect(await editarGuion(deps(), { piezaId: id, version, guion: "  \n ", texto: TEXTO_VALIDO })).toMatchObject({
      ok: false,
      error: "El guion no puede quedar vacío.",
    })
    expect(await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: " " })).toMatchObject({
      ok: false,
      error: "El texto de la publicación no puede quedar vacío.",
    })
    expect(pedidos).toHaveLength(0)
  })

  it("saves the edit without asking for the voice when the voice setup does not read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", guion: GUION_VALIDO })
    expect(disparos).toEqual([])
    expect(error).toHaveBeenCalledWith("No pude leer la configuración de la voz al editar el guion", expect.any(Error))
  })

  it("refuses the maintainer before spending anything", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await editarGuion(deps(mantenedor), {
      piezaId: id,
      version,
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
    })

    expect(resultado.ok).toBe(false)
    expect(pedidos).toHaveLength(0)
    expect(await gastosDe(id)).toEqual([])
  })
})

describe("editarGuion y la voz", () => {
  beforeEach(() => pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)]))
  afterEach(() => pool.query("update public.ajustes set produccion = '{}'::jsonb"))

  it("asks for her voice of the new wording in the same action, reusing earlier takes", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), { piezaId: id, version, guion: GUION_VALIDO, texto: TEXTO_VALIDO })

    const guardada = await leerFila(id)
    expect(guardada).toMatchObject({ estado: "grabando_voz", guion: GUION_VALIDO, version: version + 2 })
    expect(resultado).toMatchObject({ ok: true, version: version + 2 })
    expect(disparos).toEqual([{ tarea: "voz", piezaId: id, clave: claveVoz(guardada), nueva: false }])
  })

  it("leaves the voice alone when the edit keeps what the voice says", async () => {
    const id = await pieza()
    await ajustarPieza(id, { guion: GUION_VALIDO })
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(), {
      piezaId: id,
      version,
      guion: GUION_VALIDO,
      texto: `${TEXTO_VALIDO} Y una línea más.`,
    })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar" })
    expect(disparos).toEqual([])
  })

  it("keeps the edit and hands the piece back with the reason when the voice cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await pieza()
    const { version } = await leerFila(id)
    claudeRevisa()

    const resultado = await editarGuion(deps(coni, { voz: new Error("Trigger.dev no responde") }), {
      piezaId: id,
      version,
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
    })

    expect(resultado).toMatchObject({ ok: true, version: version + 3 })
    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      guion: GUION_VALIDO,
      explicacion: TEXTO_SIN_VOZ,
    })
  })
})

describe("volverAVersionDeClaude", () => {
  it("saves the latest draft of Claude through the same review", async () => {
    const id = await pieza()
    await conVersionDeClaude(id, "Un primer borrador viejo.", "Texto viejo.")
    await pool.query(
      "insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values ($1, 2, $2, $3, 'claude')",
      [id, GUION_VALIDO, TEXTO_VALIDO],
    )
    await ajustarPieza(id, { guion: "Algo que Coni escribió.", texto: "Otro." })
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await volverAVersionDeClaude(deps(), { piezaId: id, version })

    expect(resultado).toMatchObject({ ok: true, version: version + 1 })
    expect(pedidos).toHaveLength(1)
    expect(await leerFila(id)).toMatchObject({ guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    expect((await versionesDe(id)).map((v) => v.autor)).toEqual(["claude", "claude", "coni"])
  })

  it("answers sin_version_de_claude for a piece created before versions existed", async () => {
    const id = await pieza()
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await volverAVersionDeClaude(deps(), { piezaId: id, version })

    expect(resultado).toMatchObject({ ok: false, motivo: "sin_version_de_claude" })
    expect(pedidos).toHaveLength(0)
  })

  it("refuses the maintainer", async () => {
    const id = await pieza()
    await conVersionDeClaude(id)
    const { version } = await leerFila(id)
    const pedidos = claudeRevisa()

    const resultado = await volverAVersionDeClaude(deps(mantenedor), { piezaId: id, version })

    expect(resultado.ok).toBe(false)
    expect(pedidos).toHaveLength(0)
  })
})

describe("tieneVersionDeClaude", () => {
  it("is true only when Claude's draft was recorded", async () => {
    const sin = await pieza()
    const con = await pieza()
    await conVersionDeClaude(con)

    expect(await tieneVersionDeClaude(deps(), sin)).toBe(false)
    expect(await tieneVersionDeClaude(deps(), con)).toBe(true)
  })
})
