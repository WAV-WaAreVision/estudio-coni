import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { claveGrabar, claveVoz } from "@/lib/acciones/disparos"
import {
  aprobarGuion,
  aprobarVideo,
  cambiarFecha,
  type DepsAcciones,
  descartar,
  editarTexto,
  editarTextoLinkedin,
  elegirIdeas,
  marcarSubidoAMano,
  pedirCambios,
  pedirDescargaDelVideo,
  pedirVoz,
  regrabar,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { hashPuerta1, hashTexto, hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { huellaDeRespaldo } from "@/lib/dominio/respaldo"
import { AVISO_AVATAR_LINKEDIN, CIERRE } from "@/lib/dominio/revision"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { claveAudio } from "@/lib/proveedores/almacen"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import type { Database } from "@/lib/supabase/database.types"
import coniConfig from "../fixtures/coni.config.json"
import { CONI, comoConi, pool } from "./db"
import { aplicar, TEXTO, VIDEO } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, leerFila, publicacionesDe, sembrarIdea, sembrarPieza } from "./siembra"

type Db = SupabaseClient<Database>

const GUION_VALIDO = readFileSync(
  join(__dirname, "../fixtures/goldens/2026-09-30-deseo-se-esconde/guion.txt"),
  "utf-8",
).trim()
const TEXTO_VALIDO = "El deseo no se apaga, se esconde. Video hecho con mi avatar digital."
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

const FUTURO = "2099-10-09T19:00:00-03:00"
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
/** A take of `guion` for this piece, as the writer or grabar-voz stores it. */
const tomaDe = (id: string, guion: string, toma = 0) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), toma)
const AVISO_GRABACION = "Quedó aprobado, pero la grabación tarda en partir. Si no avanza, te aviso."

let coni: Db
let servicio: Db
const piezasCreadas: string[] = []
const ideasCreadas: string[] = []

interface Disparo {
  tarea: "producir" | "grabar" | "voz"
  piezaId: string
  clave: string
  nueva?: boolean
  intento?: number
  retraso?: string
}

function armar(db: Db = coni, fallos: { grabar?: Error; producir?: Error; voz?: Error } = {}) {
  const disparos: Disparo[] = []
  const deps: DepsAcciones = {
    db,
    disparar: {
      async producir(piezaId, clave) {
        if (fallos.producir) throw fallos.producir
        disparos.push({ tarea: "producir", piezaId, clave })
      },
      async grabar(piezaId, clave, intento, retraso) {
        if (fallos.grabar) throw fallos.grabar
        disparos.push({ tarea: "grabar", piezaId, clave, intento, ...(retraso ? { retraso } : {}) })
      },
      async voz(piezaId, clave, nueva) {
        if (fallos.voz) throw fallos.voz
        disparos.push({ tarea: "voz", piezaId, clave, nueva })
      },
    },
    ahora: () => new Date().toISOString(),
  }
  return { deps, disparos }
}

async function pieza(
  destino: Parameters<typeof sembrarPieza>[0],
  ajustes: Record<string, unknown> = {},
  opciones: Parameters<typeof sembrarPieza>[2] = {},
) {
  const id = await sembrarPieza(destino, ajustes, opciones)
  piezasCreadas.push(id)
  return id
}

const ajustarComoPostgres = ajustarPieza
const fila = leerFila

async function versionDe(id: string): Promise<number> {
  return (await fila(id)).version
}

async function idea(extra: { pilar?: string; alertas?: unknown } = {}): Promise<string> {
  const id = await sembrarIdea(extra)
  ideasCreadas.push(id)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
  servicio = clienteDeServicio()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await borrarSembrado(piezasCreadas, ideasCreadas)
  await pool.end()
})

describe("elegirIdeas", () => {
  it("creates one piece per idea, marks the ideas as used and starts the script of each", async () => {
    const [a, b] = [await idea(), await idea({ pilar: "pareja" })]
    const { deps, disparos } = armar()

    const resultado = await elegirIdeas(deps, [a, b])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    piezasCreadas.push(...resultado.piezas)
    expect(resultado.piezas).toHaveLength(2)
    for (const id of resultado.piezas) {
      expect(await fila(id)).toMatchObject({
        estado: "guion_en_proceso",
        version: 1,
        titulo: "El deseo no se apaga, se esconde",
      })
    }
    const { rows } = await pool.query("select estado from public.ideas where id = any($1)", [[a, b]])
    expect(rows.map((r) => r.estado)).toEqual(["usada", "usada"])
    expect(disparos.map((d) => d.tarea)).toEqual(["producir", "producir"])
    expect(new Set(disparos.map((d) => d.clave)).size).toBe(2)
  })

  it("refuses an idea that was already used and creates nothing", async () => {
    const [libre, usada] = [await idea(), await idea()]
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [usada])
    const { deps, disparos } = armar()
    const antes = await pool.query("select count(*)::int as n from public.piezas")

    const resultado = await elegirIdeas(deps, [libre, usada])

    expect(resultado).toEqual({ ok: false, error: "Una de esas ideas ya no está disponible. Vuelve a elegir." })
    expect((await pool.query("select count(*)::int as n from public.piezas")).rows[0].n).toBe(antes.rows[0].n)
    expect((await pool.query("select estado from public.ideas where id = $1", [libre])).rows[0].estado).toBe("idea")
    expect(disparos).toEqual([])
  })

  it("refuses repeated ids, an empty choice and more than five ideas", async () => {
    const id = await idea()
    const { deps } = armar()

    expect(await elegirIdeas(deps, [])).toMatchObject({ ok: false })
    expect(await elegirIdeas(deps, [id, id])).toMatchObject({ ok: false })
    expect(
      await elegirIdeas(
        deps,
        Array.from({ length: 6 }, () => id),
      ),
    ).toMatchObject({ ok: false })
  })

  it("does not use the same idea twice when the button is tapped twice", async () => {
    const id = await idea()
    const { deps } = armar()

    const primera = await elegirIdeas(deps, [id])
    const segunda = await elegirIdeas(deps, [id])

    expect(primera.ok).toBe(true)
    if (primera.ok) piezasCreadas.push(...primera.piezas)
    expect(segunda).toMatchObject({ ok: false })
  })

  it("leaves the piece with a reason Coni can read when the script could not be started", async () => {
    const id = await idea()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { deps } = armar(coni, { producir: new Error("Trigger.dev no responde") })

    const resultado = await elegirIdeas(deps, [id])

    expect(resultado).toMatchObject({ ok: false })
    const { rows } = await pool.query("select id, estado, explicacion from public.piezas where idea_id = $1", [id])
    piezasCreadas.push(...rows.map((r) => r.id))
    expect(rows[0]).toMatchObject({ estado: "guion_en_proceso" })
    expect(rows[0].explicacion).toMatch(/no pude empezar/i)
  })
})

