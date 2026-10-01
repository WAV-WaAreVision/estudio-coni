import { afterAll, afterEach, beforeAll } from "vitest"
import { servidor } from "./msw"

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())
