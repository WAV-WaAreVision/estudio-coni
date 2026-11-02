import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { enviarResumenDelDia } from "@/lib/avisos/resumen"
import { type Notificador, notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import {
  ajustarPieza,
  borrarSembrado,
  sembrarCarrusel,
  sembrarIdea,
  sembrarIdeaDelMotor,
  sembrarPieza,
} from "./siembra"

afterAll(() => pool.end())

// Monday 5 October 2026, 08:30 in Santiago (UTC-3 from September) is 11:30 UTC.
const LUNES_0830 = "2026-10-05T11:30:00.000Z"
const MARTES_0830 = "2026-10-06T11:30:00.000Z"
const DIA_MS = 86_400_000

let piezas: string[] = []
let ideas: string[] = []

async function aviso(
  tipo: string,
  clave: string,
  mensaje: string,
  extra: { enviado?: boolean; piezaId?: string } = {},
) {
  await pool.query(
    "insert into public.avisos (tipo, clave, mensaje, pieza_id, enviado_en, canal) values ($1, $2, $3, $4, $5, $6)",
    [tipo, clave, mensaje, extra.piezaId ?? null, extra.enviado ? LUNES_0830 : null, extra.enviado ? "correo" : null],
  )
}

async function filas() {
  const { rows } = await pool.query<{ tipo: string; clave: string; enviado_en: Date | null; canal: string | null }>(
    "select tipo, clave, enviado_en, canal from public.avisos order by clave",
  )
  return rows
}

function armar(ahora: string, canal: Notificador = notificadorEnMemoria()) {
  return { canal, deps: { db: clienteDeServicio(), canal, ahora: () => ahora } }
}

beforeEach(async () => {
  await pool.query("delete from public.avisos")
  piezas = []
  ideas = []
})

afterEach(async () => {
  await pool.query("delete from public.avisos")
  await pool.query("update public.ajustes set avisos_resumen = true")
  await borrarSembrado(piezas, ideas)
})

describe("enviarResumenDelDia", () => {
  it("sends nothing when there is nothing new", async () => {
    const memoria = notificadorEnMemoria()
    const { deps } = armar(MARTES_0830, memoria)
    expect(await enviarResumenDelDia(deps)).toEqual({ enviado: false })
    expect(memoria.resumenesEnviados).toEqual([])
  })

  it("sends one summary with everything that waits and marks each notice with the channel that carried it", async () => {
    await aviso("guion_listo", "guion_listo:a:1", "Tu guion «Uno» está listo para revisar.")
    await aviso("publicado", "publicado:b:0", "Tu reel «Dos» ya está publicado en Instagram.")
    const memoria = notificadorEnMemoria()
    const { deps } = armar(MARTES_0830, memoria)
    expect(await enviarResumenDelDia(deps)).toEqual({ enviado: true, avisos: 2, canal: "correo" })
    expect(memoria.resumenesEnviados).toHaveLength(1)
    expect(memoria.resumenesEnviados[0]?.cuerpoPush).toBe("Tienes 2 avisos nuevos")
    expect(memoria.resumenesEnviados[0]?.texto).toContain("Tu guion «Uno» está listo para revisar.")
    expect(memoria.resumenesEnviados[0]?.texto).toContain("Tu reel «Dos» ya está publicado en Instagram.")
    for (const fila of await filas()) {
      expect(fila.canal).toBe("correo")
      expect(fila.enviado_en?.toISOString()).toBe(MARTES_0830)
    }
  })

  it("words a single notice by its kind in the push, never by its text", async () => {
    await aviso("guion_listo", "guion_listo:a:1", "Tu guion «El deseo se esconde» está listo para revisar.")
    const memoria = notificadorEnMemoria()
    await enviarResumenDelDia(armar(MARTES_0830, memoria).deps)
    expect(memoria.resumenesEnviados[0]?.cuerpoPush).toBe("Tienes un guion listo para revisar")
  })

  it("leaves out what was already sent, and a second run the same day has nothing to say", async () => {
    await aviso("publicado", "publicado:b:0", "Ya publicado.", { enviado: true })
    await aviso("video_listo", "video_listo:c:3", "Tu video está listo.")
    const memoria = notificadorEnMemoria()
    const { deps } = armar(MARTES_0830, memoria)
    expect(await enviarResumenDelDia(deps)).toMatchObject({ enviado: true, avisos: 1 })
    expect(await enviarResumenDelDia(deps)).toEqual({ enviado: false })
    expect(memoria.resumenesEnviados).toHaveLength(1)
    expect(memoria.resumenesEnviados[0]?.texto).not.toContain("Ya publicado.")
  })

  it("sends nothing when Coni turned the summary off in Ajustes, and keeps the notices for the app", async () => {
    await pool.query("update public.ajustes set avisos_resumen = false")
    await aviso("video_listo", "video_listo:c:3", "Tu video está listo.")
    const memoria = notificadorEnMemoria()
    expect(await enviarResumenDelDia(armar(MARTES_0830, memoria).deps)).toEqual({ enviado: false })
    expect(memoria.resumenesEnviados).toEqual([])
    expect((await filas())[0]?.enviado_en).toBeNull()
  })

  it("does not carry a week-old notice into today's summary when she turns it on again", async () => {
    await aviso("video_listo", "video_listo:viejo:3", "Un video de hace tiempo.")
    await pool.query("update public.avisos set creado_en = $1", [
      new Date(Date.parse(MARTES_0830) - 8 * DIA_MS).toISOString(),
    ])
    await aviso("guion_listo", "guion_listo:nuevo:1", "Un guion de ayer.")
    const memoria = notificadorEnMemoria()
    expect(await enviarResumenDelDia(armar(MARTES_0830, memoria).deps)).toMatchObject({ enviado: true, avisos: 1 })
    expect(memoria.resumenesEnviados[0]?.texto).not.toContain("hace tiempo")
  })

  it("keeps the notices unsent when the sending fails, so tomorrow's summary carries them", async () => {
    await aviso("video_listo", "video_listo:c:3", "Tu video está listo.")
    const canal: Notificador = {
      ...notificadorEnMemoria(),
      resumenAConi: async () => {
        throw new Error("Resend caído")
      },
    }
    await expect(enviarResumenDelDia(armar(MARTES_0830, canal).deps)).rejects.toThrow("Resend caído")
    expect((await filas())[0]?.enviado_en).toBeNull()
  })

  it("carries an urgent notice whose sending failed", async () => {
    await aviso("error_definitivo", "error_definitivo:x", "Algo falló al preparar tu video.")
    const memoria = notificadorEnMemoria()
    expect(await enviarResumenDelDia(armar(MARTES_0830, memoria).deps)).toMatchObject({ enviado: true, avisos: 1 })
  })

  describe("ideas of the week", () => {
    // Sunday 4 October 2026, 20:05 in Santiago: the Sunday engine just wrote its ideas.
    const DOMINGO_2005 = "2026-10-04T23:05:00.000Z"

    async function ideaDelMotor(creadaEn: string) {
      const id = await sembrarIdeaDelMotor({ gancho: `Idea del motor ${creadaEn}`, semana: "2026-10-04" })
      await pool.query("update public.ideas set creada_en = $2 where id = $1", [id, creadaEn])
      ideas.push(id)
    }

    it("announces on Monday, once, the ideas the engine wrote since Sunday", async () => {
      await ideaDelMotor(DOMINGO_2005)
      const memoria = notificadorEnMemoria()
      const { deps } = armar(LUNES_0830, memoria)
      expect(await enviarResumenDelDia(deps)).toMatchObject({ enviado: true, avisos: 1 })
      expect(memoria.resumenesEnviados[0]?.cuerpoPush).toBe("Tienes ideas nuevas para elegir")
      expect(await enviarResumenDelDia(deps)).toEqual({ enviado: false })
      expect((await filas()).map((f) => f.clave)).toEqual(["ideas_propuestas:2026-10-05"])
    })

    it("says nothing on Monday when the engine wrote nothing since Sunday (switched off or stopped)", async () => {
      await ideaDelMotor("2026-09-27T23:05:00.000Z")
      ideas.push(await sembrarIdea())
      expect(await enviarResumenDelDia(armar(LUNES_0830).deps)).toEqual({ enviado: false })
    })

    it("does not count an idea of her own written on Sunday as the engine's", async () => {
      const propia = await sembrarIdea()
      ideas.push(propia)
      await pool.query("update public.ideas set creada_en = $2 where id = $1", [propia, DOMINGO_2005])
      expect(await enviarResumenDelDia(armar(LUNES_0830).deps)).toEqual({ enviado: false })
    })

    it("says nothing about ideas on any other day", async () => {
      await ideaDelMotor(DOMINGO_2005)
      expect(await enviarResumenDelDia(armar(MARTES_0830).deps)).toEqual({ enviado: false })
    })

    it("says nothing on Monday when the bank is empty", async () => {
      expect(await enviarResumenDelDia(armar(LUNES_0830).deps)).toEqual({ enviado: false })
    })

    it("counts Monday in Santiago, not in UTC: Sunday night UTC is still Sunday there", async () => {
      await ideaDelMotor(DOMINGO_2005)
      // Monday 02:30 UTC is Sunday 23:30 in Santiago.
      expect(await enviarResumenDelDia(armar("2026-10-05T02:30:00.000Z").deps)).toEqual({ enviado: false })
    })
  })

  describe("reminder after 48 hours", () => {
    async function esperando(estado: "guion_por_aprobar" | "video_por_aprobar", horas: number) {
      const id = await sembrarPieza(estado)
      piezas.push(id)
      // The notices the move created are as old as the wait, and the summary of the next morning already sent them.
      const desde = new Date(Date.parse(MARTES_0830) - horas * 3_600_000).toISOString()
      await pool.query("update public.avisos set creado_en = $2, enviado_en = $2, canal = 'push' where pieza_id = $1", [
        id,
        desde,
      ])
      return id
    }

    it("reminds her once of a piece that waits for her signature for more than 48 hours", async () => {
      const id = await esperando("guion_por_aprobar", 49)
      const memoria = notificadorEnMemoria()
      const { deps } = armar(MARTES_0830, memoria)
      expect(await enviarResumenDelDia(deps)).toMatchObject({ enviado: true, avisos: 1 })
      expect(memoria.resumenesEnviados[0]?.cuerpoPush).toBe("Tienes algo esperando tu firma")
      expect(memoria.resumenesEnviados[0]?.texto).toContain("Prueba")
      const recordatorios = (await filas()).filter((f) => f.tipo === "recordatorio_48h")
      expect(recordatorios.map((f) => f.clave)).toEqual([`recordatorio_48h:${id}`])
      // The next days never repeat it.
      const siguiente = armar(new Date(Date.parse(MARTES_0830) + 3 * DIA_MS).toISOString(), memoria)
      expect(await enviarResumenDelDia(siguiente.deps)).toEqual({ enviado: false })
    })

    it("words the reminder of a carousel as a carousel", async () => {
      const id = await sembrarCarrusel("guion_por_aprobar")
      piezas.push(id)
      const desde = new Date(Date.parse(MARTES_0830) - 49 * 3_600_000).toISOString()
      await pool.query("update public.avisos set creado_en = $2, enviado_en = $2, canal = 'push' where pieza_id = $1", [
        id,
        desde,
      ])
      const { rows } = await pool.query<{ titulo: string }>("select titulo from public.piezas where id = $1", [id])
      const memoria = notificadorEnMemoria()
      await enviarResumenDelDia(armar(MARTES_0830, memoria).deps)
      expect(memoria.resumenesEnviados[0]?.texto).toContain(
        `Tu carrusel «${rows[0]?.titulo}» espera tu firma desde hace más de 48 horas.`,
      )
    })

    it("does not remind her of a piece that has waited less than 48 hours", async () => {
      await esperando("video_por_aprobar", 40)
      expect(await enviarResumenDelDia(armar(MARTES_0830).deps)).toEqual({ enviado: false })
    })

    it("counts the wait from the latest time the piece came back to her, not from the first", async () => {
      const id = await esperando("guion_por_aprobar", 100)
      // She asked for changes and a new script came back an hour ago: a second notice of the same kind.
      await pool.query(
        "insert into public.avisos (tipo, clave, mensaje, pieza_id, creado_en, enviado_en, canal) values ('guion_listo', $1, 'otro', $2, $3, $3, 'push')",
        [`guion_listo:${id}:99`, id, new Date(Date.parse(MARTES_0830) - 3_600_000).toISOString()],
      )
      expect(await enviarResumenDelDia(armar(MARTES_0830).deps)).toEqual({ enviado: false })
    })

    it("does not remind her of a piece that is no longer waiting for her", async () => {
      const id = await esperando("guion_por_aprobar", 60)
      await ajustarPieza(id, { estado: "descartado" })
      expect(await enviarResumenDelDia(armar(MARTES_0830).deps)).toEqual({ enviado: false })
    })
  })
})