describe("reintentarGuion", () => {
  it("clears the reason and starts the script again with a new key", async () => {
    const id = await pieza("guion_en_proceso", { explicacion: "Llegaste al tope de gasto de este mes." })
    const { deps, disparos } = armar()

    const resultado = await reintentarGuion(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ explicacion: null, version: 3 })
    expect(disparos).toHaveLength(1)
    expect(disparos[0]).toMatchObject({ tarea: "producir", piezaId: id })
  })

  it("refuses a piece that is not waiting on a reason", async () => {
    const id = await pieza("guion_en_proceso")
    const { deps, disparos } = armar()

    const resultado = await reintentarGuion(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: false })
    expect(disparos).toEqual([])
  })
})

const LOOK_A = { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.jpg" }
const LOOK_B = { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.jpg" }

async function sembrarAvatares(avatares: unknown[]): Promise<void> {
  const produccion = { ...coniConfig, heygen: { ...coniConfig.heygen, avatares } }
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(produccion)])
}

/** A script waiting for gate 1 with her voice of it, as the writer leaves it. */
async function paraAprobar() {
  const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarComoPostgres(id, { audio_id: tomaDe(id, GUION_VALIDO) })
  return id
}

describe("aprobarGuion", () => {
  beforeEach(() => sembrarAvatares([LOOK_A, LOOK_B]))
  afterEach(() => pool.query("update public.ajustes set produccion = '{}'::jsonb"))

  it("binds the frozen backing in the hash", async () => {
    const id = await paraAprobar()
    await ajustarComoPostgres(id, { respaldo: JSON.stringify(RESPALDO_GUARDADO) })

    await aprobarGuion(armar().deps, id, await versionDe(id), "look-a")

    const respaldo = leerRespaldo(RESPALDO_GUARDADO)
    expect((await fila(id)).puerta1_hash).toBe(
      hashPuerta1({
        formula: 3,
        guion: GUION_VALIDO,
        texto: TEXTO_VALIDO,
        avatarId: "look-a",
        respaldo: huellaDeRespaldo(respaldo),
      }),
    )
  })

  it("signs with her voice, stores formula 3, binds the hash and starts the video after the undo window", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()
    const versionVista = await versionDe(id)

    const resultado = await aprobarGuion(deps, id, versionVista, "look-b")

    expect(resultado).toEqual({ ok: true })
    const guardada = await fila(id)
    expect(guardada).toMatchObject({
      estado: "en_render",
      puerta1_por: CONI,
      version: versionVista + 1,
      avatar_id: "look-b",
      audio_id: tomaDe(id, GUION_VALIDO),
      puerta1_formula: 3,
    })
    expect(guardada.puerta1_hash).toBe(
      hashPuerta1({ formula: 3, guion: GUION_VALIDO, texto: TEXTO_VALIDO, avatarId: "look-b", respaldo: "" }),
    )
    expect(disparos).toEqual([
      { tarea: "grabar", piezaId: id, clave: claveGrabar(guardada), intento: guardada.intento, retraso: "10s" },
    ])
  })

  it("refuses to sign without her voice of the current script, and starts nothing", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    // The last one is a take of this very script, made with another voice of ElevenLabs.
    const conOtraVoz = claveDeToma(id, huellaDelGuion(GUION_VALIDO, { ...ELEVENLABS, voice_id: "otra" }), 0)
    const ajenas = [null, claveAudio(id, new Uint8Array([1, 2, 3])), tomaDe(id, "Un guion que ya no está."), conOtraVoz]
    for (const audio of ajenas) {
      await ajustarComoPostgres(id, { audio_id: audio })
      expect(await aprobarGuion(deps, id, await versionDe(id), "look-a")).toEqual({
        ok: false,
        error: "Tu voz no corresponde al guion actual. Prepárala antes de firmar.",
      })
    }
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("stays signed and warns when the video could not be started", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await paraAprobar()
    const { deps } = armar(coni, { grabar: new Error("Trigger.dev no responde") })

    expect(await aprobarGuion(deps, id, await versionDe(id), "look-a")).toEqual({
      ok: true,
      advertencia: AVISO_GRABACION,
    })
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
  })

  it("refuses with a message for Coni when the piece changed after she opened it", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    const resultado = await aprobarGuion(deps, id, (await versionDe(id)) - 1, "look-a")

    expect(resultado).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("approves the script even when the LinkedIn text has a blocking finding: it is not part of gate 1", async () => {
    const id = await paraAprobar()
    await ajustarComoPostgres(id, {
      texto_linkedin: "Sin el aviso de avatar.",
      revision: JSON.stringify([
        { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso.", campo: "linkedin" },
      ]),
    })

    const resultado = await aprobarGuion(armar().deps, id, await versionDe(id), "look-a")

    expect(resultado).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "en_render", texto_linkedin: "Sin el aviso de avatar." })
  })

  it("refuses while the review has a blocking finding, and says which", async () => {
    const id = await paraAprobar()
    await ajustarComoPostgres(id, {
      revision: JSON.stringify([
        { regla: "cierre", tipo: "bloquea", mensaje: `El guion tiene que terminar con «${CIERRE}»` },
      ]),
    })
    const { deps, disparos } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarGuion(deps, id, version, "look-a")

    expect(resultado).toMatchObject({ ok: false })
    expect(!resultado.ok && resultado.error).toContain("El guion tiene que terminar con")
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar" })
    expect(disparos).toEqual([])
  })

  it("refuses a piece that is not waiting for the script gate", async () => {
    const id = await pieza("video_por_aprobar")
    const { deps } = armar()

    const resultado = await aprobarGuion(deps, id, (await fila(id)).version, "look-a")

    expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
  })

  it("does not let the maintainer approve", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar(await clienteDelMantenedor())
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await aprobarGuion(deps, id, await versionDe(id), "look-a")

    expect(resultado).toMatchObject({ ok: false })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("does not let service_role approve either: the database records Coni or nobody", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar(servicio)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await aprobarGuion(deps, id, await versionDe(id), "look-a")

    expect(resultado).toMatchObject({ ok: false })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("refuses to approve until she picks an avatar, and writes nothing", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    for (const sinElegir of [null, "", "   "]) {
      const resultado = await aprobarGuion(deps, id, await versionDe(id), sinElegir)
      expect(resultado).toEqual({ ok: false, error: "Elige con qué avatar se graba antes de aprobar." })
    }
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", avatar_id: null, puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("refuses an avatar that is not in the current list", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    const resultado = await aprobarGuion(deps, id, await versionDe(id), "look-de-otra-persona")

    expect(resultado).toEqual({ ok: false, error: "Ese avatar ya no está disponible. Elige otro." })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", avatar_id: null })
    expect(disparos).toEqual([])
  })

  it("refuses when the list is empty, even for the legacy avatar_id", async () => {
    await sembrarAvatares([])
    const id = await paraAprobar()
    const { deps } = armar()

    const resultado = await aprobarGuion(deps, id, await versionDe(id), coniConfig.heygen.avatar_id)

    expect(resultado).toEqual({
      ok: false,
      error: "Todavía no hay avatares para elegir: avísale a Federico.",
    })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", avatar_id: null })
  })
})

