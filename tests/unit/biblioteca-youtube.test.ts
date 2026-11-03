import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AVISO_DE_PODCAST, esPodcast, esYoutube, PASOS_DE_YOUTUBE } from "@/lib/dominio/biblioteca/youtube"

describe("esYoutube", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.youtube-nocookie.com/embed/abc123",
    "HTTPS://WWW.YOUTUBE.COM/watch?v=abc123",
    "  https://youtu.be/abc123  ",
  ])("recognizes %s", (url) => {
    expect(esYoutube(url)).toBe(true)
  })

  it.each([
    "https://notyoutube.com/nota",
    "https://youtube.com.evil.cl/nota",
    "https://ejemplo.cl/?u=https://youtu.be/abc",
    "https://example.com/nota",
    "youtube.com/watch?v=abc123",
    "no es un link",
    "",
  ])("does not treat %s as YouTube", (url) => {
    expect(esYoutube(url)).toBe(false)
  })

  it("explains how to copy the transcript", () => {
    expect(PASOS_DE_YOUTUBE).toContain("Mostrar transcripción")
  })
})

describe("esPodcast", () => {
  it.each([
    "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk",
    "https://podcasts.apple.com/cl/podcast/x/id123?i=456",
    "  HTTPS://OPEN.SPOTIFY.COM/episode/abc  ",
  ])("recognizes %s", (url) => {
    expect(esPodcast(url)).toBe(true)
  })

  it.each([
    "https://spotify.com/episode/abc",
    "https://open.spotify.com.evil.cl/episode/abc",
    "https://apple.com/podcasts",
    "https://www.youtube.com/watch?v=abc123",
    "no es un link",
  ])("does not treat %s as a podcast", (url) => {
    expect(esPodcast(url)).toBe(false)
  })

  it("says only the episode page is read for now", () => {
    expect(AVISO_DE_PODCAST).toBe("Por ahora leo solo la página del episodio; el audio llega más adelante.")
  })
})

it("writes Coni's copy without an em dash", () => {
  expect(readFileSync(join(__dirname, "../../lib/dominio/biblioteca/youtube.ts"), "utf-8")).not.toContain("\u2014")
})
