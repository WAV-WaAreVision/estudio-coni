// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { agregarAvatar, claveDeImagen, extensionDeImagen, sqlParaAgregar, sqlParaQuitar } from "@/lib/avatares/agregar"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1])
const CLAVE = "hg_secreta_de_prueba"

function heygenResponde(imagen: Uint8Array, extra: Record<string, unknown> = {}) {
  const peticiones: string[] = []
  servidor.use(
    http.get("https://api.heygen.com/v3/avatars/looks/:id", ({ request, params }) => {
      peticiones.push(request.url)
      return HttpResponse.json({
        data: {
          id: String(params.id),
          name: "Estudio",
          avatar_type: "digital_twin",
          preview_image_url: "https://files.heygen.test/preview?firma=1",
          status: "completed",
          ...extra,
        },
      })
    }),
    http.get("https://files.heygen.test/preview", () => new HttpResponse(imagen)),
  )
  return peticiones
}

describe("extensionDeImagen", () => {
  it("tells jpg, png and webp apart by their first bytes", () => {
    expect(extensionDeImagen(JPG)).toBe("jpg")
    expect(extensionDeImagen(PNG)).toBe("png")
    expect(extensionDeImagen(WEBP)).toBe("webp")
  })

  it("refuses anything else instead of storing it under a guessed name", () => {
    expect(() => extensionDeImagen(new Uint8Array([60, 104, 116, 109, 108]))).toThrow(/imagen/)
  })
})

describe("agregarAvatar", () => {
  it("reads the look from v3, stores the preview under avatares/<look>.<ext> and returns the config entry", async () => {
    const peticiones = heygenResponde(PNG)
    const almacen = almacenEnMemoria()

    const resultado = await agregarAvatar({ lookId: "look_9", nombre: "Estudio", clave: CLAVE, almacen })

    expect(peticiones).toEqual(["https://api.heygen.com/v3/avatars/looks/look_9"])
    expect(resultado.entrada).toEqual({ avatar_id: "look_9", nombre: "Estudio", imagen: "avatares/look_9.png" })
    expect(almacen.claves()).toEqual(["avatares/look_9.png"])
    expect(almacen.obtener("avatares/look_9.png")).toEqual({ datos: PNG, tipo: "image/png" })
  })

  it("takes the name from HeyGen when none is given, and warns about looks that may redraw her face", async () => {
    heygenResponde(JPG, { avatar_type: "studio_avatar" })

    const resultado = await agregarAvatar({ lookId: "look_9", nombre: "", clave: CLAVE, almacen: almacenEnMemoria() })

    expect(resultado.entrada.nombre).toBe("Estudio")
    expect(resultado.advertencia).toMatch(/foto real de Coni o un gemelo digital/)
  })

  it("does not warn for a digital twin", async () => {
    heygenResponde(JPG)

    const resultado = await agregarAvatar({ lookId: "look_9", nombre: "X", clave: CLAVE, almacen: almacenEnMemoria() })

    expect(resultado.advertencia).toBeNull()
  })

  it("stores nothing when the look cannot be read", async () => {
    servidor.use(
      http.get("https://api.heygen.com/v3/avatars/looks/:id", () =>
        HttpResponse.json({ error: { code: "not_found", message: "no" } }, { status: 404 }),
      ),
    )
    const almacen = almacenEnMemoria()

    await expect(agregarAvatar({ lookId: "look_9", nombre: "X", clave: CLAVE, almacen })).rejects.toThrow()
    expect(almacen.claves()).toEqual([])
  })

  it("never calls a v1 or v2 endpoint", async () => {
    const vistas: string[] = []
    servidor.events.on("request:start", ({ request }) => vistas.push(new URL(request.url).pathname))
    heygenResponde(JPG)

    await agregarAvatar({ lookId: "look_9", nombre: "X", clave: CLAVE, almacen: almacenEnMemoria() })

    servidor.events.removeAllListeners()
    expect(vistas.filter((ruta) => /\/v[12]\//.test(ruta))).toEqual([])
  })
})

describe("claveDeImagen", () => {
  it("builds the key the production config accepts", () => {
    expect(claveDeImagen("look_9", "jpg")).toBe("avatares/look_9.jpg")
  })
})

describe("sqlParaAgregar y sqlParaQuitar", () => {
  const entrada = { avatar_id: "look_9", nombre: "Coni d'Estudio", imagen: "avatares/look_9.png" }

  it("escapes quotes, so a name cannot break out of the statement", () => {
    const sql = sqlParaAgregar(entrada)
    expect(sql).toContain("Coni d''Estudio")
    expect(sql).toMatch(/^update public\.ajustes set produccion = /)
    expect(sql.trim().endsWith(";")).toBe(true)
  })

  it("replaces an entry with the same avatar_id instead of repeating it", () => {
    expect(sqlParaAgregar(entrada)).toContain("<> 'look_9'")
  })

  it("removes by avatar_id", () => {
    expect(sqlParaQuitar("look_9")).toContain("<> 'look_9'")
  })
})
