import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  AVISO_TRAS_SUBIR,
  armarEntrada,
  type Borrador,
  GUARDANDO,
  HREF_TRAS_SUBIR,
  juntarArchivos,
  moverArchivo,
  PREPARANDO,
  progresoDeSubida,
  RUTA_DE_SUBIR,
  vieneDeSubir,
} from "@/lib/dominio/biblioteca/borrador-de-subida"
import { leerEntrada, TAMANO_MAXIMO_BYTES } from "@/lib/dominio/biblioteca/subir"

const AUTOR = "11111111-2222-4333-8444-555555555555"
const archivo = (name: string, size = 10) => ({ name, size })

const borrador = (
  extra: Partial<Borrador<{ name: string; size: number }>>,
): Borrador<{ name: string; size: number }> => ({
  tipo: "documento",
  texto: "",
  archivos: [],
  videoDelPost: null,
  transcripcion: "",
  referencia: "",
  titulo: "",
  autorId: AUTOR,
  rol: "referente",
  declaracion: true,
  ...extra,
})

describe("armarEntrada", () => {
  it("sends a document's file and nothing pasted", () => {
    const pdf = archivo("tesis.pdf", 500)
    const { entrada, aSubir } = armarEntrada(
      borrador({ tipo: "documento", archivos: [pdf], referencia: "https://x.cl" }),
    )
    expect(aSubir).toEqual([pdf])
    expect(entrada).toEqual({
      tipo: "documento",
      titulo: "",
      autorId: AUTOR,
      rol: "referente",
      declaracion: true,
      url: "",
      textoPegado: "",
      referencia: "",
      archivos: [{ nombre: "tesis.pdf", tamano: 500 }],
    })
    expect(leerEntrada(entrada).ok).toBe(true)
  })

  it("sends a YouTube link with its transcript, and another link without the transcript", () => {
    const youtube = armarEntrada(
      borrador({ tipo: "link", texto: "  https://youtu.be/abc  ", transcripcion: "Hola a todos" }),
    )
    expect(youtube.entrada).toMatchObject({ url: "https://youtu.be/abc", textoPegado: "Hola a todos", archivos: [] })
    expect(youtube.aSubir).toEqual([])
    const otro = armarEntrada(borrador({ tipo: "link", texto: "https://ejemplo.cl/nota", transcripcion: "x" }))
    expect(otro.entrada).toMatchObject({ url: "https://ejemplo.cl/nota", textoPegado: "" })
  })

  it("sends a post's text with its optional video, never the main files", () => {
    const video = archivo("clase.mp4", 99)
    const { entrada, aSubir } = armarEntrada(
      borrador({ tipo: "post", texto: "Mi texto", archivos: [archivo("a.pdf")], videoDelPost: video }),
    )
    expect(entrada).toMatchObject({ textoPegado: "Mi texto", archivos: [{ nombre: "clase.mp4", tamano: 99 }] })
    expect(aSubir).toEqual([video])
  })

  it("keeps the reference link only for a video or images", () => {
    const imagenes = [archivo("a.jpg"), archivo("b.png")]
    const conReferencia = armarEntrada(borrador({ tipo: "imagen", archivos: imagenes, referencia: "https://ig.cl/p" }))
    expect(conReferencia.entrada).toMatchObject({ referencia: "https://ig.cl/p" })
    expect(conReferencia.aSubir).toEqual(imagenes)
    expect(
      armarEntrada(borrador({ tipo: "audio", archivos: [archivo("a.mp3")], referencia: "https://x.cl" })).entrada,
    ).toMatchObject({ referencia: "" })
  })
})

describe("juntarArchivos", () => {
  it("replaces what was picked unless both are images", () => {
    expect(juntarArchivos([archivo("a.pdf")], [archivo("b.mp3")])).toEqual({
      archivos: [archivo("b.mp3")],
      error: null,
    })
    expect(juntarArchivos([archivo("a.jpg")], [archivo("b.pdf")])).toEqual({
      archivos: [archivo("b.pdf")],
      error: null,
    })
  })

  it("adds images to the images already there, in the order picked", () => {
    expect(
      juntarArchivos([archivo("a.jpg")], [archivo("b.png"), archivo("c.heic")]).archivos.map((a) => a.name),
    ).toEqual(["a.jpg", "b.png", "c.heic"])
  })

  it("keeps twenty images and says it takes no more", () => {
    const diecinueve = Array.from({ length: 19 }, (_, i) => archivo(`${i}.jpg`))
    const juntas = juntarArchivos(diecinueve, [archivo("x.jpg"), archivo("y.jpg")])
    expect(juntas.archivos).toHaveLength(20)
    expect(juntas.error).toBe("Puedes subir hasta 20 imágenes.")
  })

  it("drops a file over 2 GB and says so", () => {
    const juntas = juntarArchivos([], [archivo("enorme.mp4", TAMANO_MAXIMO_BYTES + 1)])
    expect(juntas).toEqual({ archivos: [], error: "Ese archivo pesa más de 2 GB." })
  })
})

describe("moverArchivo", () => {
  const lista = ["a", "b", "c"]

  it("moves one place before or after", () => {
    expect(moverArchivo(lista, 2, -1)).toEqual(["a", "c", "b"])
    expect(moverArchivo(lista, 0, 1)).toEqual(["b", "a", "c"])
  })

  it("leaves the list as it was past either end, without changing the one it got", () => {
    expect(moverArchivo(lista, 0, -1)).toEqual(lista)
    expect(moverArchivo(lista, 2, 1)).toEqual(lista)
    expect(lista).toEqual(["a", "b", "c"])
  })
})

describe("progresoDeSubida", () => {
  it("says which file is going up, and saving when there is none", () => {
    expect(progresoDeSubida(0, 3)).toBe("Subiendo 1 de 3")
    expect(progresoDeSubida(2, 3)).toBe("Subiendo 3 de 3")
    expect(progresoDeSubida(3, 3)).toBe("Subiendo 3 de 3")
    expect(progresoDeSubida(0, 0)).toBe(GUARDANDO)
    expect([PREPARANDO, GUARDANDO]).toEqual(["Preparando…", "Guardando…"])
  })
})

describe("after the upload", () => {
  it("goes to the list with the notice, and the list knows it came from Subir", () => {
    expect(RUTA_DE_SUBIR).toBe("/biblioteca/subir")
    expect(HREF_TRAS_SUBIR).toBe("/biblioteca?subido=1")
    expect(AVISO_TRAS_SUBIR).toBe("Lo estoy procesando.")
    expect(vieneDeSubir({ subido: "1" })).toBe(true)
    expect(vieneDeSubir({ subido: ["1", "x"] })).toBe(true)
    expect(vieneDeSubir({})).toBe(false)
    expect(vieneDeSubir({ subido: "0" })).toBe(false)
  })
})

it("writes Coni's copy without an em dash", () => {
  const ruta = join(__dirname, "../../lib/dominio/biblioteca/borrador-de-subida.ts")
  expect(readFileSync(ruta, "utf-8")).not.toContain("\u2014")
})
