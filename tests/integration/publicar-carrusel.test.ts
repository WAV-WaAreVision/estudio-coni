import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { aLittleText } from "@/lib/dominio/linkedin"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { EXPLICACION_LINKEDIN_TARDE, LINKEDIN_SIN_CONEXION } from "@/lib/publicacion/linkedin"
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
