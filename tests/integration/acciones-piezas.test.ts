import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  aprobarGuion,
  aprobarVideo,
  cambiarFecha,
  type DepsAcciones,
  descartar,
  editarTexto,
  elegirIdeas,
  marcarSubidoAMano,
  pedirCambios,
  pedirDescargaDelVideo,
  regrabar,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { hashPuerta1, hashTexto } from "@/lib/dominio/puertas"
import { CIERRE } from "@/lib/dominio/revision"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, comoConi, pool } from "./db"
import { AUDIO, aplicar, TEXTO, VIDEO } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, leerFila, sembrarIdea, sembrarPieza } from "./siembra"

type Db = SupabaseClient<Database>

const GUION_VALIDO = readFileSync(
  join(__dirname, "../fixtures/goldens/2026-09-30-deseo-se-esconde/guion.txt"),
  "utf-8",
).trim()
const TEXTO_VALIDO = "El deseo no se apaga, se esconde. Video hecho con mi avatar digital."
const FUTURO = "2099-10-09T19:00:00-03:00"

let coni: Db
let servicio: Db
const piezasCreadas: string[] = []
const ideasCreadas: string[] = []

interface Disparo {
  tarea: "producir" | "grabar"
  piezaId: string
  clave: string
}

function armar(db: Db = coni, fallos: { grabar?: Error; producir?: Error } = {}) {
  const disparos: Disparo[] = []
  const deps: DepsAcciones = {
    db,
    disparar: {
      async producir(piezaId, clave) {
        if (fallos.producir) throw fallos.producir
        disparos.push({ tarea: "producir", piezaId, clave })
      },
      async grabar(piezaId, clave) {
        if (fallos.grabar) throw fallos.grabar
        disparos.push({ tarea: "grabar", piezaId, clave })
      },
    },
    ahora: () => new Date().toISOString(),
  }
  return { deps, disparos }
}

async function pieza(destino: Parameters<typeof sembrarPieza>[0], ajustes: Record<string, unknown> = {}) {
  const id = await sembrarPieza(destino, ajustes)
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

describe("aprobarGuion", () => {
  async function paraAprobar() {
    return pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  }

  it("approves as Coni, binds the hash of what she saw and starts the recording", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()
    const versionVista = await versionDe(id)

    const resultado = await aprobarGuion(deps, id, versionVista)

    expect(resultado).toMatchObject({ ok: true })
    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "en_render", puerta1_por: CONI, version: versionVista + 1 })
    expect(guardada.puerta1_hash).toBe(hashPuerta1({ guion: GUION_VALIDO, audioId: AUDIO }))
    expect(disparos).toHaveLength(1)
    expect(disparos[0]).toMatchObject({ tarea: "grabar", piezaId: id })
    expect(disparos[0]?.clave).toContain(guardada.puerta1_hash.slice(0, 16))
  })

  it("refuses with a message for Coni when the piece changed after she opened it", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar()

    const resultado = await aprobarGuion(deps, id, (await versionDe(id)) - 1)

    expect(resultado).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
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

    const resultado = await aprobarGuion(deps, id, version)

    expect(resultado).toMatchObject({ ok: false })
    expect(!resultado.ok && resultado.error).toContain("El guion tiene que terminar con")
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar" })
    expect(disparos).toEqual([])
  })

  it("refuses a piece that is not waiting for the script gate", async () => {
    const id = await pieza("video_por_aprobar")
    const { deps } = armar()

    const resultado = await aprobarGuion(deps, id, (await fila(id)).version)

    expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
  })

  it("does not let the maintainer approve", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar(await clienteDelMantenedor())
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await aprobarGuion(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: false })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("does not let service_role approve either: the database records Coni or nobody", async () => {
    const id = await paraAprobar()
    const { deps, disparos } = armar(servicio)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await aprobarGuion(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: false })
    expect(await fila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })
    expect(disparos).toEqual([])
  })

  it("stays approved and tells Coni when the recording could not be started", async () => {
    const id = await paraAprobar()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { deps } = armar(coni, { grabar: new Error("Trigger.dev no responde") })

    const resultado = await aprobarGuion(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: true })
    expect(resultado.ok && resultado.advertencia).toMatch(/grabación/i)
    expect(await fila(id)).toMatchObject({ estado: "en_render" })
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

    const resultado = await aprobarVideo(deps, id, version, FUTURO)

    expect(resultado.ok).toBe(true)
    const guardada = await fila(id)
    expect(guardada).toMatchObject({ estado: "programado", puerta2_por: CONI, puerta2_video_id: VIDEO })
    expect(guardada.puerta2_hash_texto).toBe(hashTexto(TEXTO_VALIDO))
    expect(new Date(guardada.puerta2_publicar_en).toISOString()).toBe("2099-10-09T22:00:00.000Z")
  })

  it("refuses a date that already passed", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, "2020-01-01T19:00:00-03:00")

    expect(resultado).toEqual({ ok: false, error: "La fecha de publicación ya pasó. Elige una hora futura." })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses a date without an explicit offset, which would be read in the server's zone", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, "2099-10-09T19:00:00")

    expect(resultado).toEqual({ ok: false, error: "La fecha de publicación no es válida." })
  })

  it("refuses when the caption or the video changed after she opened the screen", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const versionVista = (await fila(id)).version
    await ajustarComoPostgres(id, {
      texto: "Otro texto. Video hecho con mi avatar digital.",
    })

    const resultado = await aprobarVideo(deps, id, versionVista, FUTURO)

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

    const resultado = await aprobarVideo(deps, id, version, FUTURO)

    expect(resultado).toMatchObject({ ok: false })
    expect(!resultado.ok && resultado.error).toContain("Falta el aviso de avatar.")
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("refuses a time that another reel already has, so two never go out together", async () => {
    const primera = await paraAprobar()
    const segunda = await paraAprobar()
    const { deps } = armar()
    const hora = "2098-03-03T19:00:00-03:00"
    expect(await aprobarVideo(deps, primera, await versionDe(primera), hora)).toMatchObject({ ok: true })

    const resultado = await aprobarVideo(deps, segunda, await versionDe(segunda), hora)

    expect(resultado).toEqual({ ok: false, error: "Ese horario ya lo tiene otro reel. Elige otro." })
    expect((await fila(segunda)).estado).toBe("video_por_aprobar")
  })

  it("does not let the maintainer schedule", async () => {
    const id = await paraAprobar()
    const { deps } = armar(await clienteDelMantenedor())
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const version = (await fila(id)).version

    const resultado = await aprobarVideo(deps, id, version, FUTURO)

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
    expect(disparos).toMatchObject([{ tarea: "grabar", piezaId: id }])
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
    expect(disparos).toMatchObject([{ tarea: "grabar", piezaId: id }])
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
    const id = await pieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
    const { deps } = armar(coni, { grabar: new FallaDeConfiguracion("Falta TRIGGER_SECRET_KEY") })

    const resultado = await aprobarGuion(deps, id, await versionDe(id))

    expect(resultado).toMatchObject({ ok: true })
    expect(registro).toHaveBeenCalled()
  })
})

