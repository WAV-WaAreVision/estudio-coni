import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("keeps a custom text size next to a text colour", () => {
    expect(cn("text-meta", "text-apagado")).toBe("text-meta text-apagado")
    expect(cn("text-meta font-medium text-tinta")).toBe("text-meta font-medium text-tinta")
  })

  it("lets a later custom size replace an earlier one", () => {
    expect(cn("text-meta", "text-cuerpo")).toBe("text-cuerpo")
    expect(cn("text-boton", "text-insignia")).toBe("text-insignia")
  })

  it("merges the relief shadows and the radii as one group each", () => {
    expect(cn("shadow-relieve", "active:shadow-hundido", "shadow-relieve-alto")).toBe(
      "active:shadow-hundido shadow-relieve-alto",
    )
    expect(cn("rounded-control", "rounded-panel")).toBe("rounded-panel")
  })

  it("treats the rem sizing names as spacing", () => {
    expect(cn("min-h-boton", "min-h-objetivo")).toBe("min-h-objetivo")
    expect(cn("size-casilla", "size-foto")).toBe("size-foto")
    expect(cn("px-[22px] min-h-boton w-full text-boton", "px-[18px] min-h-objetivo text-cuerpo", "px-0 w-auto")).toBe(
      "min-h-objetivo text-cuerpo px-0 w-auto",
    )
  })
})
