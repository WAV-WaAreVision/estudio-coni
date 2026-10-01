import { NextResponse } from "next/server"

/**
 * A redirect inside the app. `NextResponse.redirect(new URL(ruta, request.url))` takes the host from the server's own
 * hostname setting (`localhost` under `next start`), which drops Coni's session cookie when she came in by another
 * host. A relative `Location` keeps the host the browser is already on.
 */
export function irA(ruta: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { location: ruta } })
}
