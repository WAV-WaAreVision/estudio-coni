import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { recordarRevisionDeInventario } from "@/lib/mantenimiento/revision-de-inventario"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"

let desdeOriginal = ""

beforeAll(async () => {
  const { rows } = await pool.query<{ desde: string }>("select inventario_desde::text as desde from public.ajustes")
  desdeOriginal = rows[0]?.desde ?? ""
})
afterEach(async () => {
  await pool.query("update public.ajustes set inventario_desde = $1, revision_de_inventario_avisada = null", [
    desdeOriginal,
  ])
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

const deps = (avisos: ReturnType<typeof notificadorEnMemoria>, ahora: string) => ({
  db: clienteDeServicio(),
  avisos,
  ahora: () => ahora,
})

describe("recordarRevisionDeInventario", () => {
  it("tells Coni and WAV 30 days before the first review is due", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-16T12:00:00.000Z"))).toBe("avisado")

    expect(avisos.avisosEnviados).toEqual([
      { tipo: "revision_de_inventario", clave: "revision_de_inventario:2027-11-15" },
    ])
    expect(avisos.aConiEnviados).toEqual([
      {
        mensaje:
          "Te toca revisar tu registro de datos personales antes del 15 de noviembre de 2027. Está en Ajustes, Datos personales: léelo y toca «Lo revisé».",
        urgente: false,
      },
    ])
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Revisión anual del registro de datos personales",
        detalle:
          "Coni tiene que revisar su registro antes del 2027-11-15. Si cambió un proveedor, un país o un plazo, corrígelo antes en Ingesta, Datos personales.",
      },
    ])
  })

  it("says nothing 31 days before", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-15T12:00:00.000Z"))).toBe("al_dia")

    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("never tells twice for the same due date", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    const avisos = notificadorEnMemoria()

    await recordarRevisionDeInventario(deps(avisos, "2027-10-16T12:00:00.000Z"))
    expect(await recordarRevisionDeInventario(deps(avisos, "2027-10-17T12:00:00.000Z"))).toBe("al_dia")

    expect(avisos.aConiEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("counts the year from Coni's latest review", async () => {
    await pool.query("update public.ajustes set inventario_desde = '2026-11-15'")
    await pool.query(
      "insert into public.revisiones_de_inventario (revisado_por, revisado_en) values ($1, '2027-03-10T15:00:00Z')",
      [CONI],
    )

    expect(await recordarRevisionDeInventario(deps(notificadorEnMemoria(), "2027-10-16T12:00:00.000Z"))).toBe("al_dia")
    const avisos = notificadorEnMemoria()
    expect(await recordarRevisionDeInventario(deps(avisos, "2028-02-09T12:00:00.000Z"))).toBe("avisado")
    expect(avisos.avisosEnviados[0]?.clave).toBe("revision_de_inventario:2028-03-10")
  })
})
