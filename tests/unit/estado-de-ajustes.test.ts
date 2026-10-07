// @vitest-environment node
import { describe, expect, it } from "vitest"
import { type EstadoDeCuenta, estadoDeAjustes } from "@/lib/ajustes/estado"

const AHORA = Date.parse("2026-10-01T15:00:00Z")
const DIA = 24 * 60 * 60 * 1000

const lista = (cuenta: EstadoDeCuenta["cuenta"]): EstadoDeCuenta => ({ cuenta, estado: "lista" })
const TODAS_LISTAS: EstadoDeCuenta[] = [lista("instagram"), lista("heygen"), lista("elevenlabs"), lista("anthropic")]
const con = (...cambios: EstadoDeCuenta[]) =>
  TODAS_LISTAS.map((cuenta) => cambios.find((c) => c.cuenta === cuenta.cuenta) ?? cuenta)

describe("estadoDeAjustes", () => {
  it("says everything is connected, and when it was checked, when all four answered", () => {
    const estado = estadoDeAjustes({
      cuentas: TODAS_LISTAS,
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado).toMatchObject({
      tipo: "todo_bien",
      titulo: "Todo conectado",
      texto: "Instagram, HeyGen, ElevenLabs y Claude respondieron hoy a las 12:00.",
    })
    expect(estado.accion).toBeUndefined()
  })

  it("is setting up while any account is missing, counting the steps done and offering the next one", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "falta" }, { cuenta: "elevenlabs", estado: "falta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.tipo).toBe("configurando")
    expect(estado.titulo).toBe("Configuración: 3 de 5 listos")
    expect(estado.pasos).toEqual([
      { etiqueta: "Instagram conectado", listo: false },
      { etiqueta: "HeyGen con tu avatar", listo: true },
      { etiqueta: "ElevenLabs con tu voz", listo: false },
      { etiqueta: "Claude (Anthropic)", listo: true },
      { etiqueta: "Avisos en tu celular", listo: true },
    ])
    expect(estado.accion).toEqual({ etiqueta: "Conectar Instagram", href: "/api/meta/conectar" })
  })

  it("says plainly that Instagram is not connected and that reels wait for a manual upload meanwhile", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "falta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.tipo).toBe("configurando")
    expect(estado.texto).toBe("Instagram no está conectado. Mientras tanto, cada reel espera a que lo subas tú a mano.")
    expect(estado.accion).toEqual({ etiqueta: "Conectar Instagram", href: "/api/meta/conectar" })
  })

  it("keeps the manual upload line and mentions the rest when more than Instagram is missing", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "falta" }, { cuenta: "heygen", estado: "falta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.texto).toBe(
      "Instagram no está conectado. Mientras tanto, cada reel espera a que lo subas tú a mano. También falta lo que sigue.",
    )
  })

  it("does not talk about manual upload when Instagram is connected and something else is missing", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "heygen", estado: "falta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.texto).toBe("Falta lo que sigue; el resto ya está.")
  })

  it("offers the key field of the first missing account when it is not Instagram", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "heygen", estado: "falta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.accion).toEqual({ etiqueta: "Agregar la llave de HeyGen", href: "/ajustes/cuentas#cuenta-heygen" })
  })

  it("warns when Instagram expires within a week, with days, and offers to renew it", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "vence", expiraEn: AHORA + 6 * DIA }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado).toMatchObject({
      tipo: "atencion",
      titulo: "Instagram vence en 6 días",
      texto: "Renueva la conexión para que los reels sigan saliendo.",
      accion: { etiqueta: "Renovar Instagram", href: "/api/meta/conectar" },
    })
  })

  it("says tomorrow, and not '1 días'", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "vence", expiraEn: AHORA + 0.5 * DIA }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.titulo).toBe("Instagram vence mañana")
  })

  it("says it already expired when it did", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "instagram", estado: "vencida" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado).toMatchObject({ tipo: "atencion", titulo: "Instagram dejó de estar conectado" })
  })

  it("warns about a key that an account rejected, and points to its field", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "anthropic", estado: "rechazada", motivo: "HTTP 401" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado).toMatchObject({
      tipo: "atencion",
      titulo: "Claude no aceptó la llave",
      accion: { etiqueta: "Cambiar la llave de Claude", href: "/ajustes/cuentas#cuenta-anthropic" },
    })
  })

  it("puts setting up before warnings, and warnings before the check that could not run", () => {
    const faltaYVence = estadoDeAjustes({
      cuentas: con(
        { cuenta: "heygen", estado: "falta" },
        { cuenta: "instagram", estado: "vence", expiraEn: AHORA + DIA },
      ),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    const venceYSinRespuesta = estadoDeAjustes({
      cuentas: con(
        { cuenta: "heygen", estado: "sin_respuesta" },
        { cuenta: "instagram", estado: "vence", expiraEn: AHORA + DIA },
      ),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(faltaYVence.tipo).toBe("configurando")
    expect(venceYSinRespuesta.tipo).toBe("atencion")
  })

  it("admits it could not check, instead of saying everything is fine", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "heygen", estado: "sin_respuesta" }),
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado).toMatchObject({
      tipo: "sin_revision",
      titulo: "No pude revisar las cuentas ahora",
      texto: "Lo intento de nuevo cuando abras Ajustes.",
    })
  })

  it("lists the notices as one more step that is missing until she turns them on, without making that the next action", () => {
    const estado = estadoDeAjustes({
      cuentas: con({ cuenta: "heygen", estado: "falta" }),
      avisosActivos: false,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.titulo).toBe("Configuración: 3 de 5 listos")
    expect(estado.pasos.at(-1)).toEqual({ etiqueta: "Avisos en tu celular", listo: false })
    expect(estado.accion).toEqual({ etiqueta: "Agregar la llave de HeyGen", href: "/ajustes/cuentas#cuenta-heygen" })
  })

  it("does not call it setting up when only the notices are missing: the email reaches her anyway", () => {
    const estado = estadoDeAjustes({
      cuentas: TODAS_LISTAS,
      avisosActivos: false,
      ahora: AHORA,
      zona: "America/Santiago",
    })

    expect(estado.tipo).toBe("todo_bien")
  })
})

