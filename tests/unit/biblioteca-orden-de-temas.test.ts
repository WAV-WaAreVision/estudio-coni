import { describe, expect, it, vi } from "vitest"
import {
  ordenarTemas,
  PASOS_MAXIMOS_DE_FUSION,
  seguirFusiones,
  type TemaResumido,
} from "@/lib/dominio/biblioteca/temas"

const tema = (id: string, nombre: string, autores: number, ideas: number): TemaResumido => ({
  id,
  nombre,
  descripcion: null,
  pilarId: null,
  ideas,
  autores,
  tratado: false,
})

describe("ordenarTemas", () => {
  it("puts the topics with most authors first, then most ideas, then by name", () => {
    const orden = ordenarTemas([
      tema("1", "Sueño", 1, 9),
      tema("2", "Carga mental", 3, 2),
      tema("3", "Ánimo", 3, 2),
      tema("4", "Pausas", 3, 5),
    ])
    expect(orden.map((t) => t.nombre)).toEqual(["Pausas", "Ánimo", "Carga mental", "Sueño"])
  })

  it("breaks a tie by name in Spanish order, where Ñ comes after N", () => {
    const orden = ordenarTemas([tema("1", "Ñuñoa", 2, 2), tema("2", "Nuria", 2, 2)])
    expect(orden.map((t) => t.nombre)).toEqual(["Nuria", "Ñuñoa"])
  })
})

describe("seguirFusiones", () => {
  const filas = new Map<string, { id: string; fusionadoEn: string | null }>([
    ["vivo", { id: "vivo", fusionadoEn: null }],
    ["a", { id: "a", fusionadoEn: "b" }],
    ["b", { id: "b", fusionadoEn: "vivo" }],
    ["bucle-1", { id: "bucle-1", fusionadoEn: "bucle-2" }],
    ["bucle-2", { id: "bucle-2", fusionadoEn: "bucle-1" }],
    ["roto", { id: "roto", fusionadoEn: "no-existe" }],
  ])
  const leer = vi.fn(async (id: string) => filas.get(id) ?? null)

  it("answers a live topic itself", async () => {
    expect(await seguirFusiones("vivo", leer)).toBe("vivo")
  })

  it("follows a merged topic to the one that stayed, step by step", async () => {
    expect(await seguirFusiones("a", leer)).toBe("vivo")
  })

  it("answers null for a missing topic, a broken chain or a loop", async () => {
    expect(await seguirFusiones("no-existe", leer)).toBeNull()
    expect(await seguirFusiones("roto", leer)).toBeNull()
    leer.mockClear()
    expect(await seguirFusiones("bucle-1", leer)).toBeNull()
    expect(leer).toHaveBeenCalledTimes(PASOS_MAXIMOS_DE_FUSION + 1)
  })

  it("follows at most five merges", async () => {
    const cadena = new Map<string, { id: string; fusionadoEn: string | null }>()
    for (let paso = 0; paso < 7; paso++) cadena.set(`t${paso}`, { id: `t${paso}`, fusionadoEn: `t${paso + 1}` })
    cadena.set("t7", { id: "t7", fusionadoEn: null })
    const leerCadena = async (id: string) => cadena.get(id) ?? null
    expect(await seguirFusiones("t2", leerCadena)).toBe("t7")
    expect(await seguirFusiones("t1", leerCadena)).toBeNull()
  })
})
