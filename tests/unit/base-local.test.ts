// @vitest-environment node
import { describe, expect, it } from "vitest"
import { exigirBaseLocal } from "../integration/base-local"

describe("exigirBaseLocal", () => {
  it("accepts the local Supabase on 127.0.0.1 or localhost", () => {
    expect(exigirBaseLocal("postgresql://postgres:postgres@127.0.0.1:54422/postgres")).toBe(
      "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
    )
    expect(() => exigirBaseLocal("postgresql://postgres:postgres@localhost:54422/postgres")).not.toThrow()
  })

  it("refuses any other host, because the tests delete spend and pieces", () => {
    expect(() => exigirBaseLocal("postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres")).toThrow(
      /solo corren contra la base local/,
    )
    expect(() => exigirBaseLocal("postgresql://postgres:x@127.0.0.1.evil.example:5432/postgres")).toThrow()
  })

  it("refuses a URL it cannot read", () => {
    expect(() => exigirBaseLocal("no es una url")).toThrow(/solo corren contra la base local/)
  })
})
