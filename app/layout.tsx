import { GeistSans } from "geist/font/sans"
import type { Metadata, Viewport } from "next"
import { SCRIPT_DE_LETRA } from "@/lib/diseno/letra"
import { COLOR_DE_FONDO, NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"
import "./globals.css"

export const metadata: Metadata = {
  title: NOMBRE_DE_LA_APP,
  description: "Donde Coni aprueba los guiones y los videos de su avatar antes de que salgan al aire.",
  applicationName: NOMBRE_DE_LA_APP,
  appleWebApp: { capable: true, title: NOMBRE_DE_LA_APP, statusBarStyle: "default" },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COLOR_DE_FONDO,
  colorScheme: "light",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The head script sets data-letra before React hydrates: that attribute is not React's to compare.
    <html lang="es-CL" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant of lib/diseno/letra.ts, no input reaches it. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_LETRA }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
