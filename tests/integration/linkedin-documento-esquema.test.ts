import { afterAll, afterEach, describe, expect, it } from "vitest"
import { pool } from "./db"
import { PUBLICAR_EN } from "./programadas"
import { borrarSembrado, leerFila, publicacionesConDetalle, sembrarCarrusel } from "./siembra"

const DOCUMENTO = "urn:li:document:D5510AQprueba"
const creadas: string[] = []
afterEach(async () => {
  await borrarSembrado(creadas, [])
  creadas.length = 0
})
afterAll(() => pool.end())

async function programado(): Promise<string> {
  const id = await sembrarCarrusel("programado", { publicarEn: PUBLICAR_EN })
  creadas.push(id)
  return id
}

async function version(id: string): Promise<number> {
  return (await leerFila(id)).version
}

describe("reservar_envio_linkedin for a carousel (part 3, P3-4)", () => {
  it("reserves a row with its document, marks it sent and bumps the piece once", async () => {
    const id = await programado()
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    const antes = await version(id)
    const { rows } = await pool.query<{ v: number }>("select public.reservar_envio_linkedin($1, $2) as v", [id, antes])
    expect(rows[0]?.v).toBe(antes + 1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila?.enviado_en).not.toBeNull()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, antes + 1])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("still refuses a row with neither a video nor a document", async () => {
    const id = await programado()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, await version(id)])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("still refuses a stale version", async () => {
    const id = await programado()
    await pool.query("update public.publicaciones set documento_urn = $2 where pieza_id = $1", [id, DOCUMENTO])
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, 0])).rejects.toThrow(
      /version_desfasada/,
    )
  })

  it("keeps one medium per row", async () => {
    const id = await programado()
    await expect(
      pool.query(
        "update public.publicaciones set documento_urn = $2, video_urn = 'urn:li:video:C1' where pieza_id = $1",
        [id, DOCUMENTO],
      ),
    ).rejects.toThrow(/un_solo_medio/)
  })

  it("lets the service close a carousel as publicado once its LinkedIn row has the post", async () => {
    const id = await programado()
    await pool.query(
      `update public.publicaciones set documento_urn = $2, enviado_en = now(), estado = 'publicado',
         post_urn = 'urn:li:share:71', enlace = 'https://www.linkedin.com/feed/update/urn:li:share:71/', marcado_en = now()
       where pieza_id = $1`,
      [id, DOCUMENTO],
    )
    const c = await pool.connect()
    try {
      await c.query("begin")
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })])
      await c.query("set local role service_role")
      await c.query("update public.piezas set estado = 'publicado', version = version + 1 where id = $1", [id])
      await c.query("commit")
    } finally {
      c.release()
    }
    expect((await leerFila(id)).estado).toBe("publicado")
  })
})
