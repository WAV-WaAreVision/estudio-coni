import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AccionesDelBanco, BancoDeIdeas } from "@/app/(app)/ideas/banco-de-ideas"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

function idea(parcial: Partial<IdeaDeBanco> & { id: string }): IdeaDeBanco {
  return {
    numero: 1,
    pilar: "pareja",
    gancho: "Un gancho",
    tema: "Un tema",
    formato: "Mito o realidad",
    fuerza: "alta",
    alertas: [],
    estado: "idea",
    fijada: false,
    nueva: false,
    porQue: null,
    ...parcial,
  }
}

const IDEAS: IdeaDeBanco[] = [
  idea({
    id: "a",
    numero: 1,
    gancho: "Si van a discutir, siéntense del mismo lado.",
    tema: "Sentarse al lado cambia el tono.",
    alertas: [{ tipo: "verificar dato", texto: "La fuente cita proxémica sin estudio." }],
  }),
  idea({ id: "b", numero: 2, gancho: "El deseo no se apaga: se esconde.", pilar: "deseo", fuerza: "media" }),
  idea({ id: "c", numero: 3, gancho: "¿Por qué sientes culpa al descansar?", pilar: "autoestima" }),
  idea({ id: "d", numero: 4, gancho: "Ya la usé hace poco.", estado: "usada" }),
]

function acciones(cambios: Partial<AccionesDelBanco> = {}): AccionesDelBanco {
  return {
    usar: vi.fn(async () => ({ ok: true as const })),
    quitar: vi.fn(async () => ({ ok: true as const })),
    descartar: vi.fn(async () => ({ ok: true as const })),
    proponer: vi.fn(async () => ({
      ok: true as const,
      propuesta: {
        pilar: "limites" as const,
        formato: "Mito o realidad",
        alertas: [{ tipo: "líneas de ayuda" as const, texto: "El tema roza la violencia en la pareja." }],
      },
    })),
    crear: vi.fn(async () => ({ ok: true as const, id: "nueva" })),
    ...cambios,
  }
}

function mostrar(cambios: Partial<AccionesDelBanco> = {}, ideas: IdeaDeBanco[] = IDEAS) {
  const a = acciones(cambios)
  render(<BancoDeIdeas ideas={ideas} acciones={a} />)
  return a
}

describe("BancoDeIdeas: una idea a la vez", () => {
  it("shows the first free idea with its pillar, strength and alerts, and counts only the free ones", () => {
    mostrar()

    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Pareja y conversación")).toBeInTheDocument()
    expect(screen.getByText(/Fuerza alta/)).toBeInTheDocument()
    expect(screen.getByText("Verificar dato")).toBeInTheDocument()
    expect(screen.queryByText("Ya la usé hace poco.")).not.toBeInTheDocument()
  })

  it("explains each alert so she knows what to check before recording", async () => {
    mostrar()

    fireEvent.click(screen.getByText("Qué revisar antes de grabar"))

    expect(screen.getByText("La fuente cita proxémica sin estudio.")).toBeVisible()
  })

  it("goes to the next idea on Después and comes back to the first after the last", async () => {
    mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeInTheDocument()
    expect(screen.getByText("Idea 2 de 3")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })

  it("adds the idea to the week on Usar esta, says so and moves on", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    await waitFor(() => expect(a.usar).toHaveBeenCalledWith("a"))
    expect(await screen.findByText("La sumé a las ideas de la semana.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 2")).toBeInTheDocument()
  })

  it("brings the idea back and takes it out of the week on Deshacer", async () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(a.quitar).toHaveBeenCalledWith("a"))
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
  })

  it("stays on the idea and says why when it could not be added", async () => {
    mostrar({ usar: vi.fn(async () => ({ ok: false as const, error: "Esa idea ya no está disponible." })) })

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no está disponible.")
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })

  it("says the bank is used up and offers to write an idea when she went through the free ones", async () => {
    mostrar({}, [idea({ id: "a" }), idea({ id: "d", estado: "usada" })])

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    expect(await screen.findByText("Usaste todas las ideas del banco. Escribe una idea nueva.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Usar esta" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir una idea mía" })).toBeInTheDocument()
  })

  it("shows the engine empty state when the bank only holds used ideas", () => {
    mostrar({}, [idea({ id: "d", estado: "usada" })])

    expect(screen.getByText(/El motor propone ideas cada domingo/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toBeInTheDocument()
    expect(screen.queryByText(/Usaste todas/)).not.toBeInTheDocument()
  })
})

describe("BancoDeIdeas: buscar", () => {
  async function abrirBusqueda() {
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }))
  }

  it("lists the free ideas, narrows by word and pillar and tells how many there are", async () => {
    mostrar()
    await abrirBusqueda()

    expect(screen.getByText("3 resultados")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "culpa" } })
    expect(screen.getByText("1 resultado")).toBeInTheDocument()
    expect(screen.getByText("¿Por qué sientes culpa al descansar?")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Deseo" }))
    expect(screen.getByText("1 resultado")).toBeInTheDocument()
    expect(screen.getByText("El deseo no se apaga: se esconde.")).toBeInTheDocument()
  })

  it("can include the ideas already used", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: "Sin usar" }))

    expect(screen.getByText("4 resultados")).toBeInTheDocument()
    expect(screen.getByText("Usada")).toBeInTheDocument()
  })

  it("opens the idea she taps in the one-at-a-time view", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: /culpa al descansar/ }))

    expect(screen.getByRole("heading", { name: "¿Por qué sientes culpa al descansar?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
  })

  it("says nothing matched and offers to write her own idea", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.change(screen.getByLabelText("Buscar por palabra o tema"), { target: { value: "zzz" } })

    expect(screen.getByText("No encontré ideas con esa palabra.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir una idea mía" })).toBeInTheDocument()
  })

  it("goes back to one at a time", async () => {
    mostrar()
    await abrirBusqueda()

    fireEvent.click(screen.getByRole("button", { name: "Una a la vez" }))

    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
  })
})

