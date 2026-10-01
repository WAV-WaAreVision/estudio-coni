// @vitest-environment node
import { gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { argumentosDePgDump, volcarComando } from "@/lib/mantenimiento/pg-dump"

const URL_DB = "postgresql://postgres:clave-secreta@db.ejemplo.test:5432/postgres"

describe("volcarComando", () => {
  it("returns what the command prints, gzipped", async () => {
    const bytes = await volcarComando({
      comando: process.execPath,
      argumentos: ["-e", "process.stdout.write('SELECT 1;\\n'.repeat(1000))"],
      secretos: [],
    })
    expect(gunzipSync(bytes).toString("utf-8")).toBe("SELECT 1;\n".repeat(1000))
  })

  it("fails with what the command said when it exits with an error, without the secrets", async () => {
    const error = await volcarComando({
      comando: process.execPath,
      argumentos: ["-e", `console.error('no pude conectar a ${URL_DB}'); process.exit(3)`],
      secretos: [URL_DB, "clave-secreta"],
    }).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )
    expect(error.message).toContain("código 3")
    expect(error.message).toContain("no pude conectar")
    expect(error.message).not.toContain("clave-secreta")
  })

  it("fails when the command does not exist", async () => {
    await expect(volcarComando({ comando: "/no/existe/pg_dump", argumentos: [], secretos: [] })).rejects.toThrow(
      /pg_dump/,
    )
  })
})

describe("argumentosDePgDump", () => {
  it("dumps the public and auth schemas without owners or privileges, from the connection string", () => {
    expect(argumentosDePgDump(URL_DB)).toEqual([
      "--no-owner",
      "--no-privileges",
      "--schema=public",
      "--schema=auth",
      `--dbname=${URL_DB}`,
    ])
  })
})
