// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  almacenEnMemoria,
  claveAudio,
  claveLaminaDeCarrusel,
  claveMaterial,
  clavePdfDeCarrusel,
  claveVideo,
  claveVozAprobada,
  EXTENSIONES_DE_MATERIAL,
} from "@/lib/proveedores/almacen"

const PIEZA = "11111111-2222-4333-8444-555555555555"
const OTRA_PIEZA = "99999999-2222-4333-8444-555555555555"
const MP3 = new Uint8Array([73, 68, 51, 4, 0, 255, 251, 144])

describe("almacenEnMemoria", () => {
  it("stores an object and signs a URL for it", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("voces/a.mp3", MP3, "audio/mpeg")

    expect([...(almacen.obtener("voces/a.mp3")?.datos ?? [])]).toEqual([...MP3])
    expect(almacen.obtener("voces/a.mp3")?.tipo).toBe("audio/mpeg")
    const url = await almacen.urlFirmada("voces/a.mp3", 600)
    expect(url).toContain("voces/a.mp3")
    expect(url).toContain("600")
  })

  it("marks the signed URL as a download when a name is given", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("videos/a.mp4", MP3, "video/mp4")

    const url = await almacen.urlFirmada("videos/a.mp4", 600, { descargarComo: "reel.mp4" })

    expect(url).toContain("descarga=reel.mp4")
  })

  it("keeps its own copy of the bytes, so later changes to the buffer do not change the stored object", async () => {
    const almacen = almacenEnMemoria()
    const datos = new Uint8Array([1, 2, 3])
    await almacen.subir("a", datos, "audio/mpeg")
    datos[0] = 99
    expect([...(almacen.obtener("a")?.datos ?? [])]).toEqual([1, 2, 3])
  })

  it("replaces an object uploaded again under the same key", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("a", new Uint8Array([1]), "audio/mpeg")
    await almacen.subir("a", new Uint8Array([2]), "audio/mpeg")
    expect([...(almacen.obtener("a")?.datos ?? [])]).toEqual([2])
    expect(almacen.claves()).toEqual(["a"])
  })

  it("refuses to sign a URL for an object that is not there", async () => {
    await expect(almacenEnMemoria().urlFirmada("nada", 60)).rejects.toThrow("nada")
  })

  it("refuses a non-positive expiry", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("a", MP3, "audio/mpeg")
    await expect(almacen.urlFirmada("a", 0)).rejects.toThrow()
  })
})

describe("claveAudio", () => {
  it("is voces/<piece>/<sha256 of the bytes>.mp3", () => {
    const hash = createHash("sha256").update(MP3).digest("hex")
    expect(claveAudio(PIEZA, MP3)).toBe(`voces/${PIEZA}/${hash}.mp3`)
  })

  it("is deterministic for the same piece and bytes", () => {
    expect(claveAudio(PIEZA, MP3)).toBe(claveAudio(PIEZA, new Uint8Array(MP3)))
  })

  it("changes when the voice is generated again with different bytes, which voids gate 1", () => {
    const otra = new Uint8Array([...MP3, 0])
    expect(claveAudio(PIEZA, otra)).not.toBe(claveAudio(PIEZA, MP3))
  })

  it("changes with the piece", () => {
    expect(claveAudio(OTRA_PIEZA, MP3)).not.toBe(claveAudio(PIEZA, MP3))
  })

  it("rejects an id that is not a UUID, so a key never escapes its folder", () => {
    expect(() => claveAudio("../otra", MP3)).toThrow()
    expect(() => claveAudio("", MP3)).toThrow()
  })
})

describe("claveVideo", () => {
  it("is videos/<piece>/<sha256 of the bytes>.mp4", () => {
    const hash = createHash("sha256").update(MP3).digest("hex")
    expect(claveVideo(PIEZA, MP3)).toBe(`videos/${PIEZA}/${hash}.mp4`)
  })

  it("changes with the bytes and with the piece, so each render is its own object", () => {
    expect(claveVideo(PIEZA, new Uint8Array([...MP3, 0]))).not.toBe(claveVideo(PIEZA, MP3))
    expect(claveVideo(OTRA_PIEZA, MP3)).not.toBe(claveVideo(PIEZA, MP3))
  })

  it("rejects an id that is not a UUID, so a key never escapes its folder", () => {
    expect(() => claveVideo("../otra", MP3)).toThrow()
    expect(() => claveVideo("", MP3)).toThrow()
  })
})

describe("claveVozAprobada", () => {
  const HASH = "ab".repeat(32)

  it("is voces/<piece>/<gate 1 hash>.mp3, the same for every attempt at the same approval", () => {
    expect(claveVozAprobada(PIEZA, HASH)).toBe(`voces/${PIEZA}/${HASH}.mp3`)
  })

  it("changes with the approval and with the piece", () => {
    expect(claveVozAprobada(PIEZA, "cd".repeat(32))).not.toBe(claveVozAprobada(PIEZA, HASH))
    expect(claveVozAprobada(OTRA_PIEZA, HASH)).not.toBe(claveVozAprobada(PIEZA, HASH))
  })

  it("rejects a piece that is not a UUID and a hash that is not hex, so a key never escapes its folder", () => {
    expect(() => claveVozAprobada("../otra", HASH)).toThrow()
    expect(() => claveVozAprobada(PIEZA, "../x")).toThrow()
  })
})

