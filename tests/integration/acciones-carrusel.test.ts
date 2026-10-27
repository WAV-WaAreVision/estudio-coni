import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { claveArmar, claveProducir } from "@/lib/acciones/disparos"
import {
  aprobarCarrusel,
  aprobarGuion,
  cambiarDisenoDeCarrusel,
  cambiarFecha,
  type DepsAcciones,
  descartar,
  editarTextoLinkedin,
  firmarCarrusel,
  hacerCarrusel,
  marcarSubidoAMano,
  pedirCambioDeCarrusel,
  pedirCambios,
  pedirDescargaDelCarrusel,
  pedirVoz,
  reintentar,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import type { Database } from "@/lib/supabase/database.types"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, leerFila, sembrarCarrusel, sembrarIdea } from "./siembra"

type Db = SupabaseClient<Database>
let coni: Db
const piezasCreadas: string[] = []
const ideasCreadas: string[] = []

interface Disparo {
  tarea: "producir" | "grabar" | "voz" | "armar"
  piezaId: string
  clave: string
}

function armar(fallos: { producir?: Error; armar?: Error } = {}) {
  const disparos: Disparo[] = []
  const deps: DepsAcciones = {
    db: coni,
    disparar: {
      async producir(piezaId, clave) {
        if (fallos.producir) throw fallos.producir
        disparos.push({ tarea: "producir", piezaId, clave })
      },
      async grabar(piezaId, clave) {
        disparos.push({ tarea: "grabar", piezaId, clave })
      },
      async voz(piezaId, clave) {
        disparos.push({ tarea: "voz", piezaId, clave })
      },
      async armar(piezaId, clave) {
        if (fallos.armar) throw fallos.armar
        disparos.push({ tarea: "armar", piezaId, clave })
      },
    },
    ahora: () => new Date().toISOString(),
  }
  return { deps, disparos }
}

async function idea(gancho = "Lo que un chatbot no ve de ti"): Promise<string> {
  const id = await sembrarIdea({ pilar: "ia-salud-mental", gancho })
  ideasCreadas.push(id)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
})

afterAll(async () => {
  await borrarSembrado(piezasCreadas, ideasCreadas)
  await pool.end()
})

describe("hacerCarrusel", () => {
  it("claims the idea, creates its LinkedIn carousel and starts writing it", async () => {
    const ideaId = await idea()
    const { deps, disparos } = armar()

    const resultado = await hacerCarrusel(deps, ideaId)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    piezasCreadas.push(resultado.piezaId)
    const fila = await leerFila(resultado.piezaId)
    expect(fila).toMatchObject({
      tipo: "carrusel",
      destinos: ["linkedin"],
      estado: "guion_en_proceso",
      titulo: "Lo que un chatbot no ve de ti",
      idea_id: ideaId,
    })
    expect((await pool.query("select estado from public.ideas where id = $1", [ideaId])).rows[0]).toEqual({
      estado: "usada",
    })
    expect(disparos).toEqual([{ tarea: "producir", piezaId: resultado.piezaId, clave: claveProducir(fila) }])
  })

  it("says so and starts nothing when the idea is no longer in the bank", async () => {
    const ideaId = await idea()
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [ideaId])
    const { deps, disparos } = armar()

    expect(await hacerCarrusel(deps, ideaId)).toEqual({
      ok: false,
      error: "Una de esas ideas ya no está disponible. Vuelve a elegir.",
    })
    expect(disparos).toEqual([])
  })

  it("leaves the carousel with its reason when writing does not start", async () => {
    const ideaId = await idea()
    const { deps } = armar({ producir: new Error("Trigger caído") })

    expect(await hacerCarrusel(deps, ideaId)).toEqual({
      ok: false,
      error: "No pude empezar a escribir el carrusel. Inténtalo de nuevo en unos minutos.",
    })
    const { rows } = await pool.query("select id, tipo, explicacion from public.piezas where idea_id = $1", [ideaId])
    piezasCreadas.push(...rows.map((r) => r.id))
    expect(rows).toMatchObject([
      { tipo: "carrusel", explicacion: "No pude empezar a escribir el carrusel. Inténtalo de nuevo." },
    ])
  })
})

const HASH = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })
const BLOQUEA = [
  {
    regla: "mencion_avatar",
    tipo: "bloquea",
    mensaje: "El carrusel lo firmas tú y no lleva avatar: quita la mención de la lámina.",
    frase: "avatar",
  },
]

