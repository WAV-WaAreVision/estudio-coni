import { describe, expect, it } from "vitest"
import { ESQUEMA_DE_ANOTACION } from "@/lib/acciones/metricas-linkedin"

const POST = "11111111-1111-4111-8111-111111111111"
const numeros = { piezaId: POST, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }

describe("ESQUEMA_DE_ANOTACION", () => {
  it("accepts one row per post", () => {
    expect(ESQUEMA_DE_ANOTACION.safeParse({ posts: [numeros], seguidores: 830 }).success).toBe(true)
  })

  it("rejects the same post twice in one save", () => {
    expect(ESQUEMA_DE_ANOTACION.safeParse({ posts: [numeros, numeros], seguidores: null }).success).toBe(false)
  })
})
