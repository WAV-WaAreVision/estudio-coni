import { afterAll, afterEach, describe, expect, it } from "vitest"
import { exigirBibliotecaSinPausa, exigirSinPausa, leerPausasAbiertas, leerPausasParaCerrar } from "@/lib/datos/pausas"
import { Falla } from "@/lib/dominio/falla"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"

afterAll(() => pool.end())
afterEach(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
})

describe("lecturas de pausas", () => {
  it("reads the open pauses with Coni's session and ignores closed ones", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('heygen', 'cuota', 'x')")
    const { rows } = await pool.query<{ pausa_id: string }>(
      "select pausa_id from public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')",
    )
    await pool.query("select public.cerrar_pausa_de_proveedor($1)", [rows[0]?.pausa_id])
    expect(await leerPausasAbiertas(await clienteDeConi())).toEqual(["heygen"])
  })

  it("refuses an action with the provider's text while it is paused", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'x')")
    const db = await clienteDeConi()
    const error = await exigirSinPausa(db, "elevenlabs").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Falla)
    expect((error as Falla).message).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    await expect(exigirSinPausa(db, "heygen")).resolves.toBeUndefined()
  })

  it("refuses the Biblioteca while Claude is paused, never for a Voyage pause", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('voyage', 'llave', 'x')")
    const db = await clienteDeConi()
    await expect(exigirBibliotecaSinPausa(db)).resolves.toBeUndefined()
    await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    const error = await exigirBibliotecaSinPausa(db).catch((e: unknown) => e)
    expect((error as Falla).message).toBe("La Biblioteca está en pausa. Ya le avisamos a WAV.")
  })

  it("lists what the maintenance step has to check", async () => {
    await pool.query("select public.abrir_pausa_de_proveedor('claude', 'cuota', 'x')")
    expect(await leerPausasParaCerrar(clienteDeServicio())).toMatchObject([{ proveedor: "claude", motivo: "cuota" }])
  })
})
