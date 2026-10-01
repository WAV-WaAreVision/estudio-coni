// @vitest-environment node
import { describe, expect, it } from "vitest"
import manifest from "@/app/manifest"
import { COLOR_DE_FONDO, NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"

describe("manifest", () => {
  it("makes the app installable as a standalone screen of its own", () => {
    const datos = manifest()
    expect(datos.display).toBe("standalone")
    expect(datos.start_url).toBe("/")
    expect(datos.scope).toBe("/")
    expect(datos.name).toBe(NOMBRE_DE_LA_APP)
    expect(datos.short_name).toBe("Estudio")
  })

  it("takes its colours from the brand constants, not from literals of its own", () => {
    const datos = manifest()
    expect(datos.theme_color).toBe(COLOR_DE_FONDO)
    expect(datos.background_color).toBe(COLOR_DE_FONDO)
  })

  it("points its icons at the routes that draw them", () => {
    const iconos = manifest().icons ?? []
    expect(iconos.map((icono) => icono.src).sort()).toEqual(["/apple-icon", "/icon"])
    for (const icono of iconos) expect(icono.type).toBe("image/png")
  })
})