describe("pedirCambios", () => {
  it("sends the piece back to be rewritten as a new attempt and starts the script again", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps, disparos } = armar()

    const resultado = await pedirCambios(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "guion_en_proceso", audio_id: null, intento: 1 })
    expect(disparos).toMatchObject([{ tarea: "producir", piezaId: id }])
  })

  it("refuses when the screen is out of date", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps, disparos } = armar()

    const resultado = await pedirCambios(deps, id, (await versionDe(id)) - 1)

    expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
    expect(disparos).toEqual([])
  })
})

describe("editarTexto", () => {
  it("normalises line endings and accents, saves the caption and reviews it again", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()
    const conCRLF = "Primera línea.\r\nSegunda con tilde decomposed: café.\r\nVideo hecho con mi avatar digital."

    const versionVista = await versionDe(id)

    const resultado = await editarTexto(deps, id, versionVista, conCRLF)

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada.texto).toBe(
      "Primera línea.\nSegunda con tilde decomposed: café.\nVideo hecho con mi avatar digital.",
    )
    expect(guardada.version).toBe(versionVista + 1)
    expect(guardada.revision).toEqual([])
  })

  it("keeps the findings of the LinkedIn text, with their field, when the caption is edited", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    await ajustarComoPostgres(id, { texto_linkedin: "Sin aviso ni pregunta." })

    await editarTexto(armar().deps, id, await versionDe(id), TEXTO_VALIDO)

    const { revision } = await fila(id)
    expect(revision).toEqual(
      expect.arrayContaining([expect.objectContaining({ regla: "aviso_avatar", tipo: "bloquea", campo: "linkedin" })]),
    )
    expect((revision as { campo?: string }[]).filter((h) => h.campo === undefined)).toEqual([])
  })

  it("warns when the new caption copies a quote of the backing", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    await ajustarComoPostgres(id, { respaldo: JSON.stringify(RESPALDO_GUARDADO) })
    const texto = `el deseo no se apaga, se esconde debajo de la rutina. ${TEXTO_VALIDO}`

    await editarTexto(armar().deps, id, await versionDe(id), texto)

    expect((await fila(id)).revision).toEqual(
      expect.arrayContaining([expect.objectContaining({ regla: "copia_de_fuente", tipo: "advierte" })]),
    )
  })

  it("leaves Coni, not the service role, as the actor of the edit in the audit log", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()

    await editarTexto(deps, id, await versionDe(id), "Un texto nuevo.\nVideo hecho con mi avatar digital.")

    const { rows } = await pool.query(
      "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 and operacion = 'update' order by id desc limit 1",
      [id],
    )
    expect(rows[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
  })

  it("flags a caption that forgets the avatar notice as blocking, and clears it once it is back", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()

    await editarTexto(deps, id, await versionDe(id), "Un texto sin el aviso.")
    const bloqueada = await fila(id)
    expect(bloqueada.revision).toMatchObject([{ regla: "aviso_avatar", tipo: "bloquea" }])

    await editarTexto(deps, id, bloqueada.version, TEXTO_VALIDO)
    expect((await fila(id)).revision).toEqual([])
  })

  it("keeps what Claude judged and requires the help lines when the idea or Claude says the topic is risky", async () => {
    const ideaId = await idea({ alertas: [{ tipo: "líneas de ayuda", texto: "Tema de violencia" }] })
    const id = await pieza("guion_por_aprobar", {
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
      idea_id: ideaId,
    })
    await ajustarComoPostgres(id, {
      revision: JSON.stringify([{ regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Hay una cifra." }]),
    })
    const { deps } = armar()
    const version = (await fila(id)).version

    await editarTexto(deps, id, version, TEXTO_VALIDO)

    const reglas = ((await fila(id)).revision as { regla: string }[]).map((h) => h.regla).sort()
    expect(reglas).toEqual(["cifra_sin_verificar", "lineas_ayuda"])
  })

  it("takes a scheduled piece back to approval, as a new attempt, because its text changed", async () => {
    const id = await pieza("programado")
    const { deps } = armar()
    const antes = await fila(id)

    const resultado = await editarTexto(deps, id, antes.version, TEXTO_VALIDO)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({
      estado: "video_por_aprobar",
      puerta2_hash_texto: null,
      puerta2_publicar_en: null,
      intento: antes.intento + 1,
    })
  })

  it("refuses an empty caption and one longer than Instagram allows", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()
    const version = await versionDe(id)

    expect(await editarTexto(deps, id, await versionDe(id), "   \n ")).toEqual({
      ok: false,
      error: "El texto no puede quedar vacío.",
    })
    expect(await editarTexto(deps, id, await versionDe(id), "a".repeat(2201))).toEqual({
      ok: false,
      error: "Instagram acepta hasta 2.200 caracteres en el texto.",
    })
    expect((await fila(id)).version).toBe(version)
  })

  it("refuses when the screen is out of date", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()

    expect(await editarTexto(deps, id, (await versionDe(id)) - 1, TEXTO_VALIDO)).toEqual({
      ok: false,
      error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla.",
    })
  })
})