async function carrusel(destino: Parameters<typeof sembrarCarrusel>[0] = "guion_por_aprobar", revision: unknown = []) {
  const id = await sembrarCarrusel(destino, { revision })
  piezasCreadas.push(id)
  return id
}
const versionDe = async (id: string) => (await leerFila(id)).version

describe("firmarCarrusel", () => {
  it("signs the latest version's text without an avatar and starts its render", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()
    const vista = await versionDe(id)

    expect(await firmarCarrusel(deps, id, vista)).toEqual({ ok: true, version: vista + 1 })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({
      estado: "armando_carrusel",
      puerta1_hash: HASH,
      puerta1_por: CONI,
      avatar_id: null,
      puerta1_formula: null,
    })
    const { rows } = await pool.query("select id from public.carruseles where pieza_id = $1", [id])
    expect(disparos).toEqual([{ tarea: "armar", piezaId: id, clave: claveArmar(id, rows[0].id, fila.intento) }])
  })

  it("keeps the signature with a warning when the render does not start", async () => {
    const id = await carrusel()
    const { deps } = armar({ armar: new Error("Trigger.dev no responde") })
    const resultado = await firmarCarrusel(deps, id, await versionDe(id))
    expect(resultado).toMatchObject({
      ok: true,
      advertencia: "Quedó firmado, pero las láminas tardan en armarse. Si no avanzan, te aviso.",
    })
    expect((await leerFila(id)).estado).toBe("armando_carrusel")
  })

  it("retries a failed render as a new attempt and starts it again", async () => {
    const id = await sembrarCarrusel("error_produccion")
    piezasCreadas.push(id)
    const { deps, disparos } = armar()

    expect((await reintentar(deps, id, await versionDe(id))).ok).toBe(true)

    const fila = await leerFila(id)
    expect(fila).toMatchObject({ estado: "armando_carrusel", estado_antes_del_error: null, explicacion: null })
    expect(disparos).toMatchObject([{ tarea: "armar", piezaId: id }])
  })

  it("refuses a screen that is out of date", async () => {
    const id = await carrusel()
    expect(await firmarCarrusel(armar().deps, id, (await versionDe(id)) - 1)).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
  })

  it("refuses while the review blocks", async () => {
    const id = await carrusel("guion_por_aprobar", BLOQUEA)
    const resultado = await firmarCarrusel(armar().deps, id, await versionDe(id))
    expect(resultado).toEqual({ ok: false, error: `Todavía no puedes aprobar. ${BLOQUEA[0]?.mensaje}` })
  })
})

describe("pedirCambioDeCarrusel", () => {
  it("takes a sentence of exactly 500 characters and says the bound as it is when she goes over", async () => {
    const id = await carrusel()
    const { deps } = armar()
    expect(await pedirCambioDeCarrusel(deps, id, await versionDe(id), "x".repeat(501))).toEqual({
      ok: false,
      error: "Escríbelo en 500 caracteres o menos.",
    })
    expect((await pedirCambioDeCarrusel(deps, id, await versionDe(id), "x".repeat(500))).ok).toBe(true)
  })

  it("sends it back with her sentence and starts the new text as a new round", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()

    expect(await pedirCambioDeCarrusel(deps, id, await versionDe(id), "  Más corto, con un ejemplo  ")).toEqual({
      ok: true,
    })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({
      estado: "guion_en_proceso",
      pedido_de_cambio: "Más corto, con un ejemplo",
      intento: 1,
    })
    expect(disparos).toEqual([{ tarea: "producir", piezaId: id, clave: claveProducir(fila) }])
  })

  it("asks for a sentence when there is none", async () => {
    const id = await carrusel()
    expect(await pedirCambioDeCarrusel(armar().deps, id, await versionDe(id), "   ")).toEqual({
      ok: false,
      error: "Escribe en una frase qué quieres cambiar.",
    })
  })

  it("stops after three changes and keeps the carousel where it is", async () => {
    const id = await carrusel()
    for (let v = 2; v <= 4; v++) {
      await pool.query(
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido) values ($1, $2, $3::jsonb, 'T', $4, 'cambio_texto', 'x')",
        [id, v, JSON.stringify(LAMINAS_DE_PRUEBA), HASH],
      )
    }
    // Her three requests, as pedir_cambio_de_carrusel counts them.
    await pool.query("update public.piezas set cambios_de_texto = 3, version = version + 1 where id = $1", [id])
    const { deps, disparos } = armar()
    expect(await pedirCambioDeCarrusel(deps, id, await versionDe(id), "Uno más")).toEqual({
      ok: false,
      error: "Ya pediste 3 cambios. Puedes firmarlo como está.",
    })
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
    expect(disparos).toEqual([])
  })
})

