import { afterAll, afterEach, describe, expect, it } from "vitest"
import { hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { comoConi, pool } from "./db"
import { aplicar, crearPiezaEn, TEXTO, VIDEO } from "./flujo"
import { clienteDeConi } from "./sesion-coni"
import { publicacionesConDetalle } from "./siembra"

const LINKEDIN = "Texto para LinkedIn.\n\nEste video lo narra mi avatar digital."
const creadas: string[] = []

afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

async function programadaConLinkedin(): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const destinos = ["linkedin"] as const
    const id = await crearPiezaEn(c, "video_por_aprobar", { destinos, textoLinkedin: LINKEDIN })
    const hash = hashTextoDePuerta2(2, { texto: TEXTO, textoLinkedin: LINKEDIN, destinos })
    await aplicar(
      c,
      id,
      comoConi,
      {
        tipo: "aprobar_video",
        actor: "coni",
        videoVisto: VIDEO,
        hashTextoVisto: hash,
        hashTextoActual: hash,
        formula: 2,
        publicarEn: "2031-03-14T22:00:00.000Z",
        en: new Date().toISOString(),
      },
      { destinos: [...destinos] },
    )
    await c.query("commit")
    creadas.push(id)
    return id
  } finally {
    c.release()
  }
}

async function version(id: string): Promise<number> {
  return (await pool.query<{ version: number }>("select version from public.piezas where id = $1", [id])).rows[0]
    .version
}

describe("publicaciones for LinkedIn", () => {
  it("refuses a published LinkedIn row without a post URN", async () => {
    const id = await programadaConLinkedin()
    await expect(
      pool.query("update public.publicaciones set estado = 'publicado' where pieza_id = $1 and destino = 'linkedin'", [
        id,
      ]),
    ).rejects.toThrow(/linkedin_publicado_con_urn/)
  })

  it("refuses a post URN that is not a share or a ugcPost", async () => {
    const id = await programadaConLinkedin()
    await expect(
      pool.query("update public.publicaciones set post_urn = 'urn:li:video:1' where pieza_id = $1", [id]),
    ).rejects.toThrow(/post_urn_es_de_post/)
  })
})

describe("reservar_envio_linkedin", () => {
  it("marks the row as sent and bumps the piece version once", async () => {
    const id = await programadaConLinkedin()
    await pool.query("update public.publicaciones set video_urn = 'urn:li:video:C1' where pieza_id = $1", [id])
    const antes = await version(id)
    const { rows } = await pool.query<{ v: number }>("select public.reservar_envio_linkedin($1, $2) as v", [id, antes])
    expect(rows[0].v).toBe(antes + 1)
    const [fila] = await publicacionesConDetalle(id)
    expect(fila.enviado_en).not.toBeNull()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, antes + 1])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("refuses an old version", async () => {
    const id = await programadaConLinkedin()
    await pool.query("update public.publicaciones set video_urn = 'urn:li:video:C1' where pieza_id = $1", [id])
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, 0])).rejects.toThrow(
      /version_desfasada/,
    )
  })

  it("refuses without an uploaded video", async () => {
    const id = await programadaConLinkedin()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, await version(id)])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("is not callable by Coni's session", async () => {
    const id = await programadaConLinkedin()
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("reservar_envio_linkedin", { p_pieza: id, p_version: await version(id) })
    expect(error).not.toBeNull()
  })
})

describe("marcar_subido_como_coni with LinkedIn connected", () => {
  it("refuses an early manual mark of a waiting LinkedIn row while LinkedIn is connected", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_token_expira_en = now() + interval '30 days', linkedin_conectado_en = now()",
    )
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("marcar_subido_como_coni", {
      p_pieza: id,
      p_version: await version(id),
      p_destino: "linkedin",
      p_enlace: "",
    })
    expect(error?.message).toMatch(/linkedin_se_publica_solo/)
  })

  it("refuses to mark a LinkedIn row whose send is in doubt, even when LinkedIn is not connected", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("marcar_subido_como_coni", {
      p_pieza: id,
      p_version: await version(id),
      p_destino: "linkedin",
      p_enlace: "",
    })
    expect(error?.message).toMatch(/linkedin_envio_en_duda/)
  })

  it("lets her mark it once the row fell back to para_subir", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_token_expira_en = now() + interval '30 days', linkedin_conectado_en = now()",
    )
    await pool.query("update public.publicaciones set estado = 'para_subir', explicacion = 'x' where pieza_id = $1", [
      id,
    ])
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("marcar_subido_como_coni", {
      p_pieza: id,
      p_version: await version(id),
      p_destino: "linkedin",
      p_enlace: "",
    })
    expect(error).toBeNull()
  })
})

describe("sincronizar_publicaciones keeps a row in flight", () => {
  it("does not delete a sent LinkedIn row when gate 2 is taken back", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    const c = await pool.connect()
    try {
      await aplicar(c, id, comoConi, { tipo: "cambiar_fecha" })
    } finally {
      c.release()
    }
    const filas = await publicacionesConDetalle(id)
    expect(filas).toHaveLength(1)
    expect(filas[0].enviado_en).not.toBeNull()
  })
})

describe("proteger_pieza lets the system close a mixed piece", () => {
  it("allows programado -> publicado_a_mano by the service role when nothing is pending", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.publicaciones set estado = 'publicado', post_urn = 'urn:li:share:1', enviado_en = now(), video_urn = 'urn:li:video:C1' where pieza_id = $1",
      [id],
    )
    const v = await version(id)
    await expect(
      pool.query("update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1", [id, v + 1]),
    ).resolves.toBeDefined()
  })

  it("still refuses it while a row is pending", async () => {
    const id = await programadaConLinkedin()
    const v = await version(id)
    await expect(
      pool.query("update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1", [id, v + 1]),
    ).rejects.toThrow(/solo_coni_entra_a_puerta/)
  })
})
