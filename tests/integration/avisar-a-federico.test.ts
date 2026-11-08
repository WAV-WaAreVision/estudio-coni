import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { avisarAFedericoAccion } from "@/app/(app)/acciones-avisar"
import { avisarAFederico, type DepsAvisar, yaAvisado } from "@/lib/acciones/avisar-a-federico"
import { ERROR_GENERICO, ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { leerAvisoAFederico } from "@/lib/datos/aviso-a-federico"
import {
  asuntoDeAviso,
  claveDeAviso,
  cuerpoDeAviso,
  ocurrenciaDePieza,
  TEXTO_AVISANDO,
  TEXTO_FICHA_ILEGIBLE,
  TEXTO_YA_NO_FALLA,
} from "@/lib/dominio/avisar-a-federico"
import { TEXTO_PAUSA } from "@/lib/dominio/pausas"
import { type Notificador, notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, sembrarPieza } from "./siembra"
import { borrarSembrado as borrarBiblioteca, sembrarAutor, sembrarFicha, sembrarMaterial } from "./siembra-biblioteca"

const { accionDeSesion, avisosReales } = vi.hoisted(() => ({
  accionDeSesion: { cliente: null as SupabaseClient<Database> | null },
  avisosReales: vi.fn(),
}))
vi.mock("@/lib/supabase/action", () => ({
  createActionClient: async () => {
    if (!accionDeSesion.cliente) throw new Error("La prueba no fijó la sesión de la acción")
    return accionDeSesion.cliente
  },
}))
vi.mock("@/lib/proveedores/avisos", async (original) => ({
  ...(await original<typeof import("@/lib/proveedores/avisos")>()),
  avisosReales,
}))

const LLAVE = "No pude preparar tu voz. ElevenLabs respondió 401: invalid_api_key"
const db = clienteDeServicio()
const piezas: string[] = []
const materiales: string[] = []
const autores: string[] = []

afterEach(async () => {
  await pool.query("delete from public.avisos_a_federico")
  await borrarSembrado(piezas.splice(0), [])
  await borrarBiblioteca(materiales.splice(0), [], [])
})
afterAll(async () => {
  await borrarBiblioteca([], [], autores.splice(0))
  await pool.end()
})

function deps(avisos: Notificador = notificadorEnMemoria()): DepsAvisar {
  return { db, avisos: () => avisos }
}

async function piezaEnPuerta1(explicacion: string | null): Promise<string> {
  const id = await sembrarPieza("guion_por_aprobar")
  piezas.push(id)
  await ajustarPieza(id, { explicacion, titulo: "Sexo y ansiedad" })
  return id
}

/** The piece's occurrence as the action reads it: its attempt. */
async function ocurrencia(id: string): Promise<string> {
  const { rows } = await pool.query<{ intento: number }>("select intento from public.piezas where id = $1", [id])
  return ocurrenciaDePieza(rows[0]?.intento ?? Number.NaN)
}

async function materialListo(conFichaBuena: boolean): Promise<string> {
  const autorId = await sembrarAutor(`Autora de prueba ${crypto.randomUUID()}`)
  autores.push(autorId)
  const id = await sembrarMaterial({ titulo: "Un libro", autorId, rol: "estrategia" })
  materiales.push(id)
  await sembrarFicha(id, ["una idea"])
  if (!conFichaBuena)
    await pool.query("update public.fichas set citas = '\"rota\"'::jsonb where material_id = $1", [id])
  return id
}

describe("avisarAFederico", () => {
  it("emails WAV once for a key failure at gate 1, however many taps", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })

    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: asuntoDeAviso("Sexo y ansiedad"),
        detalle: cuerpoDeAviso({ tipo: "pieza", id, titulo: "Sexo y ansiedad", explicacion: LLAVE }),
        // The email's key travels as Resend's Idempotency-Key, so a retry after a send that went out sends nothing.
        idempotencia: await claveDeAviso({ tipo: "pieza", id, explicacion: LLAVE, ocurrencia: await ocurrencia(id) }),
      },
    ])
  })

  it("emails WAV again when the same failure text comes back on a new attempt of the piece", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })
    // Federico fixed the key, she tried again and ElevenLabs refused it with the same words: a new attempt.
    await ajustarPieza(id, { intento: 1 })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })

    expect(avisos.aWavEnviados).toHaveLength(2)
  })

  it("emails WAV again when a material's card comes back unreadable after a new run", async () => {
    const id = await materialListo(false)
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "material", id })).toEqual({ ok: true })
    // The card was written again and it still does not read: the explanation is the same constant text.
    await pool.query("update public.fichas set citas = '\"rota otra vez\"'::jsonb where material_id = $1", [id])
    expect(await avisarAFederico(deps(avisos), { tipo: "material", id })).toEqual({ ok: true })
    expect(await avisarAFederico(deps(avisos), { tipo: "material", id })).toEqual({ ok: true })

    expect(avisos.aWavEnviados).toHaveLength(2)
  })

  it("emails WAV once when two taps arrive together", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const avisos = notificadorEnMemoria()

    const respuestas = await Promise.all([
      avisarAFederico(deps(avisos), { tipo: "pieza", id }),
      avisarAFederico(deps(avisos), { tipo: "pieza", id }),
    ])

    // One tap sends it; the other answers ok if the email already went out, or asks her to wait a moment.
    expect(respuestas).toContainEqual({ ok: true })
    for (const respuesta of respuestas) {
      expect([{ ok: true }, { ok: false, error: TEXTO_AVISANDO }]).toContainEqual(respuesta)
    }
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("asks her to try again in a moment while another tap holds the email and nothing went out yet", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const clave = await claveDeAviso({ tipo: "pieza", id, explicacion: LLAVE, ocurrencia: await ocurrencia(id) })
    await pool.query("select public.reclamar_aviso_a_federico($1, 'pieza', $2)", [clave, id])
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({
      ok: false,
      error: TEXTO_AVISANDO,
    })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("lets the next tap send it when the email failed", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const caido: Notificador = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend respondió 500")
      },
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await avisarAFederico(deps(caido), { tipo: "pieza", id })).toEqual({ ok: false, error: ERROR_GENERICO })
    error.mockRestore()
    const clave = await claveDeAviso({ tipo: "pieza", id, explicacion: LLAVE, ocurrencia: await ocurrencia(id) })
    expect(await yaAvisado(db, clave)).toBe(false)

    const avisos = notificadorEnMemoria()
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({ ok: true })
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("answers ok and logs it when the email went out but could not be marked as sent", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const avisos = notificadorEnMemoria()
    const sinMarcar = new Proxy(db, {
      get(objetivo, propiedad, receptor) {
        if (propiedad !== "rpc") return Reflect.get(objetivo, propiedad, receptor)
        return (funcion: string, argumentos: Record<string, unknown>) =>
          funcion === "marcar_aviso_a_federico_enviado"
            ? Promise.resolve({ data: null, error: { message: "se cortó la conexión" } })
            : Reflect.apply(objetivo.rpc, objetivo, [funcion, argumentos])
      },
    })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await avisarAFederico({ db: sinMarcar, avisos: () => avisos }, { tipo: "pieza", id })).toEqual({ ok: true })

    expect(error).toHaveBeenCalledWith(expect.stringContaining("No pude marcar como enviado"), expect.anything())
    error.mockRestore()
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("refuses a piece that no longer fails in a way only WAV can fix", async () => {
    const avisos = notificadorEnMemoria()
    for (const explicacion of [TEXTO_PAUSA.elevenlabs, null, "No pude preparar tu voz. ElevenLabs respondió 500."]) {
      const id = await piezaEnPuerta1(explicacion)
      expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id })).toEqual({
        ok: false,
        error: TEXTO_YA_NO_FALLA,
      })
    }
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id: crypto.randomUUID() })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(avisos.aWavEnviados).toEqual([])
    expect((await pool.query("select 1 from public.avisos_a_federico")).rowCount).toBe(0)
  })

  it("emails WAV about a ready material whose ficha cannot be read, and refuses one whose ficha is fine", async () => {
    const ilegible = await materialListo(false)
    const buena = await materialListo(true)
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "material", id: ilegible })).toEqual({ ok: true })
    expect(await avisarAFederico(deps(avisos), { tipo: "material", id: buena })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })

    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: asuntoDeAviso("Un libro"),
        detalle: cuerpoDeAviso({
          tipo: "material",
          id: ilegible,
          titulo: "Un libro",
          explicacion: TEXTO_FICHA_ILEGIBLE,
        }),
        idempotencia: expect.stringMatching(new RegExp(`^material:${ilegible}:[0-9a-f]{16}:f[0-9a-f]{16}$`)),
      },
    ])
  })

  it("answers yaAvisado only once the email went out", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const clave = await claveDeAviso({ tipo: "pieza", id, explicacion: LLAVE, ocurrencia: await ocurrencia(id) })
    expect(await yaAvisado(db, clave)).toBe(false)
    await pool.query("select public.reclamar_aviso_a_federico($1, 'pieza', $2)", [clave, id])
    expect(await yaAvisado(db, clave)).toBe(false)
    await pool.query("select public.marcar_aviso_a_federico_enviado($1)", [clave])
    expect(await yaAvisado(db, clave)).toBe(true)
  })
})

