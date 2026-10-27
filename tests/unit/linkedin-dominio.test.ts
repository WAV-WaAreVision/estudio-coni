// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  aLittleText,
  avisoDeVencimientoLinkedin,
  enlaceDePost,
  esUrnDePost,
  linkedinConectadoEn,
  MAXIMO_DE_INTENTOS_LINKEDIN,
  siguientePasoLinkedin,
  tituloDelDocumento,
  versionDeLinkedinPorVencer,
} from "@/lib/dominio/linkedin"

/** The oracle: what LinkedIn shows for a little text (F8). Only for tests. */
function desdeLittleText(little: string): string {
  return little.replace(/\{hashtag\|\\#\|((?:\\.|[^}\\])*)\}/g, "#$1").replace(/\\(.)/g, "$1")
}

const APROBADO = `¿Te cuesta poner límites (incluso con tu familia)?

Hoy: 3 ideas *simples* para empezar_ya. Escríbeme @ tu colegio <3 ~ [nota] {llaves} | barra \\ final

Este video lo narra mi avatar digital, creado con IA a partir de mi imagen y mi voz. El contenido lo revisé y aprobé yo.

#SaludMental #límites #crianza_respetuosa`

describe("aLittleText", () => {
  it("handles every reserved character when the text has them: LinkedIn shows exactly the approved text", () => {
    expect(desdeLittleText(aLittleText(APROBADO))).toBe(APROBADO)
  })

  it("turns each hashtag into the hashtag template so it stays a hashtag", () => {
    const little = aLittleText("Hola\n\n#SaludMental #límites")
    expect(little).toBe("Hola\n\n{hashtag|\\#|SaludMental} {hashtag|\\#|límites}")
  })

  it("escapes a # that is not a hashtag", () => {
    expect(aLittleText("el #1 y # solo")).toBe("el {hashtag|\\#|1} y \\# solo")
  })

  it("leaves accents, ñ, emojis and line breaks untouched", () => {
    expect(aLittleText("Niñez 🌱\nañadir")).toBe("Niñez 🌱\nañadir")
  })
})

describe("enlaceDePost and esUrnDePost", () => {
  it("builds the feed permalink from a share or ugcPost URN", () => {
    expect(enlaceDePost("urn:li:share:7123")).toBe("https://www.linkedin.com/feed/update/urn:li:share:7123/")
    expect(enlaceDePost("urn:li:ugcPost:99")).toBe("https://www.linkedin.com/feed/update/urn:li:ugcPost:99/")
  })

  it("accepts only post URNs", () => {
    expect(esUrnDePost("urn:li:share:1")).toBe(true)
    expect(esUrnDePost("urn:li:ugcPost:1")).toBe(true)
    expect(esUrnDePost("urn:li:video:C1")).toBe(false)
    expect(esUrnDePost("")).toBe(false)
  })
})

describe("siguientePasoLinkedin", () => {
  const base = {
    estado: "esperando" as const,
    videoUrn: null,
    documentoUrn: null,
    enviadoEn: null,
    postUrn: null,
    intentos: 0,
  }

  it("does nothing for a row that is not waiting or already has its post", () => {
    expect(siguientePasoLinkedin({ ...base, estado: "para_subir" })).toEqual({ tipo: "nada" })
    expect(siguientePasoLinkedin({ ...base, postUrn: "urn:li:share:1" })).toEqual({ tipo: "nada" })
  })

  it("is in doubt when a send was reserved and no post came back", () => {
    expect(siguientePasoLinkedin({ ...base, videoUrn: "v", enviadoEn: "2031-01-01T00:00:00Z" })).toEqual({
      tipo: "dudosa",
    })
  })

  it("gives up to manual after the maximum of tries", () => {
    expect(siguientePasoLinkedin({ ...base, intentos: MAXIMO_DE_INTENTOS_LINKEDIN })).toEqual({ tipo: "a_mano" })
  })

  it("uploads the document first, then waits for it, for a carousel", () => {
    expect(siguientePasoLinkedin(base, "documento")).toEqual({ tipo: "subir_documento" })
    expect(siguientePasoLinkedin({ ...base, documentoUrn: "urn:li:document:D1" }, "documento")).toEqual({
      tipo: "esperar_documento",
    })
  })

  it("settles doubt and exhausted tries first for a carousel too", () => {
    const enviado = { ...base, documentoUrn: "urn:li:document:D1", enviadoEn: "2031-01-01T00:00:00Z" }
    expect(siguientePasoLinkedin(enviado, "documento")).toEqual({ tipo: "dudosa" })
    expect(siguientePasoLinkedin({ ...base, intentos: MAXIMO_DE_INTENTOS_LINKEDIN }, "documento")).toEqual({
      tipo: "a_mano",
    })
    expect(siguientePasoLinkedin({ ...base, postUrn: "urn:li:share:1" }, "documento")).toEqual({ tipo: "nada" })
  })

  it("uploads first, then waits for the video", () => {
    expect(siguientePasoLinkedin(base)).toEqual({ tipo: "subir_video" })
    expect(siguientePasoLinkedin({ ...base, videoUrn: "urn:li:video:C1" })).toEqual({ tipo: "esperar_video" })
  })
})

describe("avisoDeVencimientoLinkedin", () => {
  const AHORA = Date.parse("2031-01-01T12:00:00Z")
  const DIA = 86_400_000
  it("says nothing with more than 14 days left", () => {
    expect(avisoDeVencimientoLinkedin(AHORA + 15 * DIA, AHORA)).toBeNull()
  })
  it("warns at 14, at 3 and when expired, with the days left", () => {
    expect(avisoDeVencimientoLinkedin(AHORA + 14 * DIA, AHORA)).toEqual({ umbral: 14, dias: 14 })
    expect(avisoDeVencimientoLinkedin(AHORA + 2.5 * DIA, AHORA)).toEqual({ umbral: 3, dias: 3 })
    expect(avisoDeVencimientoLinkedin(AHORA - 1, AHORA)).toEqual({ umbral: 0, dias: 0 })
  })
})

describe("versionDeLinkedinPorVencer", () => {
  it("is due when the version is 10 months old or more", () => {
    expect(versionDeLinkedinPorVencer("202609", "2027-06-30T00:00:00Z")).toBe(false)
    expect(versionDeLinkedinPorVencer("202609", "2027-07-01T00:00:00Z")).toBe(true)
  })
  it("refuses a version that is not YYYYMM", () => {
    expect(() => versionDeLinkedinPorVencer("2026-09", "2027-01-01T00:00:00Z")).toThrow()
  })
})

describe("linkedinConectadoEn", () => {
  const AHORA = Date.parse("2031-01-01T12:00:00Z")
  it("is connected with a member and an expiry still in the future", () => {
    expect(
      linkedinConectadoEn(
        { linkedin_miembro: "urn:li:person:x", linkedin_token_expira_en: "2031-01-02T00:00:00Z" },
        AHORA,
      ),
    ).toBe(true)
  })
  it("is not connected without a member, without an expiry or once expired", () => {
    expect(linkedinConectadoEn({ linkedin_miembro: null, linkedin_token_expira_en: null }, AHORA)).toBe(false)
    expect(
      linkedinConectadoEn(
        { linkedin_miembro: "urn:li:person:x", linkedin_token_expira_en: "2030-12-31T00:00:00Z" },
        AHORA,
      ),
    ).toBe(false)
  })
})

describe("tituloDelDocumento", () => {
  it("cuts a single word longer than 100 characters at 100, since no word boundary exists", () => {
    expect(tituloDelDocumento("a".repeat(130))).toBe("a".repeat(100))
  })
})
