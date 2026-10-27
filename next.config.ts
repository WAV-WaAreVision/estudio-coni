import type { NextConfig } from "next"

// The app icons read the Geist file at request time; the tracer cannot see that on Vercel, so it is listed here.
const FUENTES_DE_LOS_ICONOS = ["node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf"]

const nextConfig: NextConfig = {
  // Only the Trigger.dev render uses Chromium; if an import ever reached it, it stays out of the server bundle.
  serverExternalPackages: ["playwright"],
  outputFileTracingIncludes: { "/icon": FUENTES_DE_LOS_ICONOS, "/apple-icon": FUENTES_DE_LOS_ICONOS },
  async redirects() {
    return [
      {
        source: "/:ruta*",
        has: [{ type: "host", value: "estudio-coni.vercel.app" }],
        destination: "https://conidolly.vercel.app/:ruta*",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        // The browser checks the worker on every visit; an old copy kept in a cache would keep showing old notices.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
}

export default nextConfig
