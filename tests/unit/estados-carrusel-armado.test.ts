import { describe, expect, it } from "vitest"
import {
  AprobacionNoAutorizada,
  ArtefactoCambio,
  type Estado,
  type Pieza,
  piezaNueva,
  piezaTrabajando,
  TransicionInvalida,
  transicionar,
} from "@/lib/dominio/estados"

const HASH = "a".repeat(64)
const CARRUSEL = "11111111-1111-4111-8111-111111111111"
const FIRMA = { hash: HASH, en: "2026-10-27T12:00:00.000Z" }

function carrusel(estado: Estado, cambios: Partial<Pieza> = {}): Pieza {
  return { ...piezaNueva("carrusel"), estado, version: 5, intento: 1, puerta1: FIRMA, ...cambios }
}

const aprobar = (
  extra: Partial<{
    carruselActual: string
    hashTextoActual: string
    actor: "coni" | "sistema"
    publicarEn: string
  }> = {},
) =>
  ({
    tipo: "aprobar_carrusel",
    actor: extra.actor ?? "coni",
    carruselVisto: CARRUSEL,
    carruselActual: extra.carruselActual ?? CARRUSEL,
    hashTextoVisto: HASH,
    hashTextoActual: extra.hashTextoActual ?? HASH,
    publicarEn: extra.publicarEn ?? "2026-10-29T22:00:00.000Z",
    en: "2026-10-27T13:00:00.000Z",
  }) as const

describe("a carousel after gate 1", () => {
  it("goes to gate 2 when its slides are saved", () => {
    expect(transicionar(carrusel("armando_carrusel"), { tipo: "carrusel_armado" }).pieza).toMatchObject({
      estado: "carrusel_por_aprobar",
      puerta1: FIRMA,
      version: 6,
    })
  })

  it("goes back to gate 1 without its signature when it does not fit", () => {
    const { pieza } = transicionar(carrusel("armando_carrusel"), { tipo: "volver_a_firmar", explicacion: "Larga." })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", puerta1: null, intento: 2, explicacion: "Larga." })
  })

  it("goes back to gate 2 with why when a design change does not fit, keeping her signature", () => {
    const antes = carrusel("armando_carrusel")
    const { pieza } = transicionar(antes, { tipo: "diseno_no_cabe", explicacion: "No cabe." })
    expect(pieza).toMatchObject({ estado: "carrusel_por_aprobar", puerta1: antes.puerta1, explicacion: "No cabe." })
    expect(() => transicionar(carrusel("guion_por_aprobar"), { tipo: "diseno_no_cabe", explicacion: "No." })).toThrow()
  })

  it("fails its render into error_produccion and Reintentar takes it back to armando_carrusel", () => {
    const fallida = transicionar(carrusel("armando_carrusel"), {
      tipo: "falla_produccion",
      explicacion: "No pude.",
    }).pieza
    expect(fallida).toMatchObject({ estado: "error_produccion", estadoAntesDelError: "armando_carrusel" })
    const otra = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-27T13:00:00.000Z" }).pieza
    expect(otra).toMatchObject({ estado: "armando_carrusel", estadoAntesDelError: null, intento: 2 })
  })

  it("is rendered again after a design change, keeping gate 1", () => {
    expect(transicionar(carrusel("carrusel_por_aprobar"), { tipo: "cambiar_diseno" }).pieza).toMatchObject({
      estado: "armando_carrusel",
      puerta1: FIRMA,
      intento: 2,
    })
  })

  it("goes back to be rewritten from gate 2, without its signature", () => {
    expect(transicionar(carrusel("carrusel_por_aprobar"), { tipo: "pedir_cambios" }).pieza).toMatchObject({
      estado: "guion_en_proceso",
      puerta1: null,
      intento: 2,
    })
  })

  it("is scheduled by Coni on the version she saw, for a future time", () => {
    const { pieza } = transicionar(carrusel("carrusel_por_aprobar"), aprobar())
    expect(pieza.estado).toBe("programado")
    expect(pieza.puerta2).toEqual({
      carruselId: CARRUSEL,
      hashTexto: HASH,
      publicarEn: "2026-10-29T22:00:00.000Z",
      en: "2026-10-27T13:00:00.000Z",
    })
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ carruselActual: "otro" }))).toThrow(
      ArtefactoCambio,
    )
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ hashTextoActual: "b".repeat(64) }))).toThrow(
      ArtefactoCambio,
    )
    expect(() => transicionar(carrusel("carrusel_por_aprobar"), aprobar({ actor: "sistema" }))).toThrow(
      AprobacionNoAutorizada,
    )
    expect(() =>
      transicionar(carrusel("carrusel_por_aprobar"), aprobar({ publicarEn: "2026-10-27T12:00:00.000Z" })),
    ).toThrow("La fecha de publicación ya pasó. Elige una hora futura.")
  })

  it("changes its date back to gate 2 and is handed over and marked uploaded like a reel", () => {
    const programado = transicionar(carrusel("carrusel_por_aprobar"), aprobar()).pieza
    expect(transicionar(programado, { tipo: "cambiar_fecha" }).pieza).toMatchObject({
      estado: "carrusel_por_aprobar",
      puerta2: null,
    })
    const entregado = transicionar(programado, { tipo: "entregar_para_subir" }).pieza
    expect(entregado.estado).toBe("para_subir_a_mano")
    const subido = transicionar(entregado, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "linkedin",
      quedanPendientes: false,
    })
    expect(subido.pieza.estado).toBe("publicado_a_mano")
  })

  it("never publishes by itself or expires in part 2, and a reel never takes a carousel event", () => {
    const programado = transicionar(carrusel("carrusel_por_aprobar"), aprobar()).pieza
    expect(() => transicionar(programado, { tipo: "publicado" })).toThrow(TransicionInvalida)
    expect(() => transicionar(programado, { tipo: "hora_vencida" })).toThrow(TransicionInvalida)
    const reel = { ...piezaNueva("reel"), estado: "video_por_aprobar" as const }
    expect(() => transicionar(reel, aprobar())).toThrow(TransicionInvalida)
    expect(() => transicionar(reel, { tipo: "cambiar_diseno" })).toThrow(TransicionInvalida)
  })

  it("is being worked on while it renders, unless a reason stopped it", () => {
    expect(piezaTrabajando({ estado: "armando_carrusel", explicacion: null })).toBe(true)
    expect(piezaTrabajando({ estado: "armando_carrusel", explicacion: "Tope." })).toBe(false)
  })
})
