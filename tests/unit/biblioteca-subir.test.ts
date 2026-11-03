import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ROLES } from "@/lib/dominio/biblioteca/modelo"
import {
  ACEPTA_TODO,
  ACEPTA_VIDEO,
  EXTENSIONES_POR_TIPO,
  extensionDe,
  leerEntrada,
  MAXIMO_DE_IMAGENES,
  TAMANO_MAXIMO_BYTES,
  tipoDeContenido,
} from "@/lib/dominio/biblioteca/subir"
import { EXTENSIONES_DE_MATERIAL } from "@/lib/proveedores/almacen"

const AUTOR = "11111111-2222-4333-8444-555555555555"
const base = { autorId: AUTOR, rol: "referente", declaracion: true }
const archivo = (nombre: string, tamano = 1000) => ({ nombre, tamano })

function error(entrada: unknown): string {
  const resultado = leerEntrada(entrada)
  if (resultado.ok) throw new Error("Se esperaba un error y la entrada pasó")
  return resultado.error
}

describe("leerEntrada: types with one file", () => {
  it.each([
    ["documento", "tesis.PDF"],
    ["documento", "notas.docx"],
    ["documento", "notas.txt"],
    ["audio", "charla.mp3"],
    ["audio", "charla.m4a"],
    ["audio", "charla.wav"],
    ["video", "clase.mp4"],
    ["video", "clase.mov"],
  ])("accepts one %s file named %s", (tipo, nombre) => {
    expect(leerEntrada({ ...base, tipo, archivos: [archivo(nombre)] }).ok).toBe(true)
  })

  it.each([
    ["documento", "charla.mp3", "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto."],
    ["audio", "tesis.pdf", "Ese archivo no sirve como audio. Sube un mp3, m4a o wav."],
    ["video", "tesis.pdf", "Ese archivo no sirve como video. Sube un mp4 o mov."],
    ["documento", "virus.exe", "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto."],
  ])("refuses a %s file named %s", (tipo, nombre, mensaje) => {
    expect(error({ ...base, tipo, archivos: [archivo(nombre)] })).toBe(mensaje)
  })

  it.each(["documento", "audio", "video"])("needs exactly one file for %s", (tipo) => {
    const nombre = tipo === "documento" ? "a.pdf" : tipo === "audio" ? "a.mp3" : "a.mp4"
    expect(error({ ...base, tipo, archivos: [] })).toBe("Falta el archivo.")
    expect(error({ ...base, tipo, archivos: [archivo(nombre), archivo(nombre)] })).toBe("Sube un solo archivo.")
  })
})

describe("leerEntrada: images", () => {
  it("accepts from one to twenty images", () => {
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: [archivo("a.jpg")] }).ok).toBe(true)
    const veinte = Array.from({ length: MAXIMO_DE_IMAGENES }, (_, i) => archivo(`${i}.png`))
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: veinte }).ok).toBe(true)
  })

  it("refuses twenty one images and none", () => {
    const veintiuna = Array.from({ length: MAXIMO_DE_IMAGENES + 1 }, (_, i) => archivo(`${i}.png`))
    expect(error({ ...base, tipo: "imagen", archivos: veintiuna })).toBe("Puedes subir hasta 20 imágenes.")
    expect(error({ ...base, tipo: "imagen", archivos: [] })).toBe("Falta el archivo.")
  })

  it.each(["a.jpg", "a.jpeg", "a.png", "a.webp", "a.heic"])("accepts %s", (nombre) => {
    expect(leerEntrada({ ...base, tipo: "imagen", archivos: [archivo(nombre)] }).ok).toBe(true)
  })

  it("refuses a file that is not an image", () => {
    expect(error({ ...base, tipo: "imagen", archivos: [archivo("a.gif")] })).toBe(
      "Ese archivo no sirve como imagen. Sube jpg, png, webp o heic.",
    )
  })
})

describe("leerEntrada: link and post", () => {
  it("needs an http or https address for a link and no files", () => {
    expect(leerEntrada({ ...base, tipo: "link", url: "https://example.com/nota", archivos: [] }).ok).toBe(true)
    expect(error({ ...base, tipo: "link", archivos: [] })).toBe("Falta el link.")
    expect(error({ ...base, tipo: "link", url: "javascript:alert(1)", archivos: [] })).toBe(
      "Ese link no parece una dirección web válida.",
    )
    expect(error({ ...base, tipo: "link", url: "https://example.com", archivos: [archivo("a.pdf")] })).toBe(
      "Un link no lleva archivos.",
    )
  })

  it("needs the pasted transcript for a YouTube link and keeps it with the address", () => {
    const youtube = "https://www.youtube.com/watch?v=abc123"
    expect(error({ ...base, tipo: "link", url: youtube, archivos: [] })).toBe("Pega la transcripción del video.")
    expect(error({ ...base, tipo: "link", url: youtube, textoPegado: "   ", archivos: [] })).toBe(
      "Pega la transcripción del video.",
    )
    expect(leerEntrada({ ...base, tipo: "link", url: youtube, textoPegado: " Hola ", archivos: [] })).toMatchObject({
      ok: true,
      datos: { url: youtube, textoPegado: "Hola" },
    })
  })

  it("does not ask for text on other links and drops any it receives", () => {
    expect(
      leerEntrada({ ...base, tipo: "link", url: "https://example.com/nota", textoPegado: "x", archivos: [] }),
    ).toMatchObject({ ok: true, datos: { textoPegado: null } })
  })

  it("needs pasted text for a post and takes an optional video", () => {
    expect(leerEntrada({ ...base, tipo: "post", textoPegado: "Hola", archivos: [] }).ok).toBe(true)
    expect(leerEntrada({ ...base, tipo: "post", textoPegado: "Hola", archivos: [archivo("v.mp4")] }).ok).toBe(true)
    expect(error({ ...base, tipo: "post", textoPegado: "   ", archivos: [] })).toBe("Falta el texto del post.")
    expect(error({ ...base, tipo: "post", textoPegado: "Hola", archivos: [archivo("v.pdf")] })).toBe(
      "Ese archivo no sirve como video. Sube un mp4 o mov.",
    )
  })
})

