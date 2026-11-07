import { afterAll, afterEach, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, comoOtra, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

async function abrir(proveedor: string, motivo = "pago", detalle = "HTTP 401 payment_issue") {
  const { rows } = await pool.query<{ pausa_id: string; nueva: boolean; avisar: boolean }>(
    "select * from public.abrir_pausa_de_proveedor($1, $2, $3)",
    [proveedor, motivo, detalle],
  )
  const fila = rows[0]
  if (!fila) throw new Error("abrir_pausa_de_proveedor no devolvió nada")
  return fila
}

describe("pausas_de_proveedor", () => {
  it("opens once per provider and keeps an open pause as it is", async () => {
    const primera = await abrir("elevenlabs", "pago", "primera")
    const segunda = await abrir("elevenlabs", "llave", "segunda")
    expect(primera).toMatchObject({ nueva: true, avisar: true })
    // The first caller claimed WAV's email: a second caller does not send it again while the claim is fresh.
    expect(segunda).toEqual({ pausa_id: primera.pausa_id, nueva: false, avisar: false })
    const { rows } = await pool.query("select motivo, detalle from public.pausas_de_proveedor")
    expect(rows).toEqual([{ motivo: "pago", detalle: "primera" }])
  })

  it("hands WAV's email to another caller once an unmarked claim is five minutes old", async () => {
    const { pausa_id } = await abrir("heygen", "cuota")
    await pool.query(
      "update public.pausas_de_proveedor set aviso_reclamado_en = now() - interval '6 minutes' where id = $1",
      [pausa_id],
    )
    expect(await abrir("heygen", "cuota")).toMatchObject({ nueva: false, avisar: true })
    expect(await abrir("heygen", "cuota")).toMatchObject({ nueva: false, avisar: false })
  })

  it("stops asking to email WAV once the pause is marked as told", async () => {
    const { pausa_id } = await abrir("heygen", "cuota")
    await pool.query("select public.marcar_pausa_avisada($1)", [pausa_id])
    expect(await abrir("heygen", "cuota")).toMatchObject({ nueva: false, avisar: false })
  })

  it("opens a new pause after the previous one closed", async () => {
    const { pausa_id } = await abrir("claude", "cuota")
    const { rows } = await pool.query<{ cerrada: boolean }>("select public.cerrar_pausa_de_proveedor($1) as cerrada", [
      pausa_id,
    ])
    expect(rows[0]?.cerrada).toBe(true)
    const otra = await pool.query<{ cerrada: boolean }>("select public.cerrar_pausa_de_proveedor($1) as cerrada", [
      pausa_id,
    ])
    expect(otra.rows[0]?.cerrada).toBe(false)
    expect((await abrir("claude", "cuota")).nueva).toBe(true)
  })

  it("caps the detail at 400 characters and refuses an unknown provider or reason", async () => {
    await abrir("voyage", "llave", "x".repeat(900))
    const { rows } = await pool.query<{ largo: number }>(
      "select char_length(detalle) as largo from public.pausas_de_proveedor",
    )
    expect(rows[0]?.largo).toBe(400)
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('meta', 'pago', 'x')")).code).toBe("23514")
      expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('voyage', 'otro', 'x')")).code).toBe("23514")
    })
  })

  it("lets Coni and the maintainer read, and nobody but service_role write", async () => {
    await abrir("elevenlabs")
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select proveedor from public.pausas_de_proveedor")).rows).toEqual([
          { proveedor: "elevenlabs" },
        ])
        expect((await fallaCon(c, "update public.pausas_de_proveedor set cerrada_en = now()")).code).toBe("42501")
        expect((await fallaCon(c, "select public.abrir_pausa_de_proveedor('heygen', 'pago', 'x')")).code).toBe("42501")
        expect((await fallaCon(c, "select public.cerrar_pausa_de_proveedor(gen_random_uuid())")).code).toBe("42501")
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select * from public.pausas_de_proveedor")).rows).toEqual([])
    })
  })

  it("accepts the pausa_cerrada notice kind", async () => {
    await pool.query("insert into public.avisos (tipo, clave, mensaje) values ('pausa_cerrada', 'pausa:prueba', 'x')")
    await pool.query("delete from public.avisos where clave = 'pausa:prueba'")
  })
})