describe("the reel's gate 1 actions on a carousel", () => {
  it("refuse it and leave it untouched", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()
    const vista = await versionDe(id)
    for (const resultado of [
      await aprobarGuion(deps, id, vista, "look-a"),
      await pedirCambios(deps, id, vista),
      await pedirVoz(deps, id, vista, false),
    ]) {
      expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
    }
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", version: vista })
    expect(disparos).toEqual([])
  })
})

describe("reintentarGuion on a carousel", () => {
  it("words a run slow to start as the carousel's", async () => {
    const id = await sembrarCarrusel("guion_en_proceso")
    piezasCreadas.push(id)
    await pool.query("update public.piezas set explicacion = 'No pude.', version = version + 1 where id = $1", [id])
    const { deps } = armar({ producir: new Error("Trigger caído") })
    const { version } = await leerFila(id)

    expect(await reintentarGuion(deps, id, version)).toMatchObject({
      ok: true,
      advertencia: "Lo intenté otra vez, pero el carrusel tarda en partir. Si no avanza, vuelve a intentarlo.",
    })
  })
})

describe("descartar a carousel", () => {
  it("discards a carousel at gate 1", async () => {
    const id = await sembrarCarrusel("guion_por_aprobar")
    piezasCreadas.push(id)
    const { deps } = armar()

    const resultado = await descartar(deps, id, (await leerFila(id)).version)

    expect(resultado.ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "descartado", tipo: "carrusel" })
  })
})

const MANIANA = () => new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

async function enPuerta2() {
  const id = await sembrarCarrusel("carrusel_por_aprobar")
  piezasCreadas.push(id)
  const version = await leerVersionVigente(clienteDeServicio(), id)
  if (!version) throw new Error("sin versión")
  return { id, version }
}

describe("aprobarCarrusel", () => {
  it("schedules the version she saw at the time she chose, and its LinkedIn row waits", async () => {
    const { id, version } = await enPuerta2()
    const { deps, disparos } = armar()
    const publicarEn = MANIANA()

    expect(await aprobarCarrusel(deps, id, await versionDe(id), version.id, publicarEn)).toEqual({ ok: true })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({
      estado: "programado",
      puerta2_carrusel_id: version.id,
      puerta2_hash_texto: version.hashTexto,
      puerta2_video_id: null,
      puerta2_por: CONI,
    })
    expect(new Date(fila.puerta2_publicar_en).toISOString()).toBe(new Date(publicarEn).toISOString())
    expect(disparos).toEqual([])
  })

  it("refuses a version that is not the one on screen", async () => {
    const { id } = await enPuerta2()
    const resultado = await aprobarCarrusel(
      armar().deps,
      id,
      await versionDe(id),
      "11111111-1111-4111-8111-111111111111",
      MANIANA(),
    )
    expect(resultado).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect((await leerFila(id)).estado).toBe("carrusel_por_aprobar")
  })

  it("refuses a time another piece already has", async () => {
    const otra = await enPuerta2()
    const publicarEn = MANIANA()
    await aprobarCarrusel(armar().deps, otra.id, await versionDe(otra.id), otra.version.id, publicarEn)
    const { id, version } = await enPuerta2()
    expect(await aprobarCarrusel(armar().deps, id, await versionDe(id), version.id, publicarEn)).toEqual({
      ok: false,
      error: "Ese horario ya lo tiene otra pieza. Elige otro.",
    })
  })
})