describe("aprobarVideo", () => {
  async function paraAprobar(extra: Record<string, unknown> = {}) {
    return pieza("video_por_aprobar", { texto: TEXTO_VALIDO, ...extra })
  }

  it("approves as Coni with the video, caption and date she saw, and schedules it", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, FUTURO, ["instagram"])

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "programado", puerta2_por: CONI, puerta2_video_id: VIDEO })
    expect(guardada).toMatchObject({ puerta2_formula: 2, destinos: ["instagram"] })
    expect(guardada.puerta2_hash_texto).toBe(
      hashTextoDePuerta2(2, { texto: TEXTO_VALIDO, textoLinkedin: null, destinos: ["instagram"] }),
    )
    expect(new Date(guardada.puerta2_publicar_en).toISOString()).toBe("2099-10-09T22:00:00.000Z")
  })

  it("refuses a date that already passed", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, "2020-01-01T19:00:00-03:00", ["instagram"])

    expect(resultado).toEqual({ ok: false, error: "La fecha de publicación ya pasó. Elige una hora futura." })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses a date without an explicit offset, which would be read in the server's zone", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, "2099-10-09T19:00:00", ["instagram"])

    expect(resultado).toEqual({ ok: false, error: "La fecha de publicación no es válida." })
  })

  it("refuses when the caption or the video changed after she opened the screen", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const versionVista = (await fila(id)).version
    await ajustarComoPostgres(id, {
      texto: "Otro texto. Video hecho con mi avatar digital.",
    })

    const resultado = await aprobarVideo(deps, id, versionVista, FUTURO, ["instagram"])

    expect(resultado).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses while the caption has a blocking finding", async () => {
    const id = await paraAprobar({
      revision: JSON.stringify([{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso de avatar." }]),
    })
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, FUTURO, ["instagram"])

    expect(resultado).toMatchObject({ ok: false })
    expect(!resultado.ok && resultado.error).toContain("Falta el aviso de avatar.")
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses a time that another reel already has, so two never go out together", async () => {
    const primera = await paraAprobar()
    const segunda = await paraAprobar()
    const { deps } = armar()
    const hora = "2098-03-03T19:00:00-03:00"
    expect(await aprobarVideo(deps, primera, await versionDe(primera), hora, ["instagram"])).toMatchObject({ ok: true })

    const resultado = await aprobarVideo(deps, segunda, await versionDe(segunda), hora, ["instagram"])

    expect(resultado).toEqual({ ok: false, error: "Ese horario ya lo tiene otro reel. Elige otro." })
    expect((await fila(segunda)).estado).toBe("video_por_aprobar")
  })

  it("does not let the maintainer schedule", async () => {
    const id = await paraAprobar()
    const { deps } = armar(await clienteDelMantenedor())
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, FUTURO, ["instagram"])

    expect(resultado).toMatchObject({ ok: false })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })
})

describe("regrabar", () => {
  it("goes back to recording with the approved script, as a new attempt, and starts it", async () => {
    const id = await pieza("video_por_aprobar")
    const antes = await fila(id)
    const { deps, disparos } = armar()

    const resultado = await regrabar(deps, id, antes.version)

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "en_render", video_id: null, intento: antes.intento + 1 })
    expect(disparos).toMatchObject([{ tarea: "grabar", piezaId: id, intento: antes.intento + 1 }])
    expect(disparos[0]?.clave.endsWith(`:${antes.intento + 1}`)).toBe(true)
  })
})

describe("cambiarFecha", () => {
  it("takes a scheduled piece back to approval so Coni can pick another date", async () => {
    const id = await pieza("programado")
    const antes = await fila(id)
    const { deps } = armar()

    const resultado = await cambiarFecha(deps, id, antes.version)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "video_por_aprobar", puerta2_publicar_en: null })
  })
})

async function aplicarComo(id: string, sesion: typeof comoConi, evento: Parameters<typeof aplicar>[3]) {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await aplicar(cliente, id, sesion, evento)
    await cliente.query("commit")
  } finally {
    cliente.release()
  }
}

const aplicarComoServicio = (id: string, evento: Parameters<typeof aplicar>[3]) =>
  aplicarComo(id, { tipo: "servicio" }, evento)
const aplicarComoConi = (id: string, evento: Parameters<typeof aplicar>[3]) => aplicarComo(id, comoConi, evento)

describe("descartar", () => {
  it("discards a piece in progress", async () => {
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar()

    const resultado = await descartar(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "descartado", puerta1_hash: null })
  })

  it("discards a scheduled piece: our own task publishes it, so there is nothing remote to cancel", async () => {
    const id = await pieza("programado")
    const { deps } = armar()

    const resultado = await descartar(deps, id, (await fila(id)).version)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "descartado", puerta2_hash_texto: null })
  })

  it("discards a piece whose recording failed, clearing where the error came from", async () => {
    const id = await pieza("en_render")
    await aplicarComoServicio(id, { tipo: "falla_produccion", explicacion: "HeyGen no pudo terminar el video." })
    expect(await fila(id)).toMatchObject({ estado: "error_produccion", estado_antes_del_error: "en_render" })
    const { deps } = armar()

    const resultado = await descartar(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "descartado", estado_antes_del_error: null })
  })

  it("discards a piece whose publication failed, clearing where the error came from", async () => {
    const id = await pieza("video_por_aprobar")
    await aplicarComoConi(id, {
      tipo: "aprobar_video",
      actor: "coni",
      videoVisto: VIDEO,
      hashTextoVisto: hashTexto(TEXTO),
      hashTextoActual: hashTexto(TEXTO),
      formula: 1,
      publicarEn: new Date(Date.now() + 10 * 60_000).toISOString(),
      en: new Date().toISOString(),
    })
    await aplicarComoServicio(id, { tipo: "falla_publicacion", explicacion: "Instagram rechazó el video." })
    expect(await fila(id)).toMatchObject({ estado: "error_publicacion", estado_antes_del_error: "programado" })
    const { deps } = armar()

    const resultado = await descartar(deps, id, await versionDe(id))

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "descartado", estado_antes_del_error: null })
  })

  it("refuses a published piece", async () => {
    const id = await pieza("publicado")
    const { deps } = armar()

    expect(await descartar(deps, id, (await fila(id)).version)).toMatchObject({ ok: false })
  })
})

