import { describe, expect, it } from "vitest"
import { enlaceDeInstagram } from "@/lib/dominio/enlace-instagram"

describe("enlaceDeInstagram", () => {
  it("accepts the address of a reel as Instagram copies it and drops the tracking part", () => {
    expect(enlaceDeInstagram("https://www.instagram.com/reel/DAbc123xyz/?igsh=MTIzNDU2")).toBe(
      "https://www.instagram.com/reel/DAbc123xyz/",
    )
    expect(enlaceDeInstagram("  https://instagram.com/p/DAbc123/  ")).toBe("https://instagram.com/p/DAbc123/")
  })

  it("treats an empty field as no link", () => {
    expect(enlaceDeInstagram("")).toBeNull()
    expect(enlaceDeInstagram("   ")).toBeNull()
  })

  it.each([
    "http://www.instagram.com/reel/abc/",
    "https://instagram.com.malo.example/reel/abc/",
    "https://malo.example/instagram.com/reel/abc/",
    "https://user:clave@www.instagram.com/reel/abc/",
    "https://www.instagram.com:8443/reel/abc/",
    "https://evilinstagram.com/reel/abc/",
    "javascript:alert(1)",
    "instagram.com/reel/abc",
    "no es un enlace",
  ])("refuses %s with a message for Coni", (texto) => {
    expect(() => enlaceDeInstagram(texto)).toThrow(/enlace/i)
  })
})