describe("cambiarDisenoDeCarrusel", () => {
  it("writes a new version with the same words, keeps gate 1, does not count as a change and starts the render", async () => {
    const { id, version } = await enPuerta2()
    const { deps, disparos } = armar()

    const resultado = await cambiarDisenoDeCarrusel(deps, id, await versionDe(id), {
      tipo: "variante",
      variante: "oscura",
    })

    expect(resultado.ok).toBe(true)
    const nueva = await leerVersionVigente(clienteDeServicio(), id)
    expect(nueva).toMatchObject({
      origen: "cambio_diseno",
      hashTexto: version.hashTexto,
      diseno: { variante: "oscura" },
    })
    const fila = await leerFila(id)
    expect(fila).toMatchObject({ estado: "armando_carrusel", puerta1_hash: version.hashTexto, cambios_de_texto: 0 })
    expect(disparos).toEqual([{ tarea: "armar", piezaId: id, clave: claveArmar(id, nueva?.id ?? "", fila.intento) }])
  })

  it("splits a slide and merges it back, keeping the hash each time", async () => {
    const { id, version } = await enPuerta2()
    expect(
      (await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "dividir", lamina: 1 })).ok,
    ).toBe(true)
    expect((await leerVersionVigente(clienteDeServicio(), id))?.laminas).toHaveLength(version.laminas.length + 1)
    expect((await leerVersionVigente(clienteDeServicio(), id))?.hashTexto).toBe(version.hashTexto)
  })

  it("says why a change does not apply", async () => {
    const { id } = await enPuerta2()
    expect(await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "unir", lamina: 1 })).toEqual({
      ok: false,
      error: "Ese cambio de diseño no se puede hacer en esta lámina.",
    })
    expect(
      await cambiarDisenoDeCarrusel(armar().deps, id, await versionDe(id), { tipo: "variante", variante: "crema" }),
    ).toEqual({ ok: false, error: "Eso ya está así." })
  })
})

describe("gate 2's other ways out", () => {
  it("El texto: back to be rewritten, counting one of the three", async () => {
    const { id } = await enPuerta2()
    const { deps, disparos } = armar()
    expect((await pedirCambioDeCarrusel(deps, id, await versionDe(id), "Más cercano")).ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_en_proceso", cambios_de_texto: 1, puerta1_hash: null })
    expect(disparos).toMatchObject([{ tarea: "producir", piezaId: id }])
  })

  it("Cambiar la fecha: a scheduled carousel goes back to its gate 2", async () => {
    const id = await sembrarCarrusel("programado")
    piezasCreadas.push(id)
    expect((await cambiarFecha(armar().deps, id, await versionDe(id))).ok).toBe(true)
    expect(await leerFila(id)).toMatchObject({ estado: "carrusel_por_aprobar", puerta2_carrusel_id: null })
  })

  it("never edits piezas.texto_linkedin on a carousel (its post is signed at gate 1)", async () => {
    const id = await carrusel()
    const resultado = await editarTextoLinkedin(armar().deps, id, await versionDe(id), "Otro texto")
    expect(resultado.ok).toBe(false)
    expect((await leerFila(id)).texto_linkedin).toBeNull()
  })
})

describe("the manual upload of a carousel", () => {
  const firmar = async (clave: string, nombre: string) => `https://almacen.test/${clave}?descarga=${nombre}`

  it("signs a short download of the approved PDF once it waits to be uploaded", async () => {
    const id = await sembrarCarrusel("para_subir_a_mano")
    piezasCreadas.push(id)
    const fila = await leerFila(id)
    const resultado = await pedirDescargaDelCarrusel(armar().deps, id, firmar)
    expect(resultado).toEqual({
      ok: true,
      url: `https://almacen.test/carruseles/${id}/${fila.puerta2_carrusel_id}/carrusel.pdf?descarga=carrusel-${id.slice(0, 8)}.pdf`,
    })
  })

  it("refuses before its time", async () => {
    const id = await sembrarCarrusel("programado")
    piezasCreadas.push(id)
    expect(await pedirDescargaDelCarrusel(armar().deps, id, firmar)).toEqual({
      ok: false,
      error: "Este carrusel ya no está esperando que lo subas.",
    })
  })

  it("Ya lo subí closes it with the link, as a reel's LinkedIn", async () => {
    const id = await sembrarCarrusel("para_subir_a_mano")
    piezasCreadas.push(id)
    const enlace = "https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/"
    expect((await marcarSubidoAMano(armar().deps, id, await versionDe(id), "linkedin", enlace)).ok).toBe(true)
    expect((await leerFila(id)).estado).toBe("publicado_a_mano")
    const { rows } = await pool.query("select estado, enlace from public.publicaciones where pieza_id = $1", [id])
    expect(rows).toEqual([{ estado: "subido_a_mano", enlace }])
  })
})
