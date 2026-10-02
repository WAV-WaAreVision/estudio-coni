import type { MetadataRoute } from "next"
import { COLOR_DE_FONDO, NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_DE_LA_APP,
    short_name: NOMBRE_DE_LA_APP,
    description: "Aprueba los guiones y los videos de tu avatar.",
    lang: "es-CL",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: COLOR_DE_FONDO,
    theme_color: COLOR_DE_FONDO,
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  }
}