describe("subir a mano", () => {
  const ENLACE = "https://www.instagram.com/reel/DAbc123xyz/"

  async function ultimoEvento(id: string) {
    const { rows } = await pool.query(
      "select actor_usuario, actor_rol, datos ->> 'estado' as estado from public.eventos where pieza_id = $1 order by id desc limit 1",
      [id],
    )
    return rows[0]
  }

  it("marks a piece as uploaded by hand as Coni, with her name in the audit log", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "")

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

    await marcarSubidoAMano(deps, id, await versionDe(id), `${ENLACE}?igsh=abc`)

    expect(await fila(id)).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE })
  })

  it("lets her mark a scheduled piece before its time, so the scheduled publication cannot also happen", async () => {
    const id = await pieza("programado")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "")

    expect(resultado.ok).toBe(true)
    expect((await fila(id)).estado).toBe("publicado_a_mano")
  })

  it("refuses a link that is not Instagram's and leaves the piece as it was", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar()

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "https://malo.example/reel/abc")

    expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("enlace") })
    expect((await fila(id)).estado).toBe("para_subir_a_mano")
  })

  it("refuses a piece that is not waiting to be uploaded, and a screen that went stale", async () => {
    const enAprobacion = await pieza("video_por_aprobar")
    expect(await marcarSubidoAMano(armar().deps, enAprobacion, await versionDe(enAprobacion), "")).toMatchObject({
      ok: false,
    })
    const espera = await pieza("para_subir_a_mano")
    const vista = await versionDe(espera)
    expect(await marcarSubidoAMano(armar().deps, espera, vista - 1, "")).toMatchObject({ ok: false })
    expect((await fila(espera)).estado).toBe("para_subir_a_mano")
  })

  it("does not let the maintainer say a reel was uploaded", async () => {
    const id = await pieza("para_subir_a_mano")
    const { deps } = armar(await clienteDelMantenedor())

    const resultado = await marcarSubidoAMano(deps, id, await versionDe(id), "")

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
