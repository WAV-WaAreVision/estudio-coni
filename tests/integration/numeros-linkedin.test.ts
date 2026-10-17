import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { DETALLE_DEL_RECORDATORIO, recordarNumerosDeLinkedin } from "@/lib/mantenimiento/numeros-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

const LUNES = "2026-10-19T06:00:00.000Z" // 03:00 in Santiago, when the nightly run starts
const MARTES = "2026-10-20T06:00:00.000Z"

const deps = (ahora: string, avisos = notificadorEnMemoria()) => ({
  db: clienteDeServicio(),
  avisos,
  ahora: () => ahora,
})

async function postEnLinkedin(instante: string): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo: "Post" })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, instante)
  return id
}

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.recordatorios_linkedin")
}

beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("recordarNumerosDeLinkedin", () => {
  it("tells WAV on Monday how many posts wait for their numbers", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    await postEnLinkedin("2026-10-08T22:00:00.000Z")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("avisado")
    expect(avisos.aWavEnviados).toEqual([
      { asunto: "Anota los números de LinkedIn (2 posts)", detalle: DETALLE_DEL_RECORDATORIO },
    ])
  })

  it("tells WAV once per Monday, however many times the run starts", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("avisado")
    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("ya_avisado")
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("leaves the week free to remind again when the email could not go out", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    const fallido = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend no respondió")
      },
    }

    await expect(recordarNumerosDeLinkedin(deps(LUNES, fallido))).rejects.toThrow("Resend no respondió")
    const avisos = notificadorEnMemoria()
    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("avisado")
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("retries on Tuesday when Monday's email failed, once", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    const fallido = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend no respondió")
      },
    }
    await expect(recordarNumerosDeLinkedin(deps(LUNES, fallido))).rejects.toThrow("Resend no respondió")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(MARTES, avisos))).toBe("avisado")
    expect(await recordarNumerosDeLinkedin(deps(MARTES, avisos))).toBe("ya_avisado")
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("says nothing on Tuesday when Monday's email went out", async () => {
    await postEnLinkedin("2026-10-14T22:00:00.000Z")
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("avisado")
    expect(await recordarNumerosDeLinkedin(deps(MARTES, avisos))).toBe("ya_avisado")
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("says nothing on Monday when no post is pending", async () => {
    await postEnLinkedin("2026-09-01T22:00:00.000Z") // older than four weeks
    const avisos = notificadorEnMemoria()

    expect(await recordarNumerosDeLinkedin(deps(LUNES, avisos))).toBe("al_dia")
    expect(avisos.aWavEnviados).toEqual([])
  })
})
