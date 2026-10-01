import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { exigirEnv } from "@/lib/env"
import { decidirRuta, RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// Refreshes the Supabase session cookies on every page request and sends visitors without a session to sign in.
// This is only the optimistic check: who may do what is decided by Coni's row in `miembros` (see lib/sesion/coni.ts).
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          for (const { name, value } of cookies) request.cookies.set(name, value)
          respuesta = NextResponse.next({ request })
          for (const { name, value, options } of cookies) respuesta.cookies.set(name, value, options)
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  const decision = decidirRuta({ ruta: request.nextUrl.pathname, haySesion: data.user !== null })
  if (decision === "seguir") return respuesta

  const destino = request.nextUrl.clone()
  destino.pathname = decision === "a_ingreso" ? RUTA_DE_INGRESO : "/"
  destino.search = ""
  const redireccion = NextResponse.redirect(destino)
  // The refreshed cookies must travel with the redirect too.
  for (const cookie of respuesta.cookies.getAll()) redireccion.cookies.set(cookie)
  return redireccion
}

export const config = {
  // Pages only: the manifest, the service worker, the icons and Next's own files must load without a session. `/l` is the public page of
  // the bio link and its redirect (`/l/ir/...`): they read no session, so no cookie is touched for a visitor.
  matcher: ["/((?!_next/|l(?:/|$)|manifest.webmanifest|sw\\.js$|icon|apple-icon|favicon.ico).*)"],
}