describe("leerAvisoAFederico", () => {
  it("offers nothing when there is no failure for WAV, and says whether its email went out", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const intento = await ocurrencia(id)
    expect(await leerAvisoAFederico(db, { tipo: "pieza", id, explicacion: null, ocurrencia: "i0" })).toBeNull()
    expect(await leerAvisoAFederico(db, { tipo: "pieza", id, explicacion: LLAVE, ocurrencia: intento })).toEqual({
      avisado: false,
    })

    expect(await avisarAFederico(deps(), { tipo: "pieza", id })).toEqual({ ok: true })

    expect(await leerAvisoAFederico(db, { tipo: "pieza", id, explicacion: LLAVE, ocurrencia: intento })).toEqual({
      avisado: true,
    })
    // Another failure of the same piece is another email.
    expect(
      await leerAvisoAFederico(db, { tipo: "pieza", id, explicacion: `${LLAVE} otra vez`, ocurrencia: intento }),
    ).toEqual({
      avisado: false,
    })
  })
})

describe("leerAvisoAFederico with the page's session", () => {
  it("reads whether the email went out through Coni's own session", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const entrada = { tipo: "pieza" as const, id, explicacion: LLAVE, ocurrencia: await ocurrencia(id) }
    const coni = await clienteDeConi()
    expect(await leerAvisoAFederico(coni, entrada)).toEqual({ avisado: false })

    expect(await avisarAFederico(deps(), { tipo: "pieza", id })).toEqual({ ok: true })

    expect(await leerAvisoAFederico(coni, entrada)).toEqual({ avisado: true })
  })

  it("logs a read that fails and offers the button instead of breaking the page", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    const coni = await clienteDeConi()
    const rota = new Proxy(coni, {
      get(objetivo, propiedad, receptor) {
        if (propiedad !== "from") return Reflect.get(objetivo, propiedad, receptor)
        return () => Reflect.apply(objetivo.from, objetivo, ["tabla_que_no_existe"])
      },
    })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    const leido = await leerAvisoAFederico(rota, { tipo: "pieza", id, explicacion: LLAVE, ocurrencia: "i0" })

    expect(leido).toEqual({ avisado: false })
    expect(error).toHaveBeenCalledWith(expect.stringContaining("No pude leer el aviso"), expect.anything())
    error.mockRestore()
  })
})

