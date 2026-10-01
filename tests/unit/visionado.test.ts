import { describe, expect, it } from "vitest"
import { avanzar, iniciarVisionado, terminado, type Visionado } from "@/lib/medios/visionado"

/** Plays from `desde` to `hasta` the way a player reports it: a time update every 250 ms. */
function reproducir(visionado: Visionado, desde: number, hasta: number): Visionado {
  let actual = visionado
  for (let t = desde; t <= hasta + 1e-9; t += 0.25) actual = avanzar(actual, t)
  return actual
}

describe("visionado", () => {
  it("counts a video played from the start to the end as watched", () => {
    const visionado = reproducir(iniciarVisionado(), 0, 46)

    expect(terminado(visionado, 46)).toBe(true)
  })

  it("needs 95 percent: stopping at 90 percent is not watched", () => {
    const visionado = reproducir(iniciarVisionado(), 0, 41.4)

    expect(terminado(visionado, 46)).toBe(false)
  })

  it("accepts the last few seconds of a long pause between updates (a busy phone)", () => {
    let visionado = reproducir(iniciarVisionado(), 0, 40)
    visionado = avanzar(visionado, 41.2)
    visionado = reproducir(visionado, 41.45, 46)

    expect(terminado(visionado, 46)).toBe(true)
  })

  it("does not count jumping forward", () => {
    let visionado = reproducir(iniciarVisionado(), 0, 5)
    visionado = reproducir(avanzar(visionado, 40), 40, 46)

    expect(terminado(visionado, 46)).toBe(false)
  })

  it("does not count what is played after a forward jump as continuing the watched part", () => {
    let visionado = reproducir(iniciarVisionado(), 0, 20)
    visionado = avanzar(visionado, 30)
    visionado = reproducir(visionado, 30, 46)

    expect(terminado(visionado, 46)).toBe(false)
  })

  it("keeps what was watched when she goes back and watches a part again", () => {
    let visionado = reproducir(iniciarVisionado(), 0, 30)
    visionado = reproducir(avanzar(visionado, 10), 10, 30)
    visionado = reproducir(visionado, 30.25, 46)

    expect(terminado(visionado, 46)).toBe(true)
  })

  it("is not watched when the duration is unknown", () => {
    const visionado = reproducir(iniciarVisionado(), 0, 10)

    expect(terminado(visionado, 0)).toBe(false)
    expect(terminado(visionado, Number.NaN)).toBe(false)
    expect(terminado(visionado, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
