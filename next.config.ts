import type { NextConfig } from "next"

const nextConfig: NextConfig = {
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
