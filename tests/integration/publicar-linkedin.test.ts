import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
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
})
