import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

const MIEMBRO = "urn:li:person:abc123XYZ"
const EXPIRA = "2031-01-01T00:00:00.000Z"

let coni: Awaited<ReturnType<typeof clienteDeConi>>
let mantenedor: Awaited<ReturnType<typeof clienteDelMantenedor>>

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

afterAll(() => pool.end())

async function secreto(): Promise<string | null> {
  const { rows } = await pool.query<{ decrypted_secret: string }>(
    "select decrypted_secret from vault.decrypted_secrets where name = 'linkedin'",
  )
  return rows[0]?.decrypted_secret ?? null
}

describe("conectar_linkedin", () => {
  it("saves the token in Vault and the member, name and expiry in ajustes in one call", async () => {
    const { error } = await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "Coni del Rosario",
      p_expira_en: EXPIRA,
    })
    expect(error).toBeNull()
    expect(await secreto()).toBe("AQV_token_de_prueba")
    const { rows } = await pool.query(
      "select linkedin_miembro, linkedin_nombre, linkedin_token_expira_en, linkedin_conectado_en from public.ajustes",
    )
    expect(rows[0]).toMatchObject({ linkedin_miembro: MIEMBRO, linkedin_nombre: "Coni del Rosario" })
    expect(rows[0].linkedin_conectado_en).not.toBeNull()
  })

  it("refuses anyone but Coni", async () => {
    const { error } = await mantenedor.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "",
      p_expira_en: EXPIRA,
    })
    expect(error?.message).toMatch(/solo_coni_conecta_linkedin/)
    expect(await secreto()).toBeNull()
  })

  it("refuses a member that is not a person URN", async () => {
    const { error } = await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: "urn:li:organization:1",
      p_nombre: "",
      p_expira_en: EXPIRA,
    })
    expect(error?.message).toMatch(/miembro_invalido/)
  })

  it("does not let guardar_secreto write the linkedin token", async () => {
    const { error } = await coni.rpc("guardar_secreto", { p_nombre: "linkedin", p_valor: "pegada" })
    expect(error?.message).toMatch(/cuenta_desconocida/)
  })
})

describe("desconectar_linkedin and linkedin_conectado", () => {
  it("reports connected only with a member and an expiry in the future", async () => {
    await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "",
      p_expira_en: EXPIRA,
    })
    expect((await pool.query("select public.linkedin_conectado() as si")).rows[0].si).toBe(true)
    await pool.query("update public.ajustes set linkedin_token_expira_en = now() - interval '1 minute'")
    expect((await pool.query("select public.linkedin_conectado() as si")).rows[0].si).toBe(false)
  })

  it("deletes the token and clears the columns when Coni disconnects", async () => {
    await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "Coni",
      p_expira_en: EXPIRA,
    })
    const { error } = await coni.rpc("desconectar_linkedin")
    expect(error).toBeNull()
    expect(await secreto()).toBeNull()
    const { rows } = await pool.query("select linkedin_miembro, linkedin_token_expira_en from public.ajustes")
    expect(rows[0]).toEqual({ linkedin_miembro: null, linkedin_token_expira_en: null })
  })

  it("refuses a half-saved connection in ajustes", async () => {
    await expect(pool.query("update public.ajustes set linkedin_miembro = 'urn:li:person:x'")).rejects.toThrow(
      /linkedin_completo/,
    )
  })

  it("accepts the linkedin_por_vencer notice type", async () => {
    await expect(
      pool.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('linkedin_por_vencer', 'prueba:linkedin', 'x')",
      ),
    ).resolves.toBeDefined()
    await pool.query("delete from public.avisos where clave = 'prueba:linkedin'")
  })
})
