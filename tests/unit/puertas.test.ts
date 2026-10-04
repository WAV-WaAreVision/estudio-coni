import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { type Pieza, piezaNueva } from "@/lib/dominio/estados"
import {
  claveIdempotencia,
  formulaDePuerta1,
  hashPuerta1,
  hashPuerta2,
  hashTexto,
  puedeEntregarseParaSubir,
  puedeGrabar,
  puedePublicar,
} from "@/lib/dominio/puertas"

describe("hashes de las puertas", () => {
  const base = { formula: 1 as const, guion: "Soy Coni del Rosario.", audioId: "audio_1" }

  it("da el mismo hash cuando el guion y el audio no cambian", () => {
    expect(hashPuerta1(base)).toBe(hashPuerta1({ ...base }))
    expect(hashPuerta1(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cambia el hash de la puerta 1 cuando cambia el guion o el audio", () => {
    expect(hashPuerta1({ ...base, guion: "Soy Coni." })).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, audioId: "audio_2" })).not.toBe(hashPuerta1(base))
  })

  it("keeps the hash of pieces approved before avatars could be chosen", () => {
    const legado = createHash("sha256")
      .update(JSON.stringify(["puerta1", base.guion, base.audioId]))
      .digest("hex")
    expect(hashPuerta1(base)).toBe(legado)
    expect(hashPuerta1({ ...base, avatarId: null })).toBe(legado)
  })

  it("binds the chosen avatar: another avatar is another approval", () => {
    const conAvatar = hashPuerta1({ ...base, avatarId: "look_a" })
    expect(conAvatar).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, avatarId: "look_b" })).not.toBe(conAvatar)
    expect(hashPuerta1({ ...base, avatarId: "look_a" })).toBe(conAvatar)
  })

  it("no confunde campos cuando un separador aparece dentro del texto", () => {
    expect(hashPuerta1({ formula: 1, guion: "a|b", audioId: "c" })).not.toBe(
      hashPuerta1({ formula: 1, guion: "a", audioId: "b|c" }),
    )
  })

  it("separa el hash del texto de publicación del hash del guion", () => {
    expect(hashTexto("Soy Coni del Rosario.")).not.toBe(hashPuerta1(base))
    expect(hashTexto("Hola")).not.toBe(hashTexto("Hola."))
  })
})

describe("hashPuerta1 formula 2", () => {
  const base = { formula: 2 as const, guion: "Soy Coni.", texto: "Un texto.", avatarId: "look_a" }
  const sha = (partes: string[]) => createHash("sha256").update(JSON.stringify(partes)).digest("hex")

  it("changes when the script, the text or the avatar changes", () => {
    const h = hashPuerta1(base)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPuerta1({ ...base })).toBe(h)
    expect(hashPuerta1({ ...base, guion: "Soy otra." })).not.toBe(h)
    expect(hashPuerta1({ ...base, texto: "Otro texto." })).not.toBe(h)
    expect(hashPuerta1({ ...base, avatarId: "look_b" })).not.toBe(h)
  })

  it("hashes no audio and is its own namespace", () => {
    expect(hashPuerta1(base)).toBe(sha(["puerta1/2", base.guion, base.texto, base.avatarId]))
  })

  it("formula 1 reproduces the legacy hash with and without avatar", () => {
    expect(hashPuerta1({ formula: 1, guion: "g", audioId: "a", avatarId: "v" })).toBe(sha(["puerta1", "g", "a", "v"]))
    expect(hashPuerta1({ formula: 1, guion: "g", audioId: "a" })).toBe(sha(["puerta1", "g", "a"]))
  })
})

