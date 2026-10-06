import { describe, expect, it } from "vitest"
import { enlaceDeLinkedIn } from "@/lib/dominio/enlace-linkedin"

describe("enlaceDeLinkedIn", () => {
  it("accepts the address of a post as LinkedIn copies it and drops the tracking part", () => {
    expect(
      enlaceDeLinkedIn(
        "https://www.linkedin.com/posts/coni-del-rosario_sexualidad-activity-7123456789-AbCd?utm_source=share",
      ),
    ).toBe("https://www.linkedin.com/posts/coni-del-rosario_sexualidad-activity-7123456789-AbCd")
    expect(enlaceDeLinkedIn("  https://linkedin.com/feed/update/urn:li:activity:7123456789/  ")).toBe(
      "https://linkedin.com/feed/update/urn:li:activity:7123456789/",
    )
  })

  it("treats an empty field as no link", () => {
    expect(enlaceDeLinkedIn("")).toBeNull()
    expect(enlaceDeLinkedIn("   ")).toBeNull()
  })

  it.each([
    "http://www.linkedin.com/posts/abc",
    "https://linkedin.com.malo.example/posts/abc",
    "https://malo.example/linkedin.com/posts/abc",
    "https://user:clave@www.linkedin.com/posts/abc",
    "https://www.linkedin.com:8443/posts/abc",
    "https://evillinkedin.com/posts/abc",
    "https://www.linkedin.com/in/coni-del-rosario",
    "https://www.linkedin.com/",
    "https://evil.example/x",
    "javascript:alert(1)",
    "linkedin.com/posts/abc",
    "no es un enlace",
  ])("refuses %s with a message for Coni", (texto) => {
    expect(() => enlaceDeLinkedIn(texto)).toThrow("Ese enlace no parece de LinkedIn. Puedes dejarlo vacío.")
  })
})
