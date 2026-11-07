import { afterAll, afterEach, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, comoOtra, fallaCon, pool } from "./db"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.avisos_a_federico")
})

const PIEZA = "d0000000-0000-4000-8000-0000000000aa"
const CLAVE = `pieza:${PIEZA}:abc`

async function reclamar(clave = CLAVE, tipo = "pieza", entidadId = PIEZA): Promise<string> {
  const { rows } = await pool.query<{ avisar: string }>(
    "select public.reclamar_aviso_a_federico($1, $2, $3) as avisar",
    [clave, tipo, entidadId],
  )
  const fila = rows[0]
  if (!fila) throw new Error("reclamar_aviso_a_federico no devolvió nada")
  return fila.avisar
}

describe("avisos_a_federico", () => {
  it("claims once, says another caller holds it, and never again once the email is marked as sent", async () => {
    expect(await reclamar()).toBe("tuyo")
    expect(await reclamar()).toBe("en_curso")
    await pool.query("select public.marcar_aviso_a_federico_enviado($1)", [CLAVE])
    expect(await reclamar()).toBe("enviado")
    const { rows } = await pool.query("select tipo, entidad_id from public.avisos_a_federico")
    expect(rows).toEqual([{ tipo: "pieza", entidad_id: PIEZA }])
  })

  it("lets the next caller claim after a failed send lets go", async () => {
    expect(await reclamar()).toBe("tuyo")
    await pool.query("select public.soltar_aviso_a_federico($1)", [CLAVE])
    expect(await reclamar()).toBe("tuyo")
  })

  it("does not let go of a sent row", async () => {
    expect(await reclamar()).toBe("tuyo")
    await pool.query("select public.marcar_aviso_a_federico_enviado($1)", [CLAVE])
    await pool.query("select public.soltar_aviso_a_federico($1)", [CLAVE])
    expect(await reclamar()).toBe("enviado")
  })

  it("hands the email on once an unsent claim is five minutes old", async () => {
    expect(await reclamar()).toBe("tuyo")
    await pool.query(
      "update public.avisos_a_federico set reclamado_en = now() - interval '6 minutes' where clave = $1",
      [CLAVE],
    )
    expect(await reclamar()).toBe("tuyo")
    expect(await reclamar()).toBe("en_curso")
  })

  it("keeps different failures of the same entity apart", async () => {
    expect(await reclamar(`pieza:${PIEZA}:abc`)).toBe("tuyo")
    expect(await reclamar(`pieza:${PIEZA}:def`)).toBe("tuyo")
  })

  it("refuses an unknown kind", async () => {
    await expect(reclamar("otra:1:abc", "carrusel")).rejects.toMatchObject({ code: "23514" })
  })

  it("lets Coni and the maintainer read, and nobody but service_role write", async () => {
    await reclamar()
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select clave from public.avisos_a_federico")).rows).toEqual([{ clave: CLAVE }])
        expect(
          (
            await fallaCon(
              c,
              "insert into public.avisos_a_federico (clave, tipo, entidad_id) values ('x', 'pieza', gen_random_uuid())",
            )
          ).code,
        ).toBe("42501")
        expect((await fallaCon(c, "update public.avisos_a_federico set enviado_en = now()")).code).toBe("42501")
        expect((await fallaCon(c, "delete from public.avisos_a_federico")).code).toBe("42501")
        expect(
          (await fallaCon(c, "select public.reclamar_aviso_a_federico('x', 'pieza', gen_random_uuid())")).code,
        ).toBe("42501")
        expect((await fallaCon(c, "select public.marcar_aviso_a_federico_enviado('x')")).code).toBe("42501")
        expect((await fallaCon(c, "select public.soltar_aviso_a_federico('x')")).code).toBe("42501")
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select * from public.avisos_a_federico")).rows).toEqual([])
    })
  })
})
