import { spawn } from "node:child_process"
import { createGzip } from "node:zlib"

const LARGO_MAXIMO = 500

/**
 * The arguments of the nightly dump. `public` holds the app's data and `auth` the users its foreign keys point at;
 * Vault is left out on purpose, because its secrets are encrypted with a key that does not travel in a dump, and
 * Coni enters them again in Ajustes. The connection string is the direct one of the Supabase project.
 */
export function argumentosDePgDump(urlDeLaBase: string): string[] {
  return ["--no-owner", "--no-privileges", "--schema=public", "--schema=auth", `--dbname=${urlDeLaBase}`]
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((resto, secreto) => (secreto ? resto.split(secreto).join("[secreto]") : resto), texto)
}

/**
 * Runs a command and returns what it prints to stdout, gzipped as it arrives (the dump is never held uncompressed). It
 * fails with what the command said on stderr when it exits with an error; `secretos` never appear in that message.
 */
export function volcarComando(entrada: {
  comando: string
  argumentos: string[]
  secretos: readonly string[]
}): Promise<Uint8Array> {
  const { comando, argumentos, secretos } = entrada
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(comando, argumentos, { stdio: ["ignore", "pipe", "pipe"] })
    const gzip = createGzip()
    const trozos: Buffer[] = []
    let errores = ""
    gzip.on("data", (trozo: Buffer) => trozos.push(trozo))
    hijo.stdout.pipe(gzip)
    hijo.stderr.on("data", (trozo: Buffer) => {
      if (errores.length < LARGO_MAXIMO) errores += trozo.toString("utf-8")
    })
    hijo.on("error", (error) => {
      rechazar(new Error(sinSecretos(`No pude ejecutar ${comando}: ${error.message}`, secretos)))
    })
    let salida: number | null | undefined
    let comprimido = false
    const terminar = () => {
      if (salida === undefined || !comprimido) return
      if (salida === 0) {
        resolver(new Uint8Array(Buffer.concat(trozos)))
        return
      }
      const detalle = sinSecretos(errores.trim(), secretos).slice(0, LARGO_MAXIMO) || "sin detalle"
      rechazar(new Error(`${comando} terminó con código ${salida}: ${detalle}`))
    }
    gzip.on("end", () => {
      comprimido = true
      terminar()
    })
    hijo.on("close", (codigo) => {
      salida = codigo
      terminar()
    })
  })
}

/** The nightly dump of the production database through `pg_dump`, gzipped. */
export function volcarConPgDump(urlDeLaBase: string): Promise<Uint8Array> {
  return volcarComando({ comando: "pg_dump", argumentos: argumentosDePgDump(urlDeLaBase), secretos: [urlDeLaBase] })
}
