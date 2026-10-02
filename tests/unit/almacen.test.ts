// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { almacenEnMemoria, claveAudio, claveVideo, claveVozAprobada } from "@/lib/proveedores/almacen"

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
