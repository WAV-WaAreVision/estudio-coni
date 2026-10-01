import type { Metadata, Viewport } from "next"
import { Hanken_Grotesk, Young_Serif } from "next/font/google"
import { COLOR_DE_FONDO, NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"
import "./globals.css"

const serif = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--font-young-serif", display: "swap" })
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" })

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
    <html lang="es-CL" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
