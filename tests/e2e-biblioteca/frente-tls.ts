import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { request } from "node:http"
import { createServer } from "node:https"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * An https front for an app of the two-app run. `next start` is production, and in production both ends of the bridge
 * only trust https (Conidolly's INGESTA_URL and Ingesta's CONIDOLLY_URL), as on the two vercel.app domains. The
 * certificate is a throwaway self-signed one made at start; the browser of the run ignores certificate errors.
 */
const puerto = Number(process.env.PUERTO_TLS)
const destino = new URL(process.env.DESTINO_TLS ?? "")

const carpeta = mkdtempSync(join(tmpdir(), "frente-tls-"))
const llave = join(carpeta, "llave.pem")
const certificado = join(carpeta, "certificado.pem")
execFileSync(
  "openssl",
  [
    ...["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost"],
    ...["-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", llave, "-out", certificado],
  ],
  { stdio: "ignore" },
)
const credenciales = { key: readFileSync(llave), cert: readFileSync(certificado) }
rmSync(carpeta, { recursive: true, force: true })

const servidor = createServer(credenciales, (entrada, salida) => {
  if (entrada.url === "/__tls") {
    salida.writeHead(200).end("ok")
    return
  }
  const ida = request(
    {
      hostname: destino.hostname,
      port: destino.port,
      method: entrada.method,
      path: entrada.url,
      headers: { ...entrada.headers, "x-forwarded-proto": "https" },
    },
    (vuelta) => {
      salida.writeHead(vuelta.statusCode ?? 502, vuelta.headers)
      vuelta.pipe(salida)
    },
  )
  ida.on("error", (error) => {
    console.error(`El frente https no llegó a ${destino.origin}: ${error.message}`)
    if (!salida.headersSent) salida.writeHead(502)
    salida.end()
  })
  entrada.pipe(ida)
})

// Every interface, like `next start` behind it: the browser reaches Ingesta by `localhost`, which may resolve to ::1.
servidor.listen(puerto)
servidor.on("listening", () => console.log(`Frente https en ${puerto} hacia ${destino.origin}`))
process.on("SIGTERM", () => servidor.close(() => process.exit(0)))