describe("leerEntrada: the other fields", () => {
  it("trims the title and turns a blank one into null", () => {
    const con = leerEntrada({ ...base, tipo: "documento", titulo: "  Apego adulto ", archivos: [archivo("a.pdf")] })
    const sin = leerEntrada({ ...base, tipo: "documento", titulo: "   ", archivos: [archivo("a.pdf")] })
    expect(con.ok && con.datos.titulo).toBe("Apego adulto")
    expect(sin.ok && sin.datos.titulo).toBeNull()
  })

  it("keeps the reference link only for videos and images, and only if it is a web address", () => {
    const video = leerEntrada({
      ...base,
      tipo: "video",
      referencia: "https://instagram.com/p/x",
      archivos: [archivo("a.mp4")],
    })
    expect(video.ok && video.datos.referencia).toBe("https://instagram.com/p/x")
    const documento = leerEntrada({
      ...base,
      tipo: "documento",
      referencia: "https://x.cl",
      archivos: [archivo("a.pdf")],
    })
    expect(documento.ok && documento.datos.referencia).toBeNull()
    expect(error({ ...base, tipo: "video", referencia: "ftp://x.cl", archivos: [archivo("a.mp4")] })).toBe(
      "Ese link no parece una dirección web válida.",
    )
  })

  it("accepts a file of exactly 2 GB and refuses one byte more or an empty one", () => {
    expect(leerEntrada({ ...base, tipo: "video", archivos: [archivo("a.mp4", TAMANO_MAXIMO_BYTES)] }).ok).toBe(true)
    expect(error({ ...base, tipo: "video", archivos: [archivo("a.mp4", TAMANO_MAXIMO_BYTES + 1)] })).toBe(
      "Ese archivo pesa más de 2 GB.",
    )
    expect(error({ ...base, tipo: "video", archivos: [archivo("a.mp4", 0)] })).toBe("Ese archivo está vacío.")
  })

  it("requires the declaration that there is no patient data", () => {
    expect(error({ ...base, declaracion: false, tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Marca que el material no contiene datos de pacientes.",
    )
  })

  it("asks for an author, and refuses one that is not an id", () => {
    expect(error({ ...base, autorId: "", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe("Elige el autor.")
    expect(error({ ...base, autorId: "Esther", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Elige el autor.",
    )
  })

  it.each(ROLES)("accepts the role %s", (rol) => {
    expect(leerEntrada({ ...base, rol, tipo: "documento", archivos: [archivo("a.pdf")] }).ok).toBe(true)
  })

  it("asks who it is for her in her words (4h), and refuses a role that does not exist", () => {
    expect(error({ ...base, rol: "", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe("Elige quién es para ti.")
    expect(error({ ...base, rol: "jefa", tipo: "documento", archivos: [archivo("a.pdf")] })).toBe(
      "Elige quién es para ti.",
    )
  })

  it("refuses a type that does not exist, and says it did not understand something that is not an object", () => {
    expect(error({ ...base, tipo: "planilla", archivos: [] })).toBe("Elige qué tipo de material es.")
    expect(error(null)).toBe("No entendí esa solicitud. Vuelve a abrir la pantalla.")
  })
})

describe("extensions and content types", () => {
  it("only takes extensions the store signs an upload for", () => {
    for (const extensiones of Object.values(EXTENSIONES_POR_TIPO)) {
      for (const extension of extensiones) expect(EXTENSIONES_DE_MATERIAL.has(extension), extension).toBe(true)
    }
  })

  it("offers every extension it takes in the file picker, and only videos for a post", () => {
    expect(ACEPTA_TODO.split(",").sort()).toEqual(
      Object.values(EXTENSIONES_POR_TIPO)
        .flat()
        .map((extension) => `.${extension}`)
        .sort(),
    )
    expect(ACEPTA_VIDEO).toBe(".mp4,.mov")
  })

  it("reads the extension in lower case, and none when there is no dot", () => {
    expect(extensionDe("Tesis.Final.PDF")).toBe("pdf")
    expect(extensionDe("sin-punto")).toBe("")
  })

  it.each([
    ["pdf", "application/pdf"],
    ["MP3", "audio/mpeg"],
    ["m4a", "audio/mp4"],
    ["wav", "audio/wav"],
    ["mp4", "video/mp4"],
    ["mov", "video/quicktime"],
    ["jpg", "image/jpeg"],
    ["heic", "image/heic"],
    ["txt", "text/plain"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("maps .%s to %s", (extension, esperado) => {
    expect(tipoDeContenido(extension)).toBe(esperado)
  })
})

it("writes Coni's copy without an em dash", () => {
  expect(readFileSync(join(__dirname, "../../lib/dominio/biblioteca/subir.ts"), "utf-8")).not.toContain("\u2014")
})
