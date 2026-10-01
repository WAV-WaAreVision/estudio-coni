// @vitest-environment node
import { describe, expect, it } from "vitest"

async function resultado(url: string): Promise<string> {
  return fetch(url).then(
    () => "respondió",
    (error) => String(error),
  )
}

describe("servidor MSW de las pruebas", () => {
  it("blocks a request to an external host nobody mocked before it leaves the machine", async () => {
    // A DNS failure would also reject; the [MSW] marker proves MSW stopped it first.
    expect(await resultado("https://api.externo.test/v1/algo")).toContain("[MSW] Cannot bypass a request")
  })

  it("blocks an unmocked request to localhost on another port", async () => {
    expect(await resultado("http://127.0.0.1:59999/")).toContain("[MSW] Cannot bypass a request")
  })

  it("lets the local Supabase API through to the real stack", async () => {
    expect(await resultado("http://127.0.0.1:54421/health")).not.toContain("[MSW]")
  })
})
