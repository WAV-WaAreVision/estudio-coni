import { type NextRequest, NextResponse } from "next/server"
import { depsDeSalida } from "@/lib/enlaces/deps-reales"
import { resolverSalida } from "@/lib/enlaces/salida"

export const dynamic = "force-dynamic"

type ContextoDeRuta = { params: Promise<{ enlace: string }> }

// A temporary redirect, never cached: a permanent one would let a browser skip this route and the count with it.
const CABECERAS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }

async function salir(request: NextRequest, contexto: ContextoDeRuta, contar: boolean) {
  const { enlace } = await contexto.params
  let destino = "/l"
  try {
    destino = (await resolverSalida({ enlace, cabeceras: request.headers, deps: await depsDeSalida(), contar })).destino
  } catch (error) {
    // The public page never shows an error: without its settings the visitor goes back to the page.
    console.error("/l/ir no pudo resolver el enlace", error)
  }
  return NextResponse.redirect(new URL(destino, request.url), { status: 302, headers: CABECERAS })
}

export async function GET(request: NextRequest, contexto: ContextoDeRuta) {
  return salir(request, contexto, true)
}

// Next answers HEAD with the GET handler unless told otherwise: asking where a link goes is not a tap.
export async function HEAD(request: NextRequest, contexto: ContextoDeRuta) {
  return salir(request, contexto, false)
}
