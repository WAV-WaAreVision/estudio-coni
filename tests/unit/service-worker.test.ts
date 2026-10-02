// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

type Manejador = (evento: Record<string, unknown>) => void

interface Notificacion {
  titulo: string
  opciones: Record<string, unknown>
}

interface Cliente {
  url: string
  focus: () => Promise<void>
  navigate: (url: string) => Promise<void>
}

/** Runs public/sw.js in a bare context that only has the pieces of a service worker it is allowed to touch. */
function cargarWorker(clientes: Cliente[] = []) {
  const manejadores = new Map<string, Manejador>()
  const mostradas: Notificacion[] = []
  const abiertas: string[] = []
  const contexto = {
    location: { origin: "https://estudio.test" },
    URL,
    JSON,
    clients: {
      matchAll: async () => clientes,
      openWindow: async (url: string) => {
        abiertas.push(url)
      },
    },
    registration: {
      showNotification: async (titulo: string, opciones: Record<string, unknown>) => {
        mostradas.push({ titulo, opciones })
      },
    },
    addEventListener: (nombre: string, manejador: Manejador) => {
      manejadores.set(nombre, manejador)
    },
  }
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf-8"), { ...contexto, self: contexto })
  return { manejadores, mostradas, abiertas }
}

function eventoDePush(datos: unknown) {
  const esperas: Promise<unknown>[] = []
  return {
    esperas,
    evento: {
      data: datos === undefined ? null : { json: () => datos, text: () => JSON.stringify(datos) },
      waitUntil: (promesa: Promise<unknown>) => esperas.push(promesa),
    },
  }
}

function eventoDeClic(url: unknown) {
  const esperas: Promise<unknown>[] = []
  let cerrada = false
  return {
    esperas,
    cerrada: () => cerrada,
    evento: {
      notification: {
        data: url === undefined ? undefined : { url },
        close: () => {
          cerrada = true
        },
      },
      waitUntil: (promesa: Promise<unknown>) => esperas.push(promesa),
    },
  }
}

describe("service worker", () => {
  it("listens to push and to the click on a notification, and to nothing else (no offline cache)", () => {
    const { manejadores } = cargarWorker()
    expect([...manejadores.keys()].sort()).toEqual(["notificationclick", "push"])
  })

  it("shows the title and the body that came in the push, with the screen to open", async () => {
    const { manejadores, mostradas } = cargarWorker()
    const { evento, esperas } = eventoDePush({
      titulo: "Conidolly",
      cuerpo: "Tienes un guion listo para revisar",
      url: "/guion/abc",
    })
    manejadores.get("push")?.(evento)
    await Promise.all(esperas)
    expect(mostradas).toHaveLength(1)
    expect(mostradas[0]?.titulo).toBe("Conidolly")
    expect(mostradas[0]?.opciones).toMatchObject({
      body: "Tienes un guion listo para revisar",
      data: { url: "/guion/abc" },
    })
  })

  it("never offers an action button: approving is done inside the app, with her eyes on the piece", async () => {
    const { manejadores, mostradas } = cargarWorker()
    const { evento, esperas } = eventoDePush({
      titulo: "t",
      cuerpo: "c",
      url: "/",
      actions: [{ action: "aprobar", title: "Aprobar" }],
    })
    manejadores.get("push")?.(evento)
    await Promise.all(esperas)
    expect(mostradas[0]?.opciones).not.toHaveProperty("actions")
  })

  it("shows a plain notice when the push carries nothing readable", async () => {
    const { manejadores, mostradas } = cargarWorker()
    const vacio = eventoDePush(undefined)
    manejadores.get("push")?.(vacio.evento)
    await Promise.all(vacio.esperas)
    const roto = eventoDePush(42)
    manejadores.get("push")?.(roto.evento)
    await Promise.all(roto.esperas)
    expect(mostradas).toHaveLength(2)
    for (const mostrada of mostradas) {
      expect(mostrada.titulo).toBe("Conidolly")
      expect(mostrada.opciones).toMatchObject({ body: "Tienes un aviso nuevo", data: { url: "/" } })
    }
  })

  it("opens the screen of the notice in a new window when the app is closed, and closes the notice", async () => {
    const { manejadores, abiertas } = cargarWorker()
    const clic = eventoDeClic("/video/xyz")
    manejadores.get("notificationclick")?.(clic.evento)
    await Promise.all(clic.esperas)
    expect(clic.cerrada()).toBe(true)
    expect(abiertas).toEqual(["/video/xyz"])
  })

  it("reuses the window that is already open instead of opening another", async () => {
    const navegadas: string[] = []
    let enfocada = false
    const { manejadores, abiertas } = cargarWorker([
      {
        url: "https://estudio.test/ajustes",
        focus: async () => {
          enfocada = true
        },
        navigate: async (url) => {
          navegadas.push(url)
        },
      },
    ])
    const clic = eventoDeClic("/guion/abc")
    manejadores.get("notificationclick")?.(clic.evento)
    await Promise.all(clic.esperas)
    expect(enfocada).toBe(true)
    expect(navegadas).toEqual(["/guion/abc"])
    expect(abiertas).toEqual([])
  })

  it("only ever opens a path of its own app, whatever the push said", async () => {
    for (const intruso of ["https://malo.example/x", "//malo.example", "javascript:alert(1)", 7, undefined]) {
      const { manejadores, abiertas } = cargarWorker()
      const clic = eventoDeClic(intruso)
      manejadores.get("notificationclick")?.(clic.evento)
      await Promise.all(clic.esperas)
      expect(abiertas).toEqual(["/"])
    }
  })
})
