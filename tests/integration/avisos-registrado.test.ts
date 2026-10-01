import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { notificadorConRegistro } from "@/lib/avisos/registrado"
import type { CanalDeAviso } from "@/lib/avisos/tipos"
import { type Notificador, notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { sembrarPieza } from "./siembra"

afterAll(() => pool.end())

const AHORA = "2031-03-14T12:00:00.000Z"
const URGENTE = { tipo: "error_definitivo", clave: "error_definitivo:corrida-1" } as const
const DIFERIDO = { tipo: "publicado", clave: "publicado:p1:0" } as const

interface FilaAviso {
  tipo: string
  pieza_id: string | null
  mensaje: string
  enviado_en: Date | null
  canal: string | null
}

async function filas(): Promise<FilaAviso[]> {
  const { rows } = await pool.query<FilaAviso>(
    "select tipo, pieza_id, mensaje, enviado_en, canal from public.avisos order by clave",
  )
  return rows
}

function armar(canal: Notificador = notificadorEnMemoria()) {
  return { canal, notificador: notificadorConRegistro({ db: clienteDeServicio(), canal, ahora: () => AHORA }) }
}

beforeEach(() => pool.query("delete from public.avisos"))
afterEach(async () => {
  await pool.query("delete from public.avisos")
  await pool.query("update public.ajustes set avisos_urgentes = true")
})

describe("notificadorConRegistro", () => {
  it("stores an urgent notice, sends it at once and notes the channel that carried it", async () => {
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    expect(await notificador.aConi("Algo falló.", true, URGENTE)).toBe("correo")
    expect(memoria.aConiEnviados).toEqual([{ mensaje: "Algo falló.", urgente: true }])
    const [fila] = await filas()
    expect(fila).toMatchObject({ tipo: "error_definitivo", mensaje: "Algo falló.", canal: "correo" })
    expect(fila?.enviado_en?.toISOString()).toBe(AHORA)
  })

  it("notes the channel the real notifier answers with, push or email", async () => {
    const porPush: Notificador = { ...notificadorEnMemoria(), aConi: async () => "push" satisfies CanalDeAviso }
    await armar(porPush).notificador.aConi("Algo falló.", true, URGENTE)
    expect((await filas())[0]?.canal).toBe("push")
  })

  it("stores a notice that can wait and leaves it for the daily summary, sending nothing", async () => {
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    expect(await notificador.aConi("Tu reel ya está publicado.", false, DIFERIDO)).toBeNull()
    expect(memoria.aConiEnviados).toEqual([])
    expect(await filas()).toEqual([
      expect.objectContaining({
        tipo: "publicado",
        enviado_en: null,
        canal: null,
        mensaje: "Tu reel ya está publicado.",
      }),
    ])
  })

  it("links the notice to its piece", async () => {
    const piezaId = await sembrarPieza("guion_por_aprobar")
    try {
      await armar().notificador.aConi("Algo falló.", true, { ...URGENTE, piezaId })
      expect((await filas()).find((f) => f.tipo === "error_definitivo")?.pieza_id).toBe(piezaId)
    } finally {
      await pool.query("delete from public.piezas where id = $1", [piezaId])
    }
  })

  it("does not send a retried urgent notice twice", async () => {
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    await notificador.aConi("Algo falló.", true, URGENTE)
    expect(await notificador.aConi("Algo falló.", true, URGENTE)).toBe("correo")
    expect(memoria.aConiEnviados).toHaveLength(1)
    expect(await filas()).toHaveLength(1)
  })

  it("sends again an urgent notice whose first sending failed, and keeps it unsent in between", async () => {
    let falla = true
    const memoria = notificadorEnMemoria()
    const canal: Notificador = {
      ...memoria,
      aConi: async (mensaje, urgente, aviso) => {
        if (falla) throw new Error("Resend caído")
        return memoria.aConi(mensaje, urgente, aviso)
      },
    }
    const { notificador } = armar(canal)
    await expect(notificador.aConi("Algo falló.", true, URGENTE)).rejects.toThrow("Resend caído")
    expect((await filas())[0]).toMatchObject({ enviado_en: null, canal: null })
    falla = false
    expect(await notificador.aConi("Algo falló.", true, URGENTE)).toBe("correo")
    expect((await filas())[0]?.canal).toBe("correo")
    expect(memoria.aConiEnviados).toHaveLength(1)
  })

  it("does not turn a deferred notice into an urgent one by asking again", async () => {
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    await notificador.aConi("Tu reel ya está publicado.", false, DIFERIDO)
    await notificador.aConi("Tu reel ya está publicado.", false, DIFERIDO)
    expect(memoria.aConiEnviados).toEqual([])
    expect(await filas()).toHaveLength(1)
  })

  it("keeps an urgent notice for the summary when Coni turned off the immediate ones in Ajustes", async () => {
    await pool.query("update public.ajustes set avisos_urgentes = false")
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    expect(await notificador.aConi("Algo falló.", true, URGENTE)).toBeNull()
    expect(memoria.aConiEnviados).toEqual([])
    expect((await filas())[0]).toMatchObject({ tipo: "error_definitivo", enviado_en: null })
  })

  it("passes WAV's alerts and the summary straight to the channel", async () => {
    const memoria = notificadorEnMemoria()
    const { notificador } = armar(memoria)
    await notificador.aWav("asunto", "detalle")
    expect(await notificador.resumenAConi({ cuerpoPush: "corto", texto: "largo" })).toBe("correo")
    expect(memoria.aWavEnviados).toEqual([{ asunto: "asunto", detalle: "detalle" }])
    expect(memoria.resumenesEnviados).toEqual([{ cuerpoPush: "corto", texto: "largo" }])
    expect(await filas()).toEqual([])
  })
})
