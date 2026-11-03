import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  AYUDA_DEL_CAMPO,
  detectarTipo,
  FALTA_LA_ENTRADA,
  MAXIMO_DE_IMAGENES,
  NO_RECONOZCO,
  tipoEfectivo,
} from "@/lib/dominio/biblioteca/subir"

const archivos = (...nombres: string[]) => nombres.map((name) => ({ name }))
const conTexto = (texto: string) => detectarTipo({ texto, archivos: [] })
const conArchivos = (...nombres: string[]) => detectarTipo({ texto: "", archivos: archivos(...nombres) })

describe("detectarTipo: links and text", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "Video de YouTube"],
    ["https://youtu.be/abc123", "Video de YouTube"],
    ["https://m.youtube.com/watch?v=abc123", "Video de YouTube"],
    ["https://www.youtube-nocookie.com/embed/abc123", "Video de YouTube"],
    ["https://open.spotify.com/episode/abc", "Podcast"],
    ["https://podcasts.apple.com/cl/podcast/x/id1?i=2", "Podcast"],
    ["https://ejemplo.cl/nota", "Enlace"],
    ["http://ejemplo.cl/nota", "Enlace"],
  ])("takes %s as a link (%s)", (texto, etiqueta) => {
    expect(conTexto(texto)).toEqual({ tipo: "link", etiqueta })
  })

  it("trims the spaces around a pasted link", () => {
    expect(conTexto("   https://youtu.be/abc123 \n")).toEqual({ tipo: "link", etiqueta: "Video de YouTube" })
  })

  it.each([
    "Hoy quiero hablar de la carga mental.",
    "mira esto https://ejemplo.cl/nota",
    "https://ejemplo.cl/una nota con espacios",
    "ejemplo.cl/nota",
    "ftp://ejemplo.cl/archivo",
  ])("takes pasted text that is not a link as a post: %s", (texto) => {
    expect(conTexto(texto)).toEqual({ tipo: "post", etiqueta: "Texto" })
  })

  it("detects nothing when the field is empty or only spaces", () => {
    expect(conTexto("")).toBeNull()
    expect(conTexto("  \n ")).toBeNull()
  })
})

describe("detectarTipo: files", () => {
  it.each([
    ["tesis.pdf", "documento", "Documento"],
    ["notas.DOCX", "documento", "Documento"],
    ["notas.txt", "documento", "Documento"],
    ["charla.MP3", "audio", "Audio"],
    ["charla.m4a", "audio", "Audio"],
    ["charla.wav", "audio", "Audio"],
    ["clase.mp4", "video", "Video"],
    ["clase.MOV", "video", "Video"],
    ["foto.jpg", "imagen", "Imagen"],
    ["foto.JPEG", "imagen", "Imagen"],
    ["foto.png", "imagen", "Imagen"],
    ["foto.webp", "imagen", "Imagen"],
    ["foto.heic", "imagen", "Imagen"],
  ])("takes %s as %s", (nombre, tipo, etiqueta) => {
    expect(conArchivos(nombre)).toEqual({ tipo, etiqueta })
  })

  it("counts several images", () => {
    expect(conArchivos("a.jpg", "b.PNG", "c.heic")).toEqual({ tipo: "imagen", etiqueta: "3 imágenes" })
  })

  it("lets the files decide when there are files, whatever the text says", () => {
    expect(detectarTipo({ texto: "https://youtu.be/abc", archivos: archivos("tesis.pdf") })).toEqual({
      tipo: "documento",
      etiqueta: "Documento",
    })
  })

  it.each([["planilla.xlsx"], ["animacion.gif"], ["sin-extension"]])("detects nothing for %s", (nombre) => {
    expect(conArchivos(nombre)).toBeNull()
  })

  it("detects nothing for two files that are not all images", () => {
    expect(conArchivos("a.pdf", "b.pdf")).toBeNull()
    expect(conArchivos("a.jpg", "b.pdf")).toBeNull()
  })
})

describe("tipoEfectivo", () => {
  it("is what was detected while she has not chosen", () => {
    expect(tipoEfectivo({ tipo: "link", etiqueta: "Video de YouTube" }, null)).toEqual({
      tipo: "link",
      etiqueta: "Video de YouTube",
    })
    expect(tipoEfectivo(null, null)).toBeNull()
  })

  it("is her choice when she chose one, in the words of the six types", () => {
    expect(tipoEfectivo({ tipo: "post", etiqueta: "Texto" }, "documento")).toEqual({
      tipo: "documento",
      etiqueta: "Documento",
    })
    expect(tipoEfectivo(null, "link")).toEqual({ tipo: "link", etiqueta: "Enlace" })
  })
})

describe("the field's words", () => {
  it("say which files it takes, and what is missing", () => {
    expect(AYUDA_DEL_CAMPO).toBe(
      "Sirve un PDF, Word o texto; un audio mp3, m4a o wav; un video mp4 o mov; o hasta 20 imágenes.",
    )
    expect(NO_RECONOZCO).toBe(`No reconozco ese archivo. ${AYUDA_DEL_CAMPO}`)
    expect(FALTA_LA_ENTRADA).toBe("Pega un enlace o elige un archivo.")
  })

  it("take the image limit from the one rule, never a number written twice", () => {
    expect(AYUDA_DEL_CAMPO).toContain(`hasta ${MAXIMO_DE_IMAGENES} imágenes`)
    const fuente = readFileSync(join(__dirname, "../../lib/dominio/biblioteca/subir.ts"), "utf-8")
    expect(fuente).not.toMatch(/hasta \d+ imágenes/)
  })
})
