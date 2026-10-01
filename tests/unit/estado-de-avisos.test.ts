// @vitest-environment node
import { describe, expect, it } from "vitest"
import { type EntornoDeAvisos, estadoDeAvisos } from "@/lib/avisos/dispositivo"

const IPHONE_INSTALADO: EntornoDeAvisos = {
  configurado: true,
  ios: true,
  instalada: true,
  soportado: true,
  permiso: "default",
  suscrito: false,
}

const con = (cambios: Partial<EntornoDeAvisos>): EntornoDeAvisos => ({ ...IPHONE_INSTALADO, ...cambios })

describe("estadoDeAvisos", () => {
  it("offers to turn notices on in an installed app that has not asked yet", () => {
    expect(estadoDeAvisos(IPHONE_INSTALADO)).toBe("listo")
  })

  it("asks an iPhone that opened the app in Safari to install it first, even though Safari hides push there", () => {
    expect(estadoDeAvisos(con({ instalada: false, soportado: false, permiso: null }))).toBe("instalar")
  })

  it("lets a computer turn notices on straight from the browser", () => {
    expect(estadoDeAvisos(con({ ios: false, instalada: false }))).toBe("listo")
  })

  it("says the device cannot receive notices when the browser has no push (an iPhone older than iOS 16.4)", () => {
    expect(estadoDeAvisos(con({ soportado: false, permiso: null }))).toBe("no_disponible")
  })

  it("says they are not available yet while the server has no push keys", () => {
    expect(estadoDeAvisos(con({ configurado: false }))).toBe("no_disponible")
    expect(estadoDeAvisos(con({ configurado: false, instalada: false }))).toBe("no_disponible")
  })

  it("explains how to turn them on again after she blocked them", () => {
    expect(estadoDeAvisos(con({ permiso: "denied" }))).toBe("denegado")
  })

  it("is on when the permission is granted and this device has a subscription", () => {
    expect(estadoDeAvisos(con({ permiso: "granted", suscrito: true }))).toBe("activo")
  })

  it("offers to turn them on again when the permission is granted but the subscription is gone", () => {
    expect(estadoDeAvisos(con({ permiso: "granted", suscrito: false }))).toBe("listo")
  })
})
