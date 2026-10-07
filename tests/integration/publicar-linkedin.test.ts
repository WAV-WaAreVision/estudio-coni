import { HttpResponse } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { simularInstagram } from "../instagram-msw"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { VIDEO } from "./flujo"
import { crearProgramada, despues, limpiarProgramadas } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { publicacionesConDetalle } from "./siembra"

afterAll(() => pool.end())

const TEXTO_LINKEDIN = `¿Te cuesta poner límites (incluso con tu familia)?\n\n${AVISO_AVATAR_LINKEDIN}\n\n#SaludMental`
const SOLO_LINKEDIN = { destinos: ["linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN }
const VIDEO_BYTES = new Uint8Array(100_000)

function doble(ahora: () => string) {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  const deps: DepsPublicacion = {
    db: clienteDeServicio(),
    almacen,
    avisos,
    ahora,
    dormir: async () => {},
    sondeo: { cadaMs: 60_000, veces: 5 },
    sondeoLinkedin: { cadaMs: 15_000, veces: 8 },
  }
  return { deps, almacen, avisos }
}

async function conectarLinkedin(expira = "2031-12-31T00:00:00Z") {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [expira],
  )
}

async function estadoDe(id: string) {
  return (await pool.query("select estado, version from public.piezas where id = $1", [id])).rows[0]
}

beforeEach(async () => {
  await conectarLinkedin()
})
afterEach(async () => {
  await limpiarProgramadas()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

describe("publicarPendientes with LinkedIn connected", () => {
  it("uploads the approved video, posts the approved text as little text and closes the piece", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ estados: ["PROCESSING", "AVAILABLE"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

    expect(sim.iniciadas).toHaveLength(1)
    expect(sim.posts).toHaveLength(1)
    expect(sim.posts[0]).toMatchObject({
      author: "urn:li:person:abc123XYZ",
      commentary: expect.stringContaining("\\(incluso con tu familia\\)"),
      content: { media: { id: "urn:li:video:C5505AQprueba" } },
    })
    expect(String(sim.posts[0]?.commentary)).toContain("{hashtag|\\#|SaludMental}")
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({
      destino: "linkedin",
      estado: "publicado",
      post_urn: "urn:li:share:71",
      enlace: "https://www.linkedin.com/feed/update/urn:li:share:71/",
    })
    expect((await estadoDe(id)).estado).toBe("publicado")
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContainEqual(
      expect.stringContaining(
        "ya está publicado en LinkedIn. Míralo aquí: https://www.linkedin.com/feed/update/urn:li:share:71/",
      ),
    )
  })

  it("leaves the piece programado while the video is processing and resumes without uploading again", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ estados: ["PROCESSING"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await estadoDe(id)).estado).toBe("programado")
    expect(sim.posts).toHaveLength(0)

    const sim2 = simularLinkedin({ estados: ["AVAILABLE"] })
    // The first run holds the piece for 10 minutes: the next tick that finds the lease over resumes it.
    expect(await publicarPendientes(doble(() => despues(12)).deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim2.iniciadas).toHaveLength(0)
    expect(sim2.posts).toHaveLength(1)
  })

  it("never posts again when a previous run reserved the send and lost the answer", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    const sim = simularLinkedin()
    const d = doble(() => despues(1))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({ estado: "para_subir" })
    expect(fila.explicacion).toBe(
      "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí.",
    )
    expect(d.avisos.aWavEnviados).toHaveLength(1)
  })

  it("posts nothing when the LinkedIn text changed after gate 2", async () => {
    const id = await crearProgramada(undefined, { ...SOLO_LINKEDIN, aprobadoSobre: "otro texto aprobado" })
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
  })

  it("goes by hand without calling LinkedIn when it is not connected (phase 1 behavior)", async () => {
    await pool.query("delete from vault.secrets where name = 'linkedin'")
    await pool.query(
      "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
    )
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    expect(await publicarPendientes(doble(() => despues(1)).deps)).toEqual([
      { piezaId: id, resultado: "para_subir_a_mano" },
    ])
    expect(sim.iniciadas).toHaveLength(0)
  })

  it("goes by hand with a reason when the connection expired", async () => {
    await pool.query("update public.ajustes set linkedin_token_expira_en = '2031-03-14T21:00:00Z'")
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain(
      "LinkedIn no está conectado, así que te lo dejé para subir a mano.",
    )
  })

  it.each([
    [
      401,
      "LinkedIn pidió conectar de nuevo tu cuenta, así que te lo dejé para subir a mano. Renueva LinkedIn en Ajustes para los próximos.",
    ],
    [403, "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."],
    [426, "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."],
  ])(
    "handles %s on the upload when LinkedIn refuses: by hand with its reason, WAV told",
    async (status, explicacion) => {
      const id = await crearProgramada(undefined, SOLO_LINKEDIN)
      simularLinkedin({ iniciar: () => HttpResponse.json({ status }, { status }) })
      const d = doble(() => despues(1))
      await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

      expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
      const [fila] = await publicacionesConDetalle(id)
      expect(fila).toMatchObject({ estado: "para_subir", explicacion })
      expect(d.avisos.aConiEnviados[0]?.mensaje).toContain(explicacion)
      expect(d.avisos.aWavEnviados).toHaveLength(1)
    },
  )

  it("counts temporary failures and goes by hand after three", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    // Each run holds the piece for 10 minutes: the ticks that find the lease over are 12 minutes apart.
    for (let tick = 0; tick < 3; tick += 1) {
      simularLinkedin({ iniciar: () => new HttpResponse(null, { status: 503 }) })
      const d = doble(() => despues(1 + tick * 12))
      await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
      expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    }
    const sim = simularLinkedin()
    expect(await publicarPendientes(doble(() => despues(37)).deps)).toEqual([
      { piezaId: id, resultado: "para_subir_a_mano" },
    ])
    expect(sim.iniciadas).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ estado: "para_subir", intentos: 3 })
  })

  it("re-uploads after a failed processing, keeping count", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    simularLinkedin({ estados: ["PROCESSING_FAILED"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ video_urn: null, intentos: 1 })
  })

  it.each([
    ["a 500", () => new HttpResponse(null, { status: 500 })],
    [
      "a 422 duplicate",
      () => HttpResponse.json({ message: "Content is a duplicate of urn:li:share:1" }, { status: 422 }),
    ],
    ["a 201 without id", () => new HttpResponse(null, { status: 201 })],
  ])("handles %s on the post as in doubt: by hand, never sent again", async (_nombre, post) => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ post })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila.estado).toBe("para_subir")
    expect(fila.enviado_en).not.toBeNull()
    expect(fila.explicacion).toBe(
      "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí.",
    )
  })

  it("goes by hand when the half hour passed before sending, and never posts late", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(31))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(
      "No alcancé a publicarlo en LinkedIn dentro de la media hora que aprobaste, así que te lo dejé para subir a mano.",
    )
  })

  it("goes by hand when the video is under LinkedIn's minimum size", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, new Uint8Array(1000), "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
  })

  it("never sends a token to WAV or Coni", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    simularLinkedin({ iniciar: () => HttpResponse.json({ eco: "AQV_token_de_prueba" }, { status: 400 }) })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    await publicarPendientes(d.deps)
    const todo = JSON.stringify([d.avisos.aConiEnviados, d.avisos.aWavEnviados, await publicacionesConDetalle(id)])
    expect(todo).not.toContain("AQV_token_de_prueba")
  })
})

