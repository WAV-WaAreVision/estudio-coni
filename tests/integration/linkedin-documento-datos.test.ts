import { afterAll, afterEach, describe, expect, it } from "vitest"
import {
  guardarDocumentoLinkedin,
  guardarVideoLinkedin,
  leerFilaLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { pool } from "./db"
import { PUBLICAR_EN } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarCarrusel } from "./siembra"

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

describe("a carousel's LinkedIn row from the service", () => {
  it("stores the document, reads it back, and clears it when a try fails processing", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: DOCUMENTO, videoUrn: null, intentos: 0 })

    await sumarIntentoLinkedin(db, id, { error: "PROCESSING_FAILED", borrarVideo: false, borrarDocumento: true })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: null, intentos: 1 })
  })

  it("keeps the document on a temporary failure", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    await sumarIntentoLinkedin(db, id, { error: "503", borrarVideo: false })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ documentoUrn: DOCUMENTO, intentos: 1 })
  })

  it("refuses something that is not a document, and a video beside it", async () => {
    const db = clienteDeServicio()
    const id = await programado()
    await expect(guardarDocumentoLinkedin(db, id, "urn:li:video:C1")).rejects.toThrow(/documento_urn_es_de_documento/)
    await guardarDocumentoLinkedin(db, id, DOCUMENTO)
    await expect(guardarVideoLinkedin(db, id, "urn:li:video:C1")).rejects.toThrow(/un_solo_medio/)
  })
})
