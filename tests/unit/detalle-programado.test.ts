// @vitest-environment node
import { describe, expect, it } from "vitest"
import { detalleDeProgramado, detalleDePublicado } from "@/app/(app)/video/[id]/detalle-programado"

describe("detalleDeProgramado", () => {
  it("says LinkedIn goes out by itself when it is connected, with or without Instagram", () => {
    expect(detalleDeProgramado(["linkedin"], { instagramConectado: false, linkedinConectado: true })).toBe(
      "LinkedIn sale solo a la hora aprobada.",
    )
    expect(detalleDeProgramado(["instagram", "linkedin"], { instagramConectado: true, linkedinConectado: true })).toBe(
      "Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique. LinkedIn sale solo a la hora aprobada.",
    )
  })

  it("tells her what she uploads herself when Instagram is not connected but LinkedIn is", () => {
    expect(detalleDeProgramado(["instagram", "linkedin"], { instagramConectado: false, linkedinConectado: true })).toBe(
      "Instagram todavía no está conectado, así que ese reel no sale solo: a esa hora te aviso y lo subes tú. LinkedIn sale solo a la hora aprobada.",
    )
  })

  it("keeps the phase 1 wording while LinkedIn is not connected", () => {
    expect(detalleDeProgramado(["linkedin"], { instagramConectado: true, linkedinConectado: false })).toBe(
      "LinkedIn se sube a mano: a esa hora te aviso y lo subes tú.",
    )
    expect(detalleDeProgramado(["instagram"], { instagramConectado: false, linkedinConectado: false })).toBe(
      "Instagram todavía no está conectado, así que este reel no sale solo. A esa hora te aviso y lo subes tú.",
    )
    expect(
      detalleDeProgramado(["instagram", "linkedin"], { instagramConectado: false, linkedinConectado: false }),
    ).toBe(
      "Instagram todavía no está conectado, así que este reel no sale solo. LinkedIn tampoco: a esa hora te aviso y los subes tú.",
    )
    expect(detalleDeProgramado(["instagram", "linkedin"], { instagramConectado: true, linkedinConectado: false })).toBe(
      "Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique. LinkedIn lo subes tú a mano.",
    )
  })
})

const ENLACE = "https://www.linkedin.com/feed/update/urn:li:share:7/"
const fila = (
  destino: "instagram" | "linkedin",
  estado: "publicado" | "subido_a_mano",
  enlace: string | null = null,
) => ({
  destino,
  estado,
  enlace,
  explicacion: null,
})

describe("detalleDePublicado", () => {
  it("keeps the Instagram wording when only Instagram went out", () => {
    expect(detalleDePublicado([fila("instagram", "publicado")])).toEqual({
      detalle: "La etiqueta de IA quedó puesta en Instagram.",
      enlaces: [],
    })
  })

  it("adds LinkedIn, with its link, when it went out by itself too", () => {
    expect(detalleDePublicado([fila("instagram", "publicado"), fila("linkedin", "publicado", ENLACE)])).toEqual({
      detalle: "La etiqueta de IA quedó puesta en Instagram. También salió en LinkedIn.",
      enlaces: [{ etiqueta: "Ver en LinkedIn", href: ENLACE }],
    })
  })

  it("does not mention Instagram when only LinkedIn went out", () => {
    expect(detalleDePublicado([fila("linkedin", "publicado", ENLACE)])).toEqual({
      detalle: "Salió en LinkedIn.",
      enlaces: [{ etiqueta: "Ver en LinkedIn", href: ENLACE }],
    })
  })

  it("says what she uploaded herself next to what went out by itself", () => {
    expect(detalleDePublicado([fila("instagram", "subido_a_mano"), fila("linkedin", "publicado", ENLACE)])).toEqual({
      detalle: "Lo subiste tú a Instagram. LinkedIn salió solo.",
      enlaces: [{ etiqueta: "Ver en LinkedIn", href: ENLACE }],
    })
  })
})

describe("detalleDePublicado without a LinkedIn row", () => {
  it("never says it went out on LinkedIn when there is no LinkedIn row", () => {
    expect(detalleDePublicado([]).detalle).not.toContain("LinkedIn")
    expect(detalleDePublicado([fila("instagram", "subido_a_mano")]).detalle).not.toContain("salió solo")
  })
})
