"use client"

import { ReproductorVoz } from "@/components/reproductor-voz"

/** The voice alone, for server pages: nothing to do when she finishes listening. */
export function VozSuelta({ src, clave }: { src: string | null; clave: string }) {
  return <ReproductorVoz src={src} clave={clave} alEscuchar={() => undefined} />
}
