// @vitest-environment node
import { WaitpointTimeoutError } from "@trigger.dev/sdk"
import { describe, expect, it } from "vitest"
import { terminarEspera } from "@/lib/produccion/espera"

describe("terminarEspera", () => {
  it("returns when HeyGen's callback woke the run, whatever it carried", () => {
    expect(() => terminarEspera({ ok: true, output: { event_type: "avatar_video.success" } })).not.toThrow()
    expect(() => terminarEspera({ ok: true, output: undefined })).not.toThrow()
  })

  it("returns when the wait ran out, because the status of the video is read by id anyway", () => {
    expect(() => terminarEspera({ ok: false, error: new WaitpointTimeoutError("Waitpoint timed out") })).not.toThrow()
  })

  it("rethrows any other reason the wait ended, which is not an answer about the video", () => {
    const error = new Error("token cancelado")
    expect(() => terminarEspera({ ok: false, error })).toThrow(error)
  })
})