describe("BancoDeIdeas: escribir una idea mía", () => {
  async function escribir(texto = "Tu pareja te revisa el celular y lo llama amor.") {
    fireEvent.click(screen.getByRole("button", { name: "Escribir una idea mía" }))
    fireEvent.change(screen.getByLabelText("Tu idea"), { target: { value: texto } })
  }

  it("asks Claude for the pillar and alerts and shows them for her to confirm", async () => {
    const a = mostrar()
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))

    await waitFor(() => expect(a.proponer).toHaveBeenCalledWith("Tu pareja te revisa el celular y lo llama amor.", ""))
    expect(await screen.findByRole("radio", { name: "Género y límites" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Líneas de ayuda/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Verificar dato/ })).not.toBeChecked()
  })

  it("saves what she confirmed: the pillar she chose and the alerts she kept", async () => {
    const a = mostrar()
    await escribir()
    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
    await screen.findByRole("radio", { name: "Género y límites" })

    fireEvent.click(screen.getByRole("radio", { name: "Pareja y conversación" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Verificar dato/ }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))

    await waitFor(() => expect(a.crear).toHaveBeenCalledTimes(1))
    expect(a.crear).toHaveBeenCalledWith({
      gancho: "Tu pareja te revisa el celular y lo llama amor.",
      tema: "",
      formato: "Mito o realidad",
      pilar: "pareja",
      alertas: [
        { tipo: "verificar dato", texto: expect.any(String) },
        { tipo: "líneas de ayuda", texto: "El tema roza la violencia en la pareja." },
      ],
    })
    expect(await screen.findByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeInTheDocument()
  })

  it("lets her choose the pillar herself when Claude could not propose one", async () => {
    const a = mostrar({
      proponer: vi.fn(async () => ({
        ok: false as const,
        error: "No pude proponerte el pilar ahora. Elígelo tú y confirma las alertas.",
      })),
    })
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("No pude proponerte el pilar ahora.")
    fireEvent.click(screen.getByRole("button", { name: "Elegir yo el pilar" }))
    expect(screen.getByRole("button", { name: "Guardar idea" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("radio", { name: "Bienestar emocional" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))

    await waitFor(() =>
      expect(a.crear).toHaveBeenCalledWith(expect.objectContaining({ pilar: "bienestar", alertas: [] })),
    )
  })

  it("does not ask Claude about an empty idea", async () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Escribir una idea mía" }))

    expect(screen.getByRole("button", { name: "Proponer pilar y alertas" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
    expect(a.proponer).not.toHaveBeenCalled()
  })

  it("goes back to the ideas without saving", async () => {
    const a = mostrar()
    await escribir()

    fireEvent.click(screen.getByRole("button", { name: "Volver a las ideas" }))

    expect(screen.getByRole("button", { name: "Usar esta" })).toBeInTheDocument()
    expect(a.crear).not.toHaveBeenCalled()
  })
})

const TEORIA = {
  titulo: "El deseo se esconde detrás del cansancio",
  tesis: "Quien dice estar cansada muchas veces protege su deseo.",
  nivel: "medio" as const,
  respaldo: [
    { autor: "Autora Uno", cita: "El cansancio es una forma de decir que no." },
    { autor: "Autora Dos", cita: "El deseo necesita seguridad para aparecer." },
  ],
}

const NUEVA = idea({
  id: "n",
  numero: null,
  gancho: "Estar cansada no siempre es cansancio.",
  nueva: true,
  porQue: TEORIA,
})

describe("BancoDeIdeas: nuevas de la semana", () => {
  it("labels the engine ideas of the week as a section and drops the label for the rest", () => {
    mostrar({}, [NUEVA, ...IDEAS])

    expect(screen.getByText("Nuevas de la semana")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Estar cansada no siempre es cansancio." })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Después" }))
    expect(screen.queryByText("Nuevas de la semana")).not.toBeInTheDocument()
  })

  it("explains why under Por qué: theory, thesis, level and the backing as author and quote", () => {
    mostrar({}, [NUEVA])

    fireEvent.click(screen.getByText("Por qué"))

    expect(screen.getByText(TEORIA.titulo)).toBeVisible()
    expect(screen.getByText(TEORIA.tesis)).toBeVisible()
    expect(screen.getByText("Evidencia: Media")).toBeVisible()
    expect(screen.getByText(/Autora Uno: El cansancio es una forma de decir que no\./)).toBeVisible()
    expect(screen.getByText(/Autora Dos: El deseo necesita seguridad para aparecer\./)).toBeVisible()
    expect(screen.getByText("Solo para ti, no se publica")).toBeVisible()
  })

  it.each([
    ["alto", "Evidencia: Alta"],
    ["debil", "Evidencia: Débil"],
  ] as const)("writes the %s level as it reads to her", (nivel, texto) => {
    mostrar({}, [{ ...NUEVA, porQue: { ...TEORIA, nivel } }])

    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it("has no Por qué on an idea that did not come from the engine", () => {
    mostrar()

    expect(screen.queryByText("Por qué")).not.toBeInTheDocument()
  })

  it("shows the weak backing as a quiet badge, not as something to check before recording", () => {
    mostrar({}, [{ ...NUEVA, alertas: [{ tipo: "respaldo", texto: "respaldo débil" }] }])

    expect(screen.getByText("Respaldo débil")).toBeInTheDocument()
    expect(screen.queryByText("Qué revisar antes de grabar")).not.toBeInTheDocument()
  })

  it("keeps Usar esta working on an engine idea", async () => {
    const a = mostrar({}, [NUEVA])

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    await waitFor(() => expect(a.usar).toHaveBeenCalledWith("n"))
  })
})

describe("BancoDeIdeas: descartar", () => {
  it("opens an in-page choice of reasons with focus on it, and cancelling closes it", () => {
    mostrar({}, [NUEVA, ...IDEAS])

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))

    const grupo = screen.getByRole("group", { name: "¿Por qué la descartas?" })
    for (const motivo of ["No me representa", "Repetida", "Débil", "Otro"]) {
      expect(screen.getByRole("button", { name: motivo })).toBeInTheDocument()
    }
    expect(grupo.contains(document.activeElement)).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("group", { name: "¿Por qué la descartas?" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus()
  })

  it.each([
    ["No me representa", "no_me_representa"],
    ["Repetida", "repetida"],
    ["Débil", "debil"],
    ["Otro", "otro"],
  ])("discards with the reason %s and moves on to the next idea", async (nombre, motivo) => {
    const a = mostrar({}, [NUEVA, ...IDEAS])

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: nombre }))

    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("n", motivo))
    expect(await screen.findByText("Descarté la idea.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
    expect(screen.getByText("Idea 1 de 3")).toBeInTheDocument()
  })

  it("keeps the idea and says why when it could not be discarded", async () => {
    mostrar({ descartar: vi.fn(async () => ({ ok: false as const, error: "Esa idea ya no está disponible." })) })

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: "Repetida" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no está disponible.")
    expect(screen.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeInTheDocument()
  })
})

describe("BancoDeIdeas: banco vacío", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("tells her when the engine proposes and links to the ingestion app from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_INGESTA", "https://ingesta.ejemplo.test")
    mostrar({}, [])

    expect(
      screen.getByText(
        "El motor propone ideas cada domingo a las 20:00. Mientras, sube material en Conidolly Ingesta.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toHaveAttribute(
      "href",
      "https://ingesta.ejemplo.test",
    )
  })

  it("falls back to the production URL when the environment has none", () => {
    vi.stubEnv("NEXT_PUBLIC_URL_INGESTA", "")
    mostrar({}, [])

    expect(screen.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toHaveAttribute(
      "href",
      "https://conidolly-ingesta.vercel.app",
    )
  })
})
