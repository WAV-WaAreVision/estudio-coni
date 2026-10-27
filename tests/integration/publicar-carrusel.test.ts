import { HttpResponse } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { aLittleText } from "@/lib/dominio/linkedin"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { EXPLICACION_LINKEDIN_TARDE, LINKEDIN_SIN_CONEXION } from "@/lib/publicacion/linkedin"
import {
  EXPLICACION_LINKEDIN_CARRUSEL,
  EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL,
} from "@/lib/publicacion/linkedin-carrusel"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { DOCUMENTO, simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { despues, PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const TITULO = "Lo que un chatbot no ve de ti"
const PDF = new TextEncoder().encode("%PDF-1.7 el aprobado")
const creadas: string[] = []
afterAll(() => pool.end())
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
  await desconectar()
})

async function conectar(expira = "2031-12-31T00:00:00Z") {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [expira],
  )
}

async function desconectar() {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
}

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

/** The R2 key of the PDF gate 2 bound (`piezas.puerta2_carrusel_id`). */
async function pdfAprobado(id: string): Promise<string> {
  const { rows } = await pool.query<{ pdf_clave: string }>(
    "select c.pdf_clave from public.carruseles c join public.piezas p on p.puerta2_carrusel_id = c.id where p.id = $1",
    [id],
  )
  const clave = rows[0]?.pdf_clave
  if (!clave) throw new Error("El carrusel programado no tiene PDF aprobado")
  return clave
}

/** Changes the words of the bound version behind the database's back (its trigger forbids it), as a bug would. */
async function cambiarElTextoAprobado(id: string): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query("alter table public.carruseles disable trigger proteger_carrusel")
    await c.query(
      "update public.carruseles set texto_post = texto_post || ' (cambiado)' where id = (select puerta2_carrusel_id from public.piezas where id = $1)",
      [id],
    )
    await c.query("alter table public.carruseles enable trigger proteger_carrusel")
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

/** Signed for a far future time (the real flow refuses a past one); the run's clock is moved to it. */
async function programado(d: ReturnType<typeof doble>) {
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  await d.almacen.subir(await pdfAprobado(id), PDF, "application/pdf")
  return id
}