describe("reintentar", () => {
  it("retries a failed recording as Coni and starts it again", async () => {
    const id = await pieza("en_render")
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await aplicar(
        cliente,
        id,
        { tipo: "servicio" },
        { tipo: "falla_produccion", explicacion: "HeyGen no pudo terminar el video." },
      )
      await cliente.query("commit")
    } finally {
      cliente.release()
    }
    const antes = await fila(id)
    const { deps, disparos } = armar()

    const resultado = await reintentar(deps, id, antes.version)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "en_render", intento: antes.intento + 1, explicacion: null })
    expect(disparos).toMatchObject([{ tarea: "grabar", piezaId: id, intento: antes.intento + 1 }])
  })

  it("puts a failed publish back on the schedule when the approved time is still within the window", async () => {
    const id = await pieza("video_por_aprobar")
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await aplicar(cliente, id, comoConi, {
        tipo: "aprobar_video",
        actor: "coni",
        videoVisto: VIDEO,
        hashTextoVisto: hashTexto(TEXTO),
        hashTextoActual: hashTexto(TEXTO),
        formula: 1,
        publicarEn: new Date(Date.now() + 10 * 60_000).toISOString(),
        en: new Date().toISOString(),
      })
      await aplicar(
        cliente,
        id,
        { tipo: "servicio" },
        { tipo: "falla_publicacion", explicacion: "Instagram rechazó el video." },
      )
      await cliente.query("commit")
    } finally {
      cliente.release()
    }
    const antes = await fila(id)
    const { deps, disparos } = armar()

    const resultado = await reintentar(deps, id, antes.version)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "programado" })
    expect(disparos).toEqual([])
  })
})

describe("errores que no son de Coni", () => {
  it("shows a generic message and logs a configuration failure", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const id = await pieza("video_por_aprobar")
    const { deps } = armar(coni, { grabar: new FallaDeConfiguracion("Falta TRIGGER_SECRET_KEY") })

    const resultado = await regrabar(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: true })
    expect(registro).toHaveBeenCalled()
  })
})

describe("subir a mano", () => {
  const ENLACE = "https://www.instagram.com/reel/DAbc123xyz/"

  async function ultimoEvento(id: string) {
    const { rows } = await pool.query(
      "select actor_usuario, actor_rol, datos ->> 'estado' as estado from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
      [id],
    )
    return rows[0]
  }

  it("marks a piece as uploaded by hand as Coni, with her name in the audit log", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", "")

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "publicado_a_mano", permalink: null })
    expect(await ultimoEvento(id)).toEqual({
      actor_usuario: CONI,
      actor_rol: "authenticated",
      estado: "publicado_a_mano",
    })
  })

  it("keeps the Instagram link she pastes, without the tracking part", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar()

    await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", `${ENLACE}?igsh=abc`)

    expect(await fila(id)).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE })
  })

  it("lets her mark a scheduled piece before its time, so the scheduled publication cannot also happen", async () => {
    const id = await pieza("programado")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", "")

    expect(resultado.ok).toBe(true)
    expect((await fila(id)).estado).toBe("publicado_a_mano")
  })

  it("refuses a link that is not Instagram's and leaves the piece as it was", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(
      deps,
      id,
      await versionDe(id),
      "instagram",
      "https://malo.example/reel/abc",
    )

    expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("enlace") })
    expect((await fila(id)).estado).toBe("para_subir_a_mano")
  })

  it("refuses a piece that is not waiting to be uploaded, and a screen that went stale", async () => {
    const enAprobacion = await pieza("video_por_aprobar")
    expect(
      await marcarSubidoAMano(armar().deps, enAprobacion, await versionDe(enAprobacion), "instagram", ""),
    ).toMatchObject({
      ok: false,
    })
    const espera = await pieza("para_subir_a_mano")
    const vista = await versionDe(espera)
    expect(await marcarSubidoAMano(armar().deps, espera, vista - 1, "instagram", "")).toMatchObject({ ok: false })
    expect((await fila(espera)).estado).toBe("para_subir_a_mano")
  })

  it("does not let the maintainer say a reel was uploaded", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar(await clienteDelMantenedor())

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", "")

    expect(resultado.ok).toBe(false)
    expect((await fila(id)).estado).toBe("para_subir_a_mano")
  })

  it("can still discard a piece that waits to be uploaded", async () => {
    const id = await pieza("para_subir_a_mano")

    expect((await descartar(armar().deps, id, await versionDe(id))).ok).toBe(true)
    expect((await fila(id)).estado).toBe("descartado")
  })

  describe("pedirDescargaDelVideo", () => {
    const firmar = vi.fn(async (clave: string, nombre: string) => `https://almacen.test/${clave}?descarga=${nombre}`)

    it("signs the approved video of a piece waiting for upload or scheduled, under a name she will recognise", async () => {
      for (const destino of ["para_subir_a_mano", "programado"] as const) {
        const id = await pieza(destino)

        const resultado = await pedirDescargaDelVideo(armar().deps, id, firmar)

        expect(resultado).toEqual({
          ok: true,
          url: `https://almacen.test/${VIDEO}?descarga=reel-${id.slice(0, 8)}.mp4`,
        })
      }
    })

    it("refuses a piece that is not waiting to be uploaded", async () => {
      const id = await pieza("video_por_aprobar")

      expect(await pedirDescargaDelVideo(armar().deps, id, firmar)).toMatchObject({ ok: false })
    })

    it("tells her to try again when the link cannot be signed", async () => {
      const id = await pieza("para_subir_a_mano")

      const resultado = await pedirDescargaDelVideo(armar().deps, id, async () => null)

      expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("descargar") })
    })

    it("does not sign anything for the maintainer", async () => {
      const id = await pieza("para_subir_a_mano")
      const llamadas = firmar.mock.calls.length

      const resultado = await pedirDescargaDelVideo(armar(await clienteDelMantenedor()).deps, id, firmar)

      expect(resultado.ok).toBe(false)
      expect(firmar.mock.calls.length).toBe(llamadas)
    })
  })
})

