import { ImageResponse } from "next/og"
import { COLOR_DE_ACENTO, COLOR_SOBRE_ACENTO } from "@/lib/diseno/marca"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function IconoDeApple() {
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
        fontSize: 106,
        fontWeight: 700,
      }}
    >
      C
    </div>,
    size,
  )
}