describe("almacenEnMemoria.existe", () => {
  it("is true for a stored object and false for one that is not there", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("a", MP3, "audio/mpeg")

    expect(await almacen.existe("a")).toBe(true)
    expect(await almacen.existe("b")).toBe(false)
  })
})

const MATERIAL = "11111111-2222-4333-8444-555555555555"

describe("almacenEnMemoria.urlDeSubida", () => {
  it("gives a URL that lands the bytes at the key with the media type once the upload is simulated", async () => {
    const almacen = almacenEnMemoria()
    const clave = claveMaterial(MATERIAL, "pdf")

    const url = await almacen.urlDeSubida(clave, 600, "application/pdf")
    expect(almacen.claves()).toEqual([])
    almacen.simularSubida(url, MP3)

    expect([...(almacen.obtener(clave)?.datos ?? [])]).toEqual([...MP3])
    expect(almacen.obtener(clave)?.tipo).toBe("application/pdf")
  })

  it("refuses a key outside materiales/ and an expiry over one hour", async () => {
    const almacen = almacenEnMemoria()
    await expect(almacen.urlDeSubida("voces/a.mp3", 600, "audio/mpeg")).rejects.toThrow(FallaDeConfiguracion)
    await expect(almacen.urlDeSubida(claveMaterial(MATERIAL, "pdf"), 3601, "application/pdf")).rejects.toThrow()
    await expect(almacen.urlDeSubida(claveMaterial(MATERIAL, "pdf"), 0, "application/pdf")).rejects.toThrow()
  })

  it.each([...EXTENSIONES_DE_MATERIAL])("accepts the key claveMaterial gives for .%s", async (extension) => {
    await expect(
      almacenEnMemoria().urlDeSubida(claveMaterial(MATERIAL, extension), 600, "application/octet-stream"),
    ).resolves.toContain("materiales/")
  })

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    "accepts the key claveMaterial gives for image %i",
    async (orden) => {
      await expect(
        almacenEnMemoria().urlDeSubida(claveMaterial(MATERIAL, "jpg", orden), 600, "image/jpeg"),
      ).resolves.toContain("materiales/")
    },
  )

  it.each([
    "materiales/../x",
    "materiales/anything",
    `materiales/${MATERIAL}/otro.pdf`,
    `materiales/${MATERIAL}/original.exe`,
    `materiales/${MATERIAL}/original-21.jpg`,
    `materiales/${MATERIAL}/original-1.jpg`,
    `materiales/${MATERIAL}/original.pdf/x`,
  ])("refuses the key %s, which claveMaterial never produces", async (clave) => {
    await expect(almacenEnMemoria().urlDeSubida(clave, 600, "application/pdf")).rejects.toThrow(FallaDeConfiguracion)
  })

  it("refuses to simulate an upload to a URL it did not give", () => {
    expect(() => almacenEnMemoria().simularSubida("https://otro.test/x", MP3)).toThrow()
  })
})

describe("claveMaterial", () => {
  it("is materiales/<uuid>/original.<ext> with the extension lowercased", () => {
    expect(claveMaterial(MATERIAL, "PDF")).toBe(`materiales/${MATERIAL}/original.pdf`)
  })

  it("numbers the images of a multi-image material with two digits", () => {
    expect(claveMaterial(MATERIAL, "jpg", 3)).toBe(`materiales/${MATERIAL}/original-03.jpg`)
    expect(claveMaterial(MATERIAL, "heic", 20)).toBe(`materiales/${MATERIAL}/original-20.heic`)
  })

  it.each([0, 21, 1.5, -1])("refuses an order of %s", (orden) => {
    expect(() => claveMaterial(MATERIAL, "jpg", orden)).toThrow(FallaDeConfiguracion)
  })

  it.each(["exe", "", "pdf/../x", "tar.gz"])("refuses the extension %j", (extension) => {
    expect(() => claveMaterial(MATERIAL, extension)).toThrow(FallaDeConfiguracion)
  })

  it("refuses an id that is not a UUID", () => {
    expect(() => claveMaterial("../x", "pdf")).toThrow(FallaDeConfiguracion)
  })
})

describe("carousel keys", () => {
  const PIEZA = "c0000000-0000-4000-8000-0000000000aa"
  const CARRUSEL = "11111111-1111-4111-8111-111111111111"
  const CORRIDA = "22222222-2222-4222-8222-222222222222"

  it("puts every render of a version under its own folder inside the version's", () => {
    const carpeta = `carruseles/${PIEZA}/${CARRUSEL}/${CORRIDA}`
    expect(claveLaminaDeCarrusel(PIEZA, CARRUSEL, CORRIDA, 0)).toBe(`${carpeta}/lamina-01.png`)
    expect(claveLaminaDeCarrusel(PIEZA, CARRUSEL, CORRIDA, 7)).toBe(`${carpeta}/lamina-08.png`)
    expect(clavePdfDeCarrusel(PIEZA, CARRUSEL, CORRIDA)).toBe(`${carpeta}/carrusel.pdf`)
  })

  it("refuses ids that are not UUIDs and a slide past the eighth", () => {
    expect(() => claveLaminaDeCarrusel("x", CARRUSEL, CORRIDA, 0)).toThrow(Error)
    expect(() => clavePdfDeCarrusel(PIEZA, "../otro", CORRIDA)).toThrow(Error)
    expect(() => clavePdfDeCarrusel(PIEZA, CARRUSEL, "../otra")).toThrow(Error)
    expect(() => claveLaminaDeCarrusel(PIEZA, CARRUSEL, CORRIDA, 8)).toThrow(Error)
  })
})