describe("pedirVoz", () => {
  it("moves a script waiting for her signature to grabando_voz and starts grabar-voz once, keyed", async () => {
    const id = await pieza("guion_por_aprobar")
    const antes = await fila(id)
    const { deps, disparos } = armar()

    expect(await pedirVoz(deps, id, antes.version, false)).toEqual({ ok: true })

    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "grabando_voz", puerta1_hash: null, intento: antes.intento + 1 })
    expect(disparos).toEqual([{ tarea: "voz", piezaId: id, clave: claveVoz(guardada), nueva: false }])
  })

  it("hands the piece back with the reason when grabar-voz cannot start", async () => {
    const id = await pieza("guion_por_aprobar")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { deps } = armar(coni, { voz: new Error("Trigger.dev no responde") })

    expect(await pedirVoz(deps, id, await versionDe(id), true)).toEqual({ ok: false, error: TEXTO_SIN_VOZ })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_SIN_VOZ })
  })

  it("refuses a signed piece: the voice is made before the signature", async () => {
    const id = await pieza("en_render")
    const { deps, disparos } = armar()
    const version = await versionDe(id)

    expect((await pedirVoz(deps, id, version, false)).ok).toBe(false)
    expect(disparos).toEqual([])
    expect(await fila(id)).toMatchObject({ estado: "en_render", version })
  })

  it("refuses a stale screen and starts nothing", async () => {
    const id = await pieza("guion_por_aprobar")
    const { deps, disparos } = armar()

    expect((await pedirVoz(deps, id, (await versionDe(id)) - 1, false)).ok).toBe(false)
    expect(disparos).toEqual([])
  })
})

const LINKEDIN_OK = [
  "Llevan diez años juntos y ya casi no se tocan.",
  ...Array.from({ length: 12 }, () => "Cuando hablamos de límites conviene partir por lo que sí podemos observar."),
  "¿En qué momento del día te cuesta más desconectarte?",
  AVISO_AVATAR_LINKEDIN,
  "#limites #psicologia",
].join("\n\n")