describe("estadoDeAjustes with LinkedIn", () => {
  it("handles a missing LinkedIn when everything else is ready: still todo_bien, not a step", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "falta" }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado.tipo).toBe("todo_bien")
    expect(estado.pasos.map((p) => p.etiqueta)).not.toContain("LinkedIn conectado")
  })

  it("asks to renew LinkedIn when it expires within 14 days", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "vence", expiraEn: AHORA + 10 * DIA }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado).toMatchObject({
      tipo: "atencion",
      titulo: "LinkedIn vence en 10 días",
      texto:
        "Renuévalo para que tus videos sigan saliendo solos en LinkedIn. Mientras tanto, te los dejo listos para subir a mano.",
      accion: { etiqueta: "Renovar LinkedIn", href: "/api/linkedin/conectar" },
    })
  })

  it("says LinkedIn stopped being connected when it expired", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "vencida" }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado).toMatchObject({ tipo: "atencion", titulo: "LinkedIn dejó de estar conectado" })
  })

  it("puts Instagram first when both need attention", () => {
    const estado = estadoDeAjustes({
      cuentas: [...con({ cuenta: "instagram", estado: "vencida" }), { cuenta: "linkedin", estado: "vencida" }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado.titulo).toBe("Instagram dejó de estar conectado")
  })
})

describe("estadoDeAjustes with LinkedIn expiring today", () => {
  it("titles the block 'vence hoy' with less than a day left", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "vence", expiraEn: AHORA + 5 * 3_600_000 }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado.titulo).toBe("LinkedIn vence hoy")
  })
})