describe("hashPuerta2", () => {
  const base = {
    videoId: "videos/p/abc.mp4",
    hashTexto: hashTexto("Un texto."),
    publicarEn: "2026-10-08T22:00:00.000Z",
  }

  it("da el mismo hash para el mismo video, texto y hora", () => {
    expect(hashPuerta2(base)).toBe(hashPuerta2({ ...base }))
    expect(hashPuerta2(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cambia cuando cambia el video, el texto o la hora aprobada, para que cada publicación tenga su clave", () => {
    expect(hashPuerta2({ ...base, videoId: "videos/p/otro.mp4" })).not.toBe(hashPuerta2(base))
    expect(hashPuerta2({ ...base, hashTexto: hashTexto("Otro texto.") })).not.toBe(hashPuerta2(base))
    expect(hashPuerta2({ ...base, publicarEn: "2026-10-09T22:00:00.000Z" })).not.toBe(hashPuerta2(base))
  })

  it("no se confunde con el hash de la puerta 1 ni con el del texto", () => {
    expect(hashPuerta2(base)).not.toBe(hashPuerta1({ formula: 1, guion: base.videoId, audioId: base.hashTexto }))
    expect(hashPuerta2(base)).not.toBe(base.hashTexto)
  })
})

describe("claveIdempotencia", () => {
  const clave = { piezaId: "pieza_1", paso: "grabar" as const, hash: "a".repeat(64), intento: 0 }

  it("repite la clave cuando es el mismo intento, para que un reintento ciego no cobre dos veces", () => {
    expect(claveIdempotencia(clave)).toBe("pieza_1:grabar:aaaaaaaaaaaaaaaa:0")
    expect(claveIdempotencia({ ...clave })).toBe(claveIdempotencia(clave))
  })

  it("cambia la clave cuando sube el intento o cambia el artefacto", () => {
    expect(claveIdempotencia({ ...clave, intento: 1 })).not.toBe(claveIdempotencia(clave))
    expect(claveIdempotencia({ ...clave, hash: "b".repeat(64) })).not.toBe(claveIdempotencia(clave))
  })

  it("falla cuando el intento no es un entero no negativo", () => {
    expect(() => claveIdempotencia({ ...clave, intento: Number.NaN })).toThrow("Intento inválido")
    expect(() => claveIdempotencia({ ...clave, intento: -1 })).toThrow("Intento inválido")
    expect(() => claveIdempotencia({ ...clave, intento: 1.5 })).toThrow("Intento inválido")
  })

  it("falla cuando el hash no es un sha-256", () => {
    expect(() => claveIdempotencia({ ...clave, hash: "abc" })).toThrow("SHA-256")
    expect(() => claveIdempotencia({ ...clave, hash: "A".repeat(64) })).toThrow("SHA-256")
  })
})

const HORA = "2026-10-08T22:00:00.000Z"
const APROBADA = "2026-10-06T15:00:00.000Z"

function pieza(cambios: Partial<Pieza>): Pieza {
  return { ...piezaNueva(), ...cambios }
}

describe("puedeGrabar", () => {
  const enRender = pieza({ estado: "en_render", audioId: "audio_1", puerta1: { hash: "h1", en: APROBADA } })

  it("deja grabar cuando lo actual es lo que coni aprobó", () => {
    expect(puedeGrabar(enRender, "h1")).toEqual({ ok: true })
  })

  it("no deja grabar cuando no hay aprobación", () => {
    expect(puedeGrabar({ ...enRender, puerta1: null }, "h1")).toEqual({ ok: false, motivo: "sin_aprobacion" })
  })

  it("no deja grabar cuando el guion o la voz cambiaron después de aprobar", () => {
    expect(puedeGrabar(enRender, "h2")).toEqual({ ok: false, motivo: "artefacto_cambio" })
  })

  it("no deja grabar cuando la pieza no está en render", () => {
    expect(puedeGrabar({ ...enRender, estado: "guion_por_aprobar" }, "h1")).toEqual({ ok: false, motivo: "estado" })
  })
})

describe("puedePublicar", () => {
  const programada = pieza({
    estado: "programado",
    videoId: "video_1",
    puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: APROBADA },
  })
  const actual = (ahora: string, hashTexto = "t1") => ({ ahora, hashTexto })

  it("deja publicar desde la hora aprobada hasta 30 minutos después", () => {
    expect(puedePublicar(programada, actual(HORA))).toEqual({ ok: true })
    expect(puedePublicar(programada, actual("2026-10-08T22:30:00.000Z"))).toEqual({ ok: true })
  })

  it("no publica antes de la hora aprobada", () => {
    expect(puedePublicar(programada, actual("2026-10-08T21:59:00.000Z"))).toEqual({
      ok: false,
      motivo: "antes_de_hora",
    })
  })

  it("no publica cuando la hora aprobada venció hace más de 30 minutos", () => {
    expect(puedePublicar(programada, actual("2026-10-08T22:30:01.000Z"))).toEqual({
      ok: false,
      motivo: "hora_vencida",
    })
  })

  it("no publica cuando el texto o el video cambiaron después de aprobar", () => {
    expect(puedePublicar(programada, actual(HORA, "t2"))).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedePublicar({ ...programada, videoId: "video_2" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("no publica cuando la pieza no está programada o no tiene puerta 2", () => {
    expect(puedePublicar({ ...programada, estado: "video_por_aprobar" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(puedePublicar({ ...programada, puerta2: null }, actual(HORA))).toEqual({
      ok: false,
      motivo: "sin_aprobacion",
    })
  })

  it("no publica cuando la hora no se puede leer", () => {
    expect(puedePublicar(programada, actual("no es una fecha"))).toEqual({ ok: false, motivo: "hora_vencida" })
    const ilegible = { ...programada, puerta2: programada.puerta2 && { ...programada.puerta2, publicarEn: "pronto" } }
    expect(puedePublicar(ilegible, actual(HORA))).toEqual({ ok: false, motivo: "hora_vencida" })
  })

  it("no publica cuando la hora actual no trae zona horaria", () => {
    expect(puedePublicar(programada, actual("2026-10-08T22:00:00"))).toEqual({ ok: false, motivo: "hora_vencida" })
    expect(puedePublicar(programada, actual("1"))).toEqual({ ok: false, motivo: "hora_vencida" })
  })

  it("lee la hora actual con un desfase explícito", () => {
    expect(puedePublicar(programada, actual("2026-10-08T19:00:00-03:00"))).toEqual({ ok: true })
  })
})

describe("puedeEntregarseParaSubir", () => {
  const programada = pieza({
    estado: "programado",
    videoId: "video_1",
    puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: APROBADA },
  })
  const actual = (ahora: string, hashTexto = "t1") => ({ ahora, hashTexto })

  it("entrega desde la hora aprobada, tarde o temprano, porque no se publica nada", () => {
    expect(puedeEntregarseParaSubir(programada, actual(HORA))).toEqual({ ok: true })
    expect(puedeEntregarseParaSubir(programada, actual("2026-10-08T22:30:01.000Z"))).toEqual({ ok: true })
    expect(puedeEntregarseParaSubir(programada, actual("2026-10-12T10:00:00.000Z"))).toEqual({ ok: true })
  })

  it("nunca entrega antes de la hora aprobada, ni cuando la hora no se puede leer", () => {
    const antes = { ok: false, motivo: "antes_de_hora" }
    expect(puedeEntregarseParaSubir(programada, actual("2026-10-08T21:59:59.000Z"))).toEqual(antes)
    expect(puedeEntregarseParaSubir(programada, actual("no es una fecha"))).toEqual(antes)
    expect(puedeEntregarseParaSubir(programada, actual("2026-10-08T22:00:00"))).toEqual(antes)
  })

  it("pide lo mismo que publicar sobre lo aprobado: estado, aprobación, texto y video", () => {
    expect(puedeEntregarseParaSubir({ ...programada, estado: "error_publicacion" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(puedeEntregarseParaSubir({ ...programada, puerta2: null }, actual(HORA))).toEqual({
      ok: false,
      motivo: "sin_aprobacion",
    })
    expect(puedeEntregarseParaSubir(programada, actual(HORA, "t2"))).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })
})

describe("formulaDePuerta1", () => {
  it("reads a null stored formula as the legacy formula 1", () => {
    expect(formulaDePuerta1(null)).toBe(1)
    expect(formulaDePuerta1(1)).toBe(1)
    expect(formulaDePuerta1(2)).toBe(2)
  })
})

describe("hashPuerta1 formula 3", () => {
  const base = { formula: 3 as const, guion: "g", texto: "t", avatarId: "look-1", respaldo: "" }

  it("is its own namespace: never the formula 2 hash of the same script, text and avatar", () => {
    expect(hashPuerta1(base)).not.toBe(hashPuerta1({ formula: 2, guion: "g", texto: "t", avatarId: "look-1" }))
  })

  it("changes when the backing changes, and with the script, text or avatar", () => {
    expect(hashPuerta1({ ...base, respaldo: '["t1"]' })).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, guion: "otro" })).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, avatarId: "look-2" })).not.toBe(hashPuerta1(base))
  })

  it("keeps formula 2 byte for byte", () => {
    const esperado = createHash("sha256")
      .update(JSON.stringify(["puerta1/2", "g", "t", "look-1"]))
      .digest("hex")
    expect(hashPuerta1({ formula: 2, guion: "g", texto: "t", avatarId: "look-1" })).toBe(esperado)
  })

  it("reads a stored 3 as formula 3", () => {
    expect(formulaDePuerta1(3)).toBe(3)
  })
})
