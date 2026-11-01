import { afterAll, afterEach, describe, expect, it } from "vitest"
import { notificadorConRegistro } from "@/lib/avisos/registrado"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import {
  avisarLimite,
  claveDelAvisoDeLimite,
  mesDelGasto,
  TEXTO_LIMITE,
  textoDelAvisoDeLimite,
} from "@/lib/presupuesto/limite"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const NOVIEMBRE = "2026-11-15T15:00:00.000Z"
const DICIEMBRE = "2026-12-02T15:00:00.000Z"
const db = clienteDeServicio()

afterEach(async () => {
  await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
  await pool.query("delete from public.limites_del_mes")
})
afterAll(() => pool.end())

function conRegistro() {
  const canal = notificadorEnMemoria()
  return { canal, avisos: notificadorConRegistro({ db, canal, ahora: () => NOVIEMBRE }) }
}

describe("mesDelGasto", () => {
  it("is the Santiago month, as the database counts it", () => {
    expect(mesDelGasto("2026-11-01T02:00:00Z")).toBe("2026-10")
    expect(mesDelGasto("2026-11-01T03:00:00Z")).toBe("2026-11")
    expect(claveDelAvisoDeLimite("2026-11")).toBe("limite_alcanzado:2026-11")
  })
})

describe("avisarLimite", () => {
  it("tells Coni once a month, urgently and with her limit, and WAV once", async () => {
    const { canal, avisos } = conRegistro()

    await avisarLimite({ db, avisos }, NOVIEMBRE)
    await avisarLimite({ db, avisos }, NOVIEMBRE)

    expect(textoDelAvisoDeLimite(80)).toBe(
      "Llegaste a tu límite de US$ 80,00 de este mes. Lo nuevo quedó en pausa; lo que ya firmaste sigue.",
    )
    expect(canal.aConiEnviados).toEqual([{ mensaje: textoDelAvisoDeLimite(80), urgente: true }])
    expect(canal.avisosEnviados).toEqual([{ tipo: "limite_alcanzado", clave: "limite_alcanzado:2026-11" }])
    expect(canal.aWavEnviados).toHaveLength(1)
    expect(canal.aWavEnviados[0]?.asunto).toBe("Coni llegó a su límite de gasto (2026-11)")
  })

  it("tells both again in a new month", async () => {
    const { canal, avisos } = conRegistro()

    await avisarLimite({ db, avisos }, NOVIEMBRE)
    await avisarLimite({ db, avisos }, DICIEMBRE)

    expect(canal.avisosEnviados.map((aviso) => aviso.clave)).toEqual([
      "limite_alcanzado:2026-11",
      "limite_alcanzado:2026-12",
    ])
    expect(canal.aWavEnviados).toHaveLength(2)
  })

  it("opens Ajustes, Presupuesto", () => {
    expect(rutaDeAviso({ tipo: "limite_alcanzado" })).toBe("/ajustes/presupuesto")
  })

  it("lets a failed notice fail the caller, so the run shows it", async () => {
    const canal = {
      ...notificadorEnMemoria(),
      aConi: async () => {
        throw new Error("Resend no responde")
      },
    }
    const avisos = notificadorConRegistro({ db, canal, ahora: () => NOVIEMBRE })

    await expect(avisarLimite({ db, avisos }, NOVIEMBRE)).rejects.toThrow("Resend no responde")
  })

  it("still emails WAV once when the first push failed and a retry succeeds", async () => {
    const canal = notificadorEnMemoria()
    const caido = {
      ...canal,
      aConi: async () => {
        throw new Error("Resend no responde")
      },
    }

    await expect(
      avisarLimite({ db, avisos: notificadorConRegistro({ db, canal: caido, ahora: () => NOVIEMBRE }) }, NOVIEMBRE),
    ).rejects.toThrow("Resend no responde")
    await avisarLimite({ db, avisos: notificadorConRegistro({ db, canal, ahora: () => NOVIEMBRE }) }, NOVIEMBRE)

    expect(canal.aWavEnviados).toHaveLength(1)
    expect(canal.aConiEnviados).toHaveLength(1)
  })

  it("is said in one line every stopped path shares", () => {
    expect(TEXTO_LIMITE).toBe("Llegaste a tu límite de este mes. Reactívalo en Ajustes.")
  })
})