describe("Instagram and LinkedIn together", () => {
  const AMBOS = { destinos: ["instagram", "linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN }

  it("posts LinkedIn and hands Instagram over when Instagram is not connected", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    const filas = await publicacionesConDetalle(id)
    expect(filas.find((f) => f.destino === "linkedin")).toMatchObject({ estado: "publicado" })
    expect(filas.find((f) => f.destino === "instagram")).toMatchObject({ estado: "para_subir" })
    const mensajes = d.avisos.aConiEnviados.map((a) => a.mensaje)
    expect(mensajes.some((m) => m.includes("listo para que lo subas a Instagram"))).toBe(true)
    expect(mensajes.some((m) => m.includes("Ya salió en LinkedIn: https://www.linkedin.com/feed/update/"))).toBe(true)
  })

  it("closes as publicado_a_mano when Instagram was uploaded by hand early and LinkedIn goes out by itself", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    await pool.query(
      "update public.publicaciones set estado = 'subido_a_mano', marcado_en = now() where pieza_id = $1 and destino = 'instagram'",
      [id],
    )
    simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect((await estadoDe(id)).estado).toBe("publicado_a_mano")
  })

  it("hands both over with LinkedIn's reason when LinkedIn falls back and Instagram is by hand", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    simularLinkedin({ iniciar: () => HttpResponse.json({}, { status: 403 }) })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("Instagram y LinkedIn")
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("LinkedIn no aceptó la publicación")
  })

  it("publishes both by themselves when Instagram is connected too, and closes the piece as publicado", async () => {
    await pool.query("update public.ajustes set meta_cuenta_id = '17841400000000001'")
    await pool.query("select vault.create_secret('IGAA_token_de_prueba', 'meta')")
    try {
      const id = await crearProgramada(undefined, AMBOS)
      simularLinkedin()
      simularInstagram({ cuenta: "17841400000000001", estados: ["FINISHED"] })
      const d = doble(() => despues(1))
      await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

      expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
      expect((await estadoDe(id)).estado).toBe("publicado")
      const filas = await publicacionesConDetalle(id)
      expect(filas.map((f) => [f.destino, f.estado])).toEqual([
        ["instagram", "publicado"],
        ["linkedin", "publicado"],
      ])
    } finally {
      await pool.query("delete from vault.secrets where name = 'meta'")
      await pool.query("update public.ajustes set meta_cuenta_id = null")
    }
  })
})

describe("LinkedIn does not cost Instagram its window", () => {
  const AMBOS = { destinos: ["instagram", "linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN }
  const CUENTA = "17841400000000001"

  it("settles a doubtful send even when the connection is gone: it needs no token", async () => {
    const id = await crearProgramada(undefined, { destinos: ["linkedin"], textoLinkedin: TEXTO_LINKEDIN })
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    await pool.query("delete from vault.secrets where name = 'linkedin'")
    await pool.query(
      "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
    )
    const d = doble(() => despues(1))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({ estado: "para_subir" })
    expect(fila.explicacion).toBe(
      "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí.",
    )
  })
})
