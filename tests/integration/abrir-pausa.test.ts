import { afterAll, afterEach, describe, expect, it } from "vitest"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { abrirPausa } from "@/lib/pausas/abrir"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

const pago = () =>
  new PausaDeProveedor("elevenlabs", "pago", "ElevenLabs respondió HTTP 401: payment_issue · unpaid", 401)

describe("abrirPausa", () => {
  it("opens the pause and emails WAV once, whatever the number of callers", async () => {
    const avisos = notificadorEnMemoria()
    const db = clienteDeServicio()
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: true })
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: false })
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.asunto).toBe("ElevenLabs en pausa: pago pendiente")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("payment_issue")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("elevenlabs.io/app/subscription")
    expect(avisos.aConiEnviados).toEqual([])
  })

  it("sends WAV's email again on the next call when the first one failed", async () => {
    const db = clienteDeServicio()
    const rota = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend no responde")
      },
    }
    await expect(abrirPausa({ db, avisos: rota }, pago())).rejects.toThrow("Resend no responde")

    // The failed caller let go of its claim: the next caller (a Trigger.dev retry, say) sends the email at once.
    const avisos = notificadorEnMemoria()
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: false })
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(await abrirPausa({ db, avisos }, pago())).toEqual({ nueva: false })
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("emails WAV once when three callers open the same pause at the same time", async () => {
    const db = clienteDeServicio()
    const enviados: string[] = []
    const lenta = {
      ...notificadorEnMemoria(),
      aWav: async (asunto: string) => {
        await new Promise((resolver) => setTimeout(resolver, 300))
        enviados.push(asunto)
      },
    }
    const resultados = await Promise.all([1, 2, 3].map(() => abrirPausa({ db, avisos: lenta }, pago())))
    expect(enviados).toHaveLength(1)
    expect(resultados.filter((resultado) => resultado.nueva)).toHaveLength(1)
  })
})
