// @vitest-environment node
import type { Server } from "node:http"
import { http, passthrough } from "msw"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { almacenR2, claveMaterial } from "@/lib/proveedores/almacen"
import { crearAlmacenFalso } from "../e2e/almacen-falso-servidor"
import { servidor } from "../msw"

const ID = "11111111-2222-4333-8444-555555555555"
let falso: Server
let puerto = 0

beforeAll(async () => {
  falso = crearAlmacenFalso()
  await new Promise<void>((listo) => falso.listen(0, "127.0.0.1", listo))
  const direccion = falso.address()
  if (direccion === null || typeof direccion === "string") throw new Error("El almacén falso no tiene puerto")
  puerto = direccion.port
})

afterAll(async () => {
  await new Promise<void>((cerrado) => falso.close(() => cerrado()))
})

// MSW blocks every request it does not know: this one is the fake on this machine.
beforeEach(() => servidor.use(http.all(`http://127.0.0.1:${puerto}/*`, () => passthrough())))

describe("the fake S3 of the E2E run", () => {
  it("takes a presigned PUT, then the real store code measures, signs the text download, serves it and deletes the folder", async () => {
    const almacen = almacenR2({
      cuenta: "cuenta-e2e",
      llave: "llave-e2e",
      secreto: "secreto-e2e",
      balde: "conidolly-e2e",
      endpoint: `http://127.0.0.1:${puerto}`,
    })
    const original = claveMaterial(ID, "pdf")

    const subida = await almacen.urlDeSubida(original, 600, "application/pdf")
    const puesto = await fetch(subida, { method: "PUT", body: "pdf", headers: { "content-type": "application/pdf" } })
    expect(puesto.status).toBe(200)
    expect(await almacen.tamano(original)).toBe(3)

    await almacen.subir(`materiales/${ID}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    const descarga = await fetch((await almacen.urlDeTexto(ID, 300)) ?? "")
    expect(await descarga.text()).toBe("hola")
    expect(descarga.headers.get("content-disposition")).toBe('attachment; filename="texto-original.txt"')

    expect(await almacen.borrarCarpeta(ID)).toBe(2)
    expect(await almacen.tamano(original)).toBeNull()
    expect(await almacen.urlDeTexto(ID, 300)).toBeNull()
  })
})