const BLOQUEA_LINKEDIN = JSON.stringify([
  { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso en LinkedIn.", campo: "linkedin" },
])

// Two reels cannot share a minute and the pieces of earlier tests stay scheduled, so each approval takes its own.
let minuto = 0
const horaUnica = () => new Date(Date.UTC(2097, 0, 1, 0, minuto++)).toISOString()

describe("aprobarVideo con destinos", () => {
  async function paraAprobar(extra: Record<string, unknown> = {}) {
    return pieza("video_por_aprobar", { texto: TEXTO_VALIDO, texto_linkedin: LINKEDIN_OK, ...extra })
  }

  it("approves with LinkedIn: formula 2 binds both texts and the destinations, and each destination gets its row", async () => {
    const id = await paraAprobar()
    const version = await versionDe(id)

    const resultado = await aprobarVideo(armar().deps, id, version, horaUnica(), ["instagram", "linkedin"])

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada).toMatchObject({
      estado: "programado",
      puerta2_formula: 2,
      destinos: ["instagram", "linkedin"],
      texto_linkedin: LINKEDIN_OK,
    })
    expect(guardada.puerta2_hash_texto).toBe(
      hashTextoDePuerta2(2, { texto: TEXTO_VALIDO, textoLinkedin: LINKEDIN_OK, destinos: ["instagram", "linkedin"] }),
    )
    expect(await publicacionesDe(id)).toEqual([
      { destino: "instagram", estado: "esperando", enlace: null },
      { destino: "linkedin", estado: "esperando", enlace: null },
    ])
  })

  it("stores the destinations in the canonical order whatever order the screen sent", async () => {
    const id = await paraAprobar()

    await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["linkedin", "instagram"])

    expect((await fila(id)).destinos).toEqual(["instagram", "linkedin"])
  })

  it("approves LinkedIn alone", async () => {
    const id = await paraAprobar()

    const resultado = await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["linkedin"])

    expect(resultado.ok).toBe(true)
    expect(await publicacionesDe(id)).toEqual([{ destino: "linkedin", estado: "esperando", enlace: null }])
  })

  it("leaves the LinkedIn text out of the hash when only Instagram is chosen", async () => {
    const id = await paraAprobar()

    await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["instagram"])

    expect((await fila(id)).puerta2_hash_texto).toBe(
      hashTextoDePuerta2(2, { texto: TEXTO_VALIDO, textoLinkedin: null, destinos: ["instagram"] }),
    )
  })

  it("keeps LinkedIn uploaded across a withdrawal and a new approval, and refuses a choice with nothing left to upload", async () => {
    const id = await pieza("programado", {}, { destinos: ["instagram", "linkedin"], textoLinkedin: LINKEDIN_OK })
    const { deps } = armar()
    await marcarSubidoAMano(deps, id, await versionDe(id), "linkedin", "")
    await cambiarFecha(deps, id, await versionDe(id))
    expect(await publicacionesDe(id)).toEqual([{ destino: "linkedin", estado: "subido_a_mano", enlace: null }])

    expect(await aprobarVideo(deps, id, await versionDe(id), horaUnica(), ["linkedin"])).toEqual({
      ok: false,
      error: "Eso ya lo subiste. Elige otro destino.",
    })
    expect((await aprobarVideo(deps, id, await versionDe(id), horaUnica(), ["instagram", "linkedin"])).ok).toBe(true)
    expect(await publicacionesDe(id)).toEqual([
      { destino: "instagram", estado: "esperando", enlace: null },
      { destino: "linkedin", estado: "subido_a_mano", enlace: null },
    ])
  })

  it("refuses an empty, unknown or repeated choice of destinations", async () => {
    const id = await paraAprobar()
    for (const destinos of [[], ["tiktok"], ["instagram", "instagram"]]) {
      const resultado = await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), destinos)
      expect(resultado).toEqual({ ok: false, error: "Elige al menos un destino." })
    }
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses LinkedIn when the piece has no LinkedIn text", async () => {
    const id = await paraAprobar({ texto_linkedin: null })

    const resultado = await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["instagram", "linkedin"])

    expect(resultado).toEqual({ ok: false, error: "Falta el texto para LinkedIn." })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses LinkedIn while its text has a blocking finding, and says which", async () => {
    const id = await paraAprobar({ revision: BLOQUEA_LINKEDIN })

    const resultado = await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["linkedin"])

    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.error).toContain("Falta el aviso en LinkedIn.")
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("lets Instagram go out alone when only the LinkedIn text blocks", async () => {
    const id = await paraAprobar({ revision: BLOQUEA_LINKEDIN })

    const resultado = await aprobarVideo(armar().deps, id, await versionDe(id), horaUnica(), ["instagram"])

    expect(resultado.ok).toBe(true)
    expect(await publicacionesDe(id)).toEqual([{ destino: "instagram", estado: "esperando", enlace: null }])
  })

  it("does not let a LinkedIn warning block, and a caption finding still blocks whatever the destinations", async () => {
    const aviso = JSON.stringify([
      { regla: "hashtags_linkedin", tipo: "advierte", mensaje: "Demasiados hashtags.", campo: "linkedin" },
    ])
    const conAviso = await paraAprobar({ revision: aviso })
    expect((await aprobarVideo(armar().deps, conAviso, await versionDe(conAviso), horaUnica(), ["linkedin"])).ok).toBe(
      true,
    )

    const delTexto = await paraAprobar({
      revision: JSON.stringify([{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso." }]),
    })
    const resultado = await aprobarVideo(armar().deps, delTexto, await versionDe(delTexto), horaUnica(), ["linkedin"])
    expect(resultado.ok).toBe(false)
  })

  it("refuses when the LinkedIn text changed after she opened the screen", async () => {
    const id = await paraAprobar()
    const versionVista = await versionDe(id)
    await ajustarComoPostgres(id, { texto_linkedin: `${LINKEDIN_OK}\n\nUna línea que no vio.` })

    const resultado = await aprobarVideo(armar().deps, id, versionVista, horaUnica(), ["instagram", "linkedin"])

    expect(resultado).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
  })
})

describe("editarTextoLinkedin", () => {
  it("normalises, reviews with LinkedIn's rules and saves, keeping the other findings and Claude's judgments", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO, texto_linkedin: LINKEDIN_OK })
    const judicio = { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Confirma la cifra.", frase: "x" }
    await ajustarComoPostgres(id, { revision: JSON.stringify([judicio]) })
    const sucio = "Hola.\r\nPrimera línea con café.\r\n#a #b #c #d\r\nSin aviso."

    const resultado = await editarTextoLinkedin(armar().deps, id, await versionDe(id), sucio)

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada.texto_linkedin).toBe("Hola.\nPrimera línea con café.\n#a #b #c #d\nSin aviso.")
    const reglas = (guardada.revision as { regla: string; campo?: string }[]).map((h) => [h.regla, h.campo])
    expect(reglas).toEqual(
      expect.arrayContaining([
        ["cifra_sin_verificar", undefined],
        ["aviso_avatar", "linkedin"],
        ["hashtags_linkedin", "linkedin"],
      ]),
    )
    expect(guardada.estado).toBe("video_por_aprobar")
  })

  it("drops Claude's findings that were about the old LinkedIn text and keeps the ones about the script and the caption", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO, texto_linkedin: LINKEDIN_OK })
    await ajustarComoPostgres(id, {
      revision: JSON.stringify([
        { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "De LinkedIn.", frase: "x", campo: "linkedin" },
        { regla: "diagnostico", tipo: "advierte", mensaje: "Del texto.", frase: "y" },
      ]),
    })

    await editarTextoLinkedin(armar().deps, id, await versionDe(id), `${LINKEDIN_OK} Más.`)

    expect(((await fila(id)).revision as { mensaje: string }[]).map((h) => h.mensaje)).toEqual(["Del texto."])
  })

  it("replaces the earlier review of the LinkedIn text instead of adding to it", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO, texto_linkedin: "Sin aviso." })
    await ajustarComoPostgres(id, { revision: BLOQUEA_LINKEDIN })

    await editarTextoLinkedin(armar().deps, id, await versionDe(id), LINKEDIN_OK)

    expect((await fila(id)).revision).toEqual([])
  })

  it("asks for the help lines in the text when the idea of the piece needs them", async () => {
    const idea = await sembrarIdea({ alertas: [{ tipo: "líneas de ayuda", texto: "Violencia." }] })
    ideasCreadas.push(idea)
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO, idea_id: idea })

    await editarTextoLinkedin(armar().deps, id, await versionDe(id), LINKEDIN_OK)

    expect((await fila(id)).revision).toEqual([
      expect.objectContaining({ regla: "lineas_ayuda", tipo: "bloquea", campo: "linkedin" }),
    ])
  })

  it("refuses an empty text and a text over 3000 characters", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO })
    const { deps } = armar()

    expect(await editarTextoLinkedin(deps, id, await versionDe(id), "  \n ")).toEqual({
      ok: false,
      error: "El texto no puede quedar vacío.",
    })
    expect(await editarTextoLinkedin(deps, id, await versionDe(id), "a".repeat(3001))).toEqual({
      ok: false,
      error: "LinkedIn acepta hasta 3.000 caracteres en el texto.",
    })
  })

  it("leaves her voice alone: the LinkedIn text is not part of gate 1", async () => {
    const id = await pieza("guion_por_aprobar", { texto: TEXTO_VALIDO, audio_id: "voces/x.mp3" })
    const antes = await fila(id)
    const { deps, disparos } = armar()

    const resultado = await editarTextoLinkedin(deps, id, antes.version, LINKEDIN_OK)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      audio_id: "voces/x.mp3",
      texto_linkedin: LINKEDIN_OK,
    })
    expect(disparos).toEqual([])
  })

  it("takes gate 2 back and the rows with it when the piece was scheduled", async () => {
    const id = await pieza("programado", {}, { destinos: ["instagram", "linkedin"], textoLinkedin: LINKEDIN_OK })
    expect(await publicacionesDe(id)).toHaveLength(2)

    const resultado = await editarTextoLinkedin(armar().deps, id, await versionDe(id), `${LINKEDIN_OK} Más.`)

    expect(resultado.ok).toBe(true)
    expect(await fila(id)).toMatchObject({ estado: "video_por_aprobar", puerta2_hash_texto: null })
    expect(await publicacionesDe(id)).toEqual([])
  })

  it("refuses a stale screen and a piece that is no longer editable", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO })
    const { deps } = armar()
    const vista = await versionDe(id)
    expect(await editarTextoLinkedin(deps, id, vista - 1, LINKEDIN_OK)).toEqual({
      ok: false,
      error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla.",
    })
    const enRender = await pieza("en_render", { texto: TEXTO_VALIDO })
    expect((await editarTextoLinkedin(deps, enRender, await versionDe(enRender), LINKEDIN_OK)).ok).toBe(false)
  })

  it("does not let the maintainer edit it", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO })
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await editarTextoLinkedin(
      armar(await clienteDelMantenedor()).deps,
      id,
      await versionDe(id),
      LINKEDIN_OK,
    )

    expect(resultado.ok).toBe(false)
    expect((await fila(id)).texto_linkedin).toBeNull()
  })

  it("leaves Coni, not the service role, as the actor of the edit in the audit log", async () => {
    const id = await pieza("video_por_aprobar", { texto: TEXTO_VALIDO })

    await editarTextoLinkedin(armar().deps, id, await versionDe(id), LINKEDIN_OK)

    const { rows } = await pool.query(
      "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
      [id],
    )
    expect(rows[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
  })
})

