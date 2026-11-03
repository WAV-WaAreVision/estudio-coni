// The R2 of the E2E run (ported from Ingesta's tests/e2e/almacen-falso.ts): a tiny S3 on this machine that accepts the
// browser's presigned PUT, answers HEAD, serves GET (honouring response-content-disposition), lists a prefix and
// deletes a key, so the app signs, measures, downloads and deletes with its real code and nothing real is reachable.
// GET /__objetos lists what it holds with the size and content type of each object.
import { createServer, type Server } from "node:http"

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT, HEAD, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "etag",
}

export function crearAlmacenFalso(): Server {
  const objetos = new Map<string, { bytes: number; tipo: string; firmada: boolean; datos: Buffer }>()

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const clave = decodeURIComponent(url.pathname)

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (url.pathname === "/__salud") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end('{"ok":true}')
      return
    }
    if (url.pathname === "/__objetos") {
      res.writeHead(200, { "content-type": "application/json", ...CORS })
      res.end(
        JSON.stringify(
          Object.fromEntries([...objetos].map(([k, { bytes, tipo, firmada }]) => [k, { bytes, tipo, firmada }])),
        ),
      )
      return
    }
    if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      // ListObjectsV2 of one bucket: the keys under `prefix`, without the bucket in front.
      const base = `${url.pathname.replace(/\/$/, "")}/`
      const prefijo = url.searchParams.get("prefix") ?? ""
      const contenidos = [...objetos]
        .filter(([k]) => k.startsWith(`${base}${prefijo}`))
        .map(([k, { bytes }]) => `<Contents><Key>${k.slice(base.length)}</Key><Size>${bytes}</Size></Contents>`)
      res.writeHead(200, { "content-type": "application/xml", ...CORS })
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${contenidos.join("")}</ListBucketResult>`,
      )
      return
    }
    if (req.method === "GET") {
      const objeto = objetos.get(clave)
      if (!objeto) {
        res.writeHead(404, CORS)
        res.end()
        return
      }
      const descarga = url.searchParams.get("response-content-disposition")
      res.writeHead(200, {
        ...CORS,
        "content-type": objeto.tipo || "application/octet-stream",
        "content-length": String(objeto.bytes),
        ...(descarga ? { "content-disposition": descarga } : {}),
      })
      res.end(objeto.datos)
      return
    }
    if (req.method === "DELETE") {
      objetos.delete(clave)
      res.writeHead(204, CORS)
      res.end()
      return
    }
    if (req.method === "PUT") {
      const trozos: Buffer[] = []
      req.on("data", (trozo: Buffer) => {
        trozos.push(trozo)
      })
      req.on("end", () => {
        const datos = Buffer.concat(trozos)
        objetos.set(clave, {
          bytes: datos.byteLength,
          tipo: req.headers["content-type"] ?? "",
          firmada: url.searchParams.has("X-Amz-Signature"),
          datos,
        })
        res.writeHead(200, { ...CORS, etag: '"falso"' })
        res.end()
      })
      return
    }
    if (req.method === "HEAD") {
      const objeto = objetos.get(clave)
      res.writeHead(objeto ? 200 : 404, objeto ? { ...CORS, "content-length": String(objeto.bytes) } : CORS)
      res.end()
      return
    }
    res.writeHead(405, CORS)
    res.end()
  })
}