describe("avisarAFedericoAccion", () => {
  beforeAll(async () => {
    accionDeSesion.cliente = await clienteDelMantenedor()
  })

  it("emails WAV once from Coni's real session, end to end", async () => {
    // The action's own service client reads the local stack (local development keys, never committed).
    const { url, clave } = credencialesDeServicio()
    vi.stubEnv("SUPABASE_URL", url)
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", clave)
    accionDeSesion.cliente = await clienteDeConi()
    const avisos = notificadorEnMemoria()
    avisosReales.mockReturnValue(avisos)
    try {
      const id = await piezaEnPuerta1(LLAVE)

      expect(await avisarAFedericoAccion({ tipo: "pieza", id })).toEqual({ ok: true })
      expect(await avisarAFedericoAccion({ tipo: "pieza", id })).toEqual({ ok: true })

      expect(avisos.aWavEnviados).toHaveLength(1)
      expect(avisos.aWavEnviados[0]?.asunto).toBe(asuntoDeAviso("Sexo y ansiedad"))
      const { rows } = await pool.query("select enviado_en from public.avisos_a_federico where entidad_id = $1", [id])
      expect(rows).toEqual([{ enviado_en: expect.any(Date) }])
    } finally {
      vi.unstubAllEnvs()
      accionDeSesion.cliente = await clienteDelMantenedor()
      avisosReales.mockReset()
    }
  })

  it("refuses a session that is not Coni's before anything is read or sent", async () => {
    const id = await piezaEnPuerta1(LLAVE)
    expect(await avisarAFedericoAccion({ tipo: "pieza", id })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
    expect(avisosReales).not.toHaveBeenCalled()
    expect((await pool.query("select 1 from public.avisos_a_federico")).rowCount).toBe(0)
  })

  it("refuses an entry that is not a piece or material id", async () => {
    expect(await avisarAFedericoAccion({ tipo: "carrusel", id: "x" })).toMatchObject({ ok: false })
    expect(await avisarAFedericoAccion({ tipo: "pieza", id: "no-es-uuid" })).toMatchObject({ ok: false })
    expect(avisosReales).not.toHaveBeenCalled()
  })
})
