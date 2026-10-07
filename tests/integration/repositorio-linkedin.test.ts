import { afterAll, afterEach, describe, expect, it } from "vitest"
import {
  guardarPostLinkedin,
  guardarVideoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPublicaciones,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { pool } from "./db"
import { crearProgramada, limpiarProgramadas } from "./programadas"
import { clienteDeServicio } from "./servicio"

const db = clienteDeServicio()
afterEach(async () => {
  await limpiarProgramadas()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

const LINKEDIN = { destinos: ["linkedin"] as const, textoLinkedin: "Hola LinkedIn" }

describe("leerConexionLinkedin", () => {
  it("is null without a token, and returns token, member and expiry when connected", async () => {
    expect(await leerConexionLinkedin(db)).toBeNull()
    await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = '2031-03-01T00:00:00Z'",
    )
    expect(await leerConexionLinkedin(db)).toEqual({
      token: "AQV_token_de_prueba",
      miembro: "urn:li:person:x",
      expiraEn: "2031-03-01T00:00:00+00:00",
    })
  })
})

describe("the LinkedIn row", () => {
  it("walks video, reserve and post, ending publicado with the permalink", async () => {
    const id = await crearProgramada(undefined, LINKEDIN)
    await guardarVideoLinkedin(db, id, "urn:li:video:C1")
    const fila = await leerFilaLinkedin(db, id)
    expect(fila).toMatchObject({ estado: "esperando", videoUrn: "urn:li:video:C1", enviadoEn: null, intentos: 0 })

    const version = (await pool.query("select version from public.piezas where id = $1", [id])).rows[0].version
    expect(await reservarEnvioLinkedin(db, id, version)).toBe(version + 1)
    await guardarPostLinkedin(db, id, { postUrn: "urn:li:share:9", hashEnviado: "h".repeat(64) })

    const [publicacion] = await leerPublicaciones(db, id)
    expect(publicacion).toMatchObject({
      destino: "linkedin",
      estado: "publicado",
      enlace: "https://www.linkedin.com/feed/update/urn:li:share:9/",
    })
  })

  it("counts a failed try, clearing the video when asked, and falls back to manual with a reason", async () => {
    const id = await crearProgramada(undefined, LINKEDIN)
    await guardarVideoLinkedin(db, id, "urn:li:video:C1")
    await sumarIntentoLinkedin(db, id, { error: "PROCESSING_FAILED", borrarVideo: true })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ intentos: 1, videoUrn: null })

    await pasarLinkedinAMano(db, id, { explicacion: "Razón para Coni.", error: "detalle" })
    const [publicacion] = await leerPublicaciones(db, id)
    expect(publicacion).toMatchObject({ estado: "para_subir", explicacion: "Razón para Coni." })
  })
})
