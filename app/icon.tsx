import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { COLOR_DE_FIRMA, COLOR_DE_LUZ, COLOR_DE_TINTA } from "@/lib/diseno/marca"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

// The app mark (brandkit section 2): a lowercase c in Geist and the signature dot. It does not follow the theme.
export default async function Icono() {
  const geist = await readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf"))
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: COLOR_DE_TINTA,
      }}
    >
      <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: 330, lineHeight: 1, color: COLOR_DE_LUZ }}>c</span>
      <span style={{ width: 72, height: 72, borderRadius: 999, background: COLOR_DE_FIRMA, marginTop: 110 }} />
    </div>,
    { ...size, fonts: [{ name: "Geist", data: geist, weight: 600, style: "normal" }] },
  )
}