describe("marcarSubidoAMano por destino", () => {
  const ENLACE = "https://www.instagram.com/reel/DAbc123xyz/"
  const ENLACE_LINKEDIN = "https://www.linkedin.com/posts/coni_abc-123"
  const AMBOS = { destinos: ["instagram", "linkedin"], textoLinkedin: LINKEDIN_OK } as const

  it("marks only LinkedIn and keeps the piece waiting for Instagram, with the link she pasted", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)

    const resultado = await marcarSubidoAMano(
      armar().deps,
      id,
      await versionDe(id),
      "linkedin",
      `${ENLACE_LINKEDIN}?utm=x`,
    )

    expect(resultado.ok).toBe(true)
    expect((await fila(id)).estado).toBe("para_subir_a_mano")
    expect(await publicacionesDe(id)).toEqual([
      { destino: "instagram", estado: "para_subir", enlace: null },
      { destino: "linkedin", estado: "subido_a_mano", enlace: ENLACE_LINKEDIN },
    ])
  })

  it("finishes the piece with the last destination and keeps the Instagram link in the piece", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)
    const { deps } = armar()
    await marcarSubidoAMano(deps, id, await versionDe(id), "linkedin", "")

    await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", `${ENLACE}?igsh=abc`)

    expect(await fila(id)).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE })
  })

  it("refuses a link that is not LinkedIn's and leaves the destination waiting", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)

    const resultado = await marcarSubidoAMano(
      armar().deps,
      id,
      await versionDe(id),
      "linkedin",
      "https://evil.example/x",
    )

    expect(resultado).toEqual({ ok: false, error: "Ese enlace no parece de LinkedIn. Puedes dejarlo vacío." })
    expect((await publicacionesDe(id)).map((p) => p.estado)).toEqual(["para_subir", "para_subir"])
  })

  it("does not take an Instagram link for a LinkedIn one, or the other way round", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)
    const { deps } = armar()

    expect((await marcarSubidoAMano(deps, id, await versionDe(id), "linkedin", ENLACE)).ok).toBe(false)
    expect((await marcarSubidoAMano(deps, id, await versionDe(id), "instagram", ENLACE_LINKEDIN)).ok).toBe(false)
  })

  it("refuses a destination that already was marked, one the piece does not have, and an unknown one", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)
    const { deps } = armar()
    await marcarSubidoAMano(deps, id, await versionDe(id), "linkedin", "")

    expect(await marcarSubidoAMano(deps, id, await versionDe(id), "linkedin", "")).toEqual({
      ok: false,
      error: "Ese destino ya no está esperando que lo subas.",
    })
    const soloInstagram = await pieza("para_subir_a_mano")
    expect((await marcarSubidoAMano(deps, soloInstagram, await versionDe(soloInstagram), "linkedin", "")).ok).toBe(
      false,
    )
    expect((await marcarSubidoAMano(deps, soloInstagram, await versionDe(soloInstagram), "tiktok", "")).ok).toBe(false)
    expect((await fila(soloInstagram)).estado).toBe("para_subir_a_mano")
  })

  it("refuses to say Instagram was uploaded by hand while it is connected and the piece is scheduled", async () => {
    const id = await pieza("programado", {}, AMBOS)
    await pool.query("update public.ajustes set meta_cuenta_id = '17841400000000001'")
    try {
      const resultado = await marcarSubidoAMano(armar().deps, id, await versionDe(id), "instagram", "")
      expect(resultado).toEqual({
        ok: false,
        error: "Instagram está conectado: este reel sale solo a la hora aprobada.",
      })
      expect((await publicacionesDe(id)).map((p) => p.estado)).toEqual(["esperando", "esperando"])
    } finally {
      await pool.query("update public.ajustes set meta_cuenta_id = null")
    }
  })

  it("tells her LinkedIn goes out by itself while it is connected, and waits for the check when a send is in doubt", async () => {
    const id = await pieza("programado", {}, AMBOS)
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_token_expira_en = now() + interval '30 days', linkedin_conectado_en = now()",
    )
    try {
      expect(await marcarSubidoAMano(armar().deps, id, await versionDe(id), "linkedin", "")).toEqual({
        ok: false,
        error: "LinkedIn está conectado: este reel sale solo a la hora aprobada.",
      })
      await pool.query(
        "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1 and destino = 'linkedin'",
        [id],
      )
      await pool.query(
        "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
      )
      expect(await marcarSubidoAMano(armar().deps, id, await versionDe(id), "linkedin", "")).toEqual({
        ok: false,
        error:
          "LinkedIn puede haber publicado este video. Espera mi aviso para revisarlo en tu perfil antes de subirlo.",
      })
    } finally {
      await pool.query(
        "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
      )
    }
  })

  it("lets her mark LinkedIn before its time while the piece is still programado", async () => {
    const id = await pieza("programado", {}, AMBOS)

    const resultado = await marcarSubidoAMano(armar().deps, id, await versionDe(id), "linkedin", "")

    expect(resultado.ok).toBe(true)
    expect((await fila(id)).estado).toBe("programado")
    expect((await publicacionesDe(id)).map((p) => p.estado)).toEqual(["esperando", "subido_a_mano"])
  })

  it("refuses a stale screen with the message for Coni", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)
    const vista = await versionDe(id)

    const resultado = await marcarSubidoAMano(armar().deps, id, vista - 1, "linkedin", "")

    expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
  })

  it("does not let the maintainer say a destination was uploaded", async () => {
    const id = await pieza("para_subir_a_mano", {}, AMBOS)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await marcarSubidoAMano(
      armar(await clienteDelMantenedor()).deps,
      id,
      await versionDe(id),
      "linkedin",
      "",
    )

    expect(resultado.ok).toBe(false)
    expect((await publicacionesDe(id)).map((p) => p.estado)).toEqual(["para_subir", "para_subir"])
  })
})