describe("a scheduled carousel with LinkedIn connected (part 3)", () => {
  beforeEach(async () => {
    await conectar()
  })

  it("uploads the approved PDF, posts the approved text with the cover as title and closes as publicado", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ documentos: ["PROCESSING", "AVAILABLE"] })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

    expect(sim.documentosIniciados).toEqual([{ initializeUploadRequest: { owner: "urn:li:person:abc123XYZ" } }])
    expect(sim.subidasDeDocumento.map((s) => s.datos)).toEqual([PDF])
    expect(sim.posts).toHaveLength(1)
    expect(sim.posts[0]).toMatchObject({
      author: "urn:li:person:abc123XYZ",
      commentary: aLittleText(TEXTO_POST_DE_PRUEBA),
      content: { media: { id: DOCUMENTO, title: LAMINAS_DE_PRUEBA[0]?.texto } },
    })
    // C11: a carousel is signed "Constanza del Rosario"; it needs no avatar line and still goes out.
    expect(TEXTO_POST_DE_PRUEBA).not.toContain(AVISO_AVATAR_LINKEDIN)
    expect(await publicacionesConDetalle(id)).toMatchObject([
      {
        destino: "linkedin",
        estado: "publicado",
        post_urn: "urn:li:share:71",
        enlace: "https://www.linkedin.com/feed/update/urn:li:share:71/",
      },
    ])
    expect((await leerFila(id)).estado).toBe("publicado")
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContain(
      `Tu carrusel «${TITULO}» se publicó en LinkedIn. Míralo aquí: https://www.linkedin.com/feed/update/urn:li:share:71/`,
    )
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("waits before its time", async () => {
    const d = doble(() => despues(-10))
    const id = await programado(d)
    const sim = simularLinkedin()
    expect(await publicarPendientes(d.deps)).toEqual([])
    expect((await leerFila(id)).estado).toBe("programado")
    expect(sim.documentosIniciados).toHaveLength(0)
  })

  it("keeps the piece while the document processes and resumes without uploading again", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ documentos: ["PROCESSING"] })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await leerFila(id)).estado).toBe("programado")
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ documento_urn: DOCUMENTO, estado: "esperando" })

    const sim2 = simularLinkedin({ documentos: ["AVAILABLE"] })
    const d2 = doble(() => despues(6))
    expect(await publicarPendientes(d2.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim2.documentosIniciados).toHaveLength(0)
    expect(sim2.posts).toHaveLength(1)
  })

  it("counts a temporary failure as one try and keeps the piece for the next tick", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ iniciarDocumento: () => new HttpResponse("ocupado", { status: 503 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesConDetalle(id))[0]).toMatchObject({ estado: "esperando", intentos: 1 })
    expect((await leerFila(id)).estado).toBe("programado")
  })

  it("counts a store that does not answer as a try", async () => {
    const d = doble(() => despues(1))
    const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
    creadas.push(id)
    simularLinkedin()
    // No PDF in the store: `bajar` throws as R2 not answering would.
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesConDetalle(id))[0]?.intentos).toBe(1)
  })

  it("drops a document that failed processing, uploads again, and goes by hand after the maximum", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ documentos: ["PROCESSING_FAILED"] })

    for (const minuto of [1, 2, 3]) {
      const corrida = doble(() => despues(minuto))
      await corrida.almacen.subir(await pdfAprobado(id), PDF, "application/pdf")
      expect(await publicarPendientes(corrida.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
      expect((await publicacionesConDetalle(id))[0]).toMatchObject({ documento_urn: null, intentos: minuto })
    }
    expect(sim.documentosIniciados).toHaveLength(3)

    const ultima = doble(() => despues(4))
    expect(await publicarPendientes(ultima.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_CARRUSEL)
  })

  it("goes by hand at once when LinkedIn rejects the PDF", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    simularLinkedin({ iniciarDocumento: () => HttpResponse.json({ status: 422 }, { status: 422 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_CARRUSEL)
  })

  it("goes by hand without sending her token when LinkedIn hands out an upload address that is not its own", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({
      iniciarDocumento: () =>
        HttpResponse.json({
          value: {
            uploadUrlExpiresAt: 4_102_444_800_000,
            uploadUrl: "https://subidas.atacante.test/u",
            document: DOCUMENTO,
          },
        }),
    })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.subidasDeDocumento).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({ estado: "para_subir", explicacion: EXPLICACION_LINKEDIN_CARRUSEL, enviado_en: null })
  })

  it("goes by hand with the doubt text when the post fails after the reservation, and never posts again", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({ post: () => new HttpResponse("caído", { status: 500 }) })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila).toMatchObject({ estado: "para_subir", explicacion: EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL })
    expect(fila?.enviado_en).not.toBeNull()
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["LinkedIn quizá publicó un carrusel: revisa el perfil"])

    const sim2 = simularLinkedin()
    expect(await publicarPendientes(doble(() => despues(2)).deps)).toEqual([])
    expect(sim2.posts).toHaveLength(0)
  })

  it("never posts again when an earlier run reserved the send and lost the answer", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2, enviado_en = now() where pieza_id = $1", [
      id,
      DOCUMENTO,
    ])
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    expect(sim.consultasDeDocumento).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL)
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["LinkedIn quizá publicó un carrusel: revisa el perfil"])
  })

  it("settles a doubtful send even when the connection is gone", async () => {
    await desconectar()
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2, enviado_en = now() where pieza_id = $1", [
      id,
      DOCUMENTO,
    ])
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL)
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["LinkedIn quizá publicó un carrusel: revisa el perfil"])
  })

  it("never uploads again when the row already has its document", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.subidasDeDocumento).toHaveLength(0)
    expect(sim.posts).toHaveLength(1)
  })

  it("closes a carousel whose post was saved by a run that stopped before closing it", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await pool.query(
      `update public.publicaciones set documento_urn = $2, enviado_en = now(), estado = 'publicado',
         post_urn = 'urn:li:share:71', enlace = 'https://www.linkedin.com/feed/update/urn:li:share:71/', marcado_en = now()
       where pieza_id = $1`,
      [id, DOCUMENTO],
    )
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.posts).toHaveLength(0)
    expect((await leerFila(id)).estado).toBe("publicado")
  })

  it("uploads the PDF gate 2 bound, never a newer version's", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    // A newer version with the same words (as a design change would make), and its own PDF in the store.
    await pool.query(
      `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, diseno, pdf_clave)
       select pieza_id, version + 1, laminas, texto_post, hash_texto, 'cambio_diseno', '{"variante": "oscura"}', 'otro.pdf'
         from public.carruseles where id = (select puerta2_carrusel_id from public.piezas where id = $1)`,
      [id],
    )
    await d.almacen.subir("otro.pdf", new TextEncoder().encode("%PDF-1.7 otro"), "application/pdf")
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.subidasDeDocumento.map((s) => s.datos)).toEqual([PDF])
  })

  it("refuses a changed version before uploading anything", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    await cambiarElTextoAprobado(id)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({
      estado: "error_publicacion",
      explicacion:
        "El carrusel o su texto cambiaron después de que los aprobaste, así que no te lo dejé para subir. WAV ya está revisando.",
    })
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Falló la publicación de un carrusel"])
  })

  it("refuses a version that changed while LinkedIn processed it, before sending", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin({
      documento: async () => {
        await cambiarElTextoAprobado(id)
        return HttpResponse.json({ id: DOCUMENTO, status: "AVAILABLE" })
      },
    })

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.documentosIniciados).toHaveLength(1)
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.enviado_en).toBeNull()
  })
})

describe("a scheduled carousel that cannot post by itself", () => {
  const AVISO = `Tu carrusel «${TITULO}» está listo para que lo subas a LinkedIn. Entra a la app para descargar el PDF y copiar el texto.`

  it("goes by hand with the reason and no call to LinkedIn when LinkedIn is not connected", async () => {
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])

    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect(await publicacionesConDetalle(id)).toMatchObject([
      { destino: "linkedin", estado: "para_subir", explicacion: LINKEDIN_SIN_CONEXION },
    ])
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toEqual([`${AVISO} ${LINKEDIN_SIN_CONEXION}`])
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("goes by hand the same way when the connection expired before its time", async () => {
    await conectar("2031-03-01T00:00:00Z")
    const d = doble(() => despues(1))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(LINKEDIN_SIN_CONEXION)
  })

  it("goes by hand, never late, when the approved half hour passed", async () => {
    await conectar()
    const d = doble(() => despues(31))
    const id = await programado(d)
    const sim = simularLinkedin()

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.documentosIniciados).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_TARDE)
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toEqual([`${AVISO} ${EXPLICACION_LINKEDIN_TARDE}`])
    expect(d.avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["LinkedIn no publicó un carrusel"])
  })

  it("goes by hand when LinkedIn's own deadline passed while the document processed", async () => {
    await conectar()
    const d = doble(() => despues(13))
    const id = await programado(d)
    simularLinkedin()
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await publicacionesConDetalle(id))[0]?.explicacion).toBe(EXPLICACION_LINKEDIN_TARDE)
  })
})
