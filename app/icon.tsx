import { ImageResponse } from "next/og"
import { COLOR_DE_ACENTO, COLOR_SOBRE_ACENTO } from "@/lib/diseno/marca"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

// Placeholder mark until Coni has a logo: her initial on the action colour.
export default function Icono() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR_DE_ACENTO,
        color: COLOR_SOBRE_ACENTO,
        fontSize: 300,
        fontWeight: 700,
      }}
    >
      C
    </div>,
    size,
  )
}
