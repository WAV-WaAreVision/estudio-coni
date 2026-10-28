# Exact date and time at gate 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At gate 2 of a reel or a carousel, Coni can choose "Otra fecha y hora" and pick any day and time (Chile time, 5-minute steps, at least 15 minutes ahead), besides the schedule slots.

**Architecture:** A pure rule `horaElegida` in `lib/dominio/fechas.ts` turns a picked day and time into a UTC instant or a reason. One client hook plus component, `app/(app)/elegir-fecha.tsx`, replaces the duplicated radio list in both gate 2 screens and adds the option with two `FilaConValor` rows (date and time). The server adds one check, `exigirAnticipacion` (15 minutes), to `aprobarVideo` and `aprobarCarrusel`. No migration, no Trigger change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Vitest (unit `pnpm test:run`, integration `pnpm test:db` against local Supabase), Playwright (`pnpm test:e2e`), Biome (`pnpm lint`; never `--unsafe`).

**Spec:** `docs/superpowers/specs/2026-10-28-conidolly-fecha-y-hora-exacta-design.md`.

**Work in a worktree:** `git worktree add .worktrees/fecha-exacta -b feat/fecha-exacta main`. Commit after each task (messages in English, ending with the `Co-Authored-By` line the session gives). No push.

## Decisions taken while planning (not in the spec)

- **P1. No more "no free slot" block.** Today an empty slot list blocks gate 2 with "No hay un horario libre. Avísale a Federico." (`SIN_HORARIO`). With the picker there is always a way to choose, so a missing date becomes a normal "Falta: elegir la fecha" item in both gates, and `SIN_HORARIO` is removed. With no slots, the section opens with "Otra fecha y hora" already chosen.
- **P2. The picker rows reuse `FilaConValor`** (`components/ui/filas.tsx`), the row Ajustes uses for "Hora de publicación": it gains `tipo="date"`, an optional `mostrar` (the visible text) and `step`. Same look as Ajustes, no new input style.
- **P3. The day row shows "miércoles 28 de octubre"** (new `etiquetaDeDia`), or "Elegir" while empty.
- **P4. The client clock** is read in the hook (`Date.now()`) only while "Otra fecha y hora" is chosen and a day is set, so server and client render the same first frame.

## File map

| File | Change |
|---|---|
| `lib/dominio/fechas.ts` | add `ANTICIPACION_MINIMA_MS`, `MOTIVOS_DE_HORA`, `horaElegida`, `etiquetaDeDia`, `horaEnBloques` |
| `lib/acciones/piezas.ts` | add `exigirAnticipacion`, call it in `aprobarVideo` and `aprobarCarrusel` |
| `app/(app)/fechas-de-puerta-2.ts` | also return `horaDelRitmo` |
| `app/(app)/video/[id]/page.tsx`, `app/(app)/guion/[id]/carrusel.tsx` | pass `zona` and `horaDelRitmo` in `datos` |
| `components/ui/filas.tsx` | `FilaConValor`: `tipo="date"`, `mostrar`, `step` |
| `app/(app)/video/[id]/falta-para-firmar.ts`, `app/(app)/guion/[id]/falta-para-programar.ts` | missing date is a "falta" item, `SIN_HORARIO` removed |
| `app/(app)/elegir-fecha.tsx` (new) | `useEleccionDeFecha` hook and `ElegirFecha` component |
| `app/(app)/guion/[id]/puerta-2-carrusel.tsx`, `app/(app)/video/[id]/pantalla-video.tsx` | use them |
| tests | `tests/unit/fechas.test.ts`, `tests/unit/fila-con-valor.test.tsx` (new), `tests/unit/elegir-fecha.test.tsx` (new), `tests/unit/falta-para-*.test.ts`, `tests/unit/puerta-2-carrusel.test.tsx`, `tests/unit/pantalla-video.test.tsx`, `tests/integration/acciones-piezas.test.ts`, `tests/integration/acciones-carrusel.test.ts`, `tests/e2e/carrusel.spec.ts`, `tests/e2e/video.spec.ts`, `tests/e2e/visual.spec.ts` |
| `docs/TRASPASO.md`, `docs/PRODUCT.md` | one line each |

---

### Task 1: The rule for a picked day and time

**Files:**
- Modify: `lib/dominio/fechas.ts`
- Test: `tests/unit/fechas.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/fechas.test.ts`; extend its import with `etiquetaDeDia, horaElegida, horaEnBloques, MOTIVOS_DE_HORA`)

```ts
describe("horaElegida", () => {
  // Wednesday 28 October 2026, 08:45 in Santiago (UTC-3).
  const AHORA = Date.parse("2026-10-28T11:45:00Z")
  const elegir = (dia: string, hora: string, ahora = AHORA) => horaElegida({ dia, hora, zona: ZONA, ahora })

  it("reads a Chile day and time in summer time as UTC", () => {
    expect(elegir("2026-10-28", "10:15")).toEqual({ ok: true, iso: "2026-10-28T13:15:00.000Z" })
  })

  it("reads a Chile day and time in winter time as UTC", () => {
    expect(elegir("2026-07-02", "10:00", Date.parse("2026-07-01T12:00:00Z"))).toEqual({
      ok: true,
      iso: "2026-07-02T14:00:00.000Z",
    })
  })

  it("accepts the seconds a time field may add", () => {
    expect(elegir("2026-10-28", "10:15:00")).toEqual({ ok: true, iso: "2026-10-28T13:15:00.000Z" })
  })

  it("asks for the day when it is missing or not a real day", () => {
    expect(elegir("", "10:15")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.dia })
    expect(elegir("2026-02-30", "10:15")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.dia })
  })

  it("asks for the time when it is missing or not a real time", () => {
    expect(elegir("2026-10-28", "")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
    expect(elegir("2026-10-28", "25:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
  })

  it("refuses a minute that is not a multiple of 5, since the publisher runs every 5 minutes", () => {
    expect(elegir("2026-10-28", "10:07")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.paso })
  })

  it("needs at least 15 minutes ahead, and exactly 15 is enough", () => {
    expect(elegir("2026-10-28", "08:55")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.anticipacion })
    expect(elegir("2026-10-28", "09:00")).toEqual({ ok: true, iso: "2026-10-28T12:00:00.000Z" })
  })

  it("refuses a time that already passed with the same words", () => {
    expect(elegir("2026-10-27", "19:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.anticipacion })
  })

  it("refuses a day more than 400 days ahead", () => {
    expect(elegir("2027-12-31", "19:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.lejos })
  })
})

describe("etiquetaDeDia", () => {
  it("names a calendar day in Chile", () => {
    expect(etiquetaDeDia("2026-10-28", ZONA)).toBe("miércoles 28 de octubre")
  })

  it("is empty for an unreadable day", () => {
    expect(etiquetaDeDia("", ZONA)).toBe("")
  })
})

describe("horaEnBloques", () => {
  it("rounds the schedule hour down to 5 minutes and drops the seconds", () => {
    expect(horaEnBloques("19:07:00")).toBe("19:05")
    expect(horaEnBloques("19:00")).toBe("19:00")
  })

  it("is empty for an unreadable hour", () => {
    expect(horaEnBloques("")).toBe("")
  })
})
```

- [ ] **Step 2: Run them, expect FAIL** (the exports do not exist)

Run: `pnpm test:run tests/unit/fechas.test.ts`

- [ ] **Step 3: Implement** (in `lib/dominio/fechas.ts`, after `proponerFechas`; it reuses `instanteLocal`, `DIAS_A_REVISAR` and `nombresDeFecha`, already in the file)

```ts
/** A picked time has to be this far ahead (spec F2): the publisher runs every 5 minutes. */
export const ANTICIPACION_MINIMA_MS = 15 * 60 * 1000
const PASO_EN_MINUTOS = 5
const UN_DIA_MS = 24 * 60 * 60 * 1000

export const MOTIVOS_DE_HORA = {
  dia: "Elige el día.",
  hora: "Elige la hora.",
  paso: "Elige una hora en bloques de 5 minutos.",
  anticipacion: "Elige una hora con al menos 15 minutos de anticipación.",
  lejos: "Elige una fecha dentro del próximo año.",
} as const

export type HoraElegida = { ok: true; iso: string } | { ok: false; motivo: string }

function leerDia(dia: string): { anio: number; mes: number; dia: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  if (!partes) return null
  const fecha = { anio: Number(partes[1]), mes: Number(partes[2]), dia: Number(partes[3]) }
  const enUtc = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia))
  // Date.UTC rolls 30 February over to March: a day that does not round-trip does not exist.
  if (enUtc.getUTCMonth() !== fecha.mes - 1 || enUtc.getUTCDate() !== fecha.dia) return null
  return fecha
}

function leerHoraElegida(hora: string): { hora: number; minuto: number } | null {
  const partes = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hora)
  if (!partes) return null
  const valor = { hora: Number(partes[1]), minuto: Number(partes[2]) }
  return valor.hora < 24 && valor.minuto < 60 ? valor : null
}

/** "Otra fecha y hora" at gate 2: a Chile day (`2026-10-28`) and time (`10:15`) as a UTC instant, or why not. */
export function horaElegida(entrada: { dia: string; hora: string; zona: string; ahora: number }): HoraElegida {
  const dia = leerDia(entrada.dia)
  if (!dia) return { ok: false, motivo: MOTIVOS_DE_HORA.dia }
  const reloj = leerHoraElegida(entrada.hora)
  if (!reloj) return { ok: false, motivo: MOTIVOS_DE_HORA.hora }
  if (reloj.minuto % PASO_EN_MINUTOS !== 0) return { ok: false, motivo: MOTIVOS_DE_HORA.paso }
  const instante = instanteLocal({ ...dia, ...reloj }, entrada.zona)
  if (instante < entrada.ahora + ANTICIPACION_MINIMA_MS) return { ok: false, motivo: MOTIVOS_DE_HORA.anticipacion }
  if (instante > entrada.ahora + DIAS_A_REVISAR * UN_DIA_MS) return { ok: false, motivo: MOTIVOS_DE_HORA.lejos }
  return { ok: true, iso: new Date(instante).toISOString() }
}

/** "miércoles 28 de octubre" for a picked day, or "" while it is not a day. */
export function etiquetaDeDia(dia: string, zona: string): string {
  const fecha = leerDia(dia)
  if (!fecha) return ""
  // Midday is the same calendar day in Chile whatever the offset.
  const f = nombresDeFecha(instanteLocal({ ...fecha, hora: 12, minuto: 0 }, zona), zona)
  return `${f.diaDeLaSemana} ${f.dia} de ${f.mes}`
}

/** The schedule hour as the picker starts it: `19:07:00` becomes `19:05`. */
export function horaEnBloques(hora: string): string {
  const reloj = leerHoraElegida(hora)
  if (!reloj) return ""
  const minuto = reloj.minuto - (reloj.minuto % PASO_EN_MINUTOS)
  return `${String(reloj.hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`
}
```

`DIAS_A_REVISAR` is declared before `proponerFechas`; place this block after `nombresDeFecha` so both are defined above it.

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test:run tests/unit/fechas.test.ts`

- [ ] **Step 5: Commit** — `git add lib/dominio/fechas.ts tests/unit/fechas.test.ts && git commit -m "Add the rule for a picked publish day and time"`

---

### Task 2: The server refuses less than 15 minutes ahead

**Files:**
- Modify: `lib/acciones/piezas.ts` (near `exigirHorarioLibre`, line ~751; calls in `aprobarCarrusel` ~542 and `aprobarVideo` ~808)
- Test: `tests/integration/acciones-piezas.test.ts` (inside `describe("aprobarVideo")`), `tests/integration/acciones-carrusel.test.ts` (inside `describe("aprobarCarrusel")`)

Needs local Supabase running (`pnpm db:start`). If `pnpm db:reset` is blocked, run against the existing local database.

- [ ] **Step 1: Write the failing tests**

In `tests/integration/acciones-piezas.test.ts`, inside `describe("aprobarVideo", ...)` (it already has `paraAprobar`, `armar`, `fila`, `FUTURO = "2099-10-09T19:00:00-03:00"`, which is 22:00 UTC):

```ts
  it("refuses a time less than 15 minutes ahead", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const diezAntes = { ...deps, ahora: () => "2099-10-09T21:50:00.000Z" }

    const resultado = await aprobarVideo(diezAntes, id, (await fila(id)).version, FUTURO, ["instagram"])

    expect(resultado).toEqual({ ok: false, error: "Elige una hora con al menos 15 minutos de anticipación." })
    expect((await fila(id)).estado).toBe("video_por_aprobar")
  })

  it("accepts a time 20 minutes ahead that is not a schedule slot", async () => {
    const id = await paraAprobar()
    const { deps } = armar()
    const veinteAntes = { ...deps, ahora: () => "2099-10-09T21:15:00.000Z" }

    const resultado = await aprobarVideo(veinteAntes, id, (await fila(id)).version, "2099-10-09T18:35:00-03:00", [
      "instagram",
    ])

    expect(resultado.ok).toBe(true)
    expect(new Date((await fila(id)).puerta2_publicar_en).toISOString()).toBe("2099-10-09T21:35:00.000Z")
  })
```

In `tests/integration/acciones-carrusel.test.ts`, inside `describe("aprobarCarrusel", ...)` (it has `enPuerta2`, `armar`, `versionDe`, `leerFila`):

```ts
  it("refuses a time less than 15 minutes ahead", async () => {
    const { id, version } = await enPuerta2()
    const { deps } = armar()
    const publicarEn = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    expect(await aprobarCarrusel(deps, id, await versionDe(id), version.id, publicarEn)).toEqual({
      ok: false,
      error: "Elige una hora con al menos 15 minutos de anticipación.",
    })
    expect((await leerFila(id)).estado).toBe("carrusel_por_aprobar")
  })

  it("accepts a time 20 minutes ahead", async () => {
    const { id, version } = await enPuerta2()
    const { deps } = armar()
    const publicarEn = new Date(Date.now() + 20 * 60 * 1000).toISOString()

    expect(await aprobarCarrusel(deps, id, await versionDe(id), version.id, publicarEn)).toEqual({ ok: true })
    expect((await leerFila(id)).estado).toBe("programado")
  })
```

- [ ] **Step 2: Run, expect the two "refuses" tests to FAIL** (today both are accepted)

Run: `pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-carrusel.test.ts -t "15 minutes|20 minutes"`

- [ ] **Step 3: Implement** in `lib/acciones/piezas.ts`. Import `ANTICIPACION_MINIMA_MS` and `MOTIVOS_DE_HORA` from `@/lib/dominio/fechas` (add to an existing import from that module if there is one). Add next to `exigirHorarioLibre`:

```ts
/** Spec F2: at least 15 minutes ahead. A past or unreadable time is left to the transition, which says it its way. */
function exigirAnticipacion(publicarEn: string, ahora: string): void {
  const instante = instanteEstricto(publicarEn)
  if (instante === null) return
  const falta = Date.parse(instante) - Date.parse(ahora)
  if (falta > 0 && falta < ANTICIPACION_MINIMA_MS) throw new Falla(MOTIVOS_DE_HORA.anticipacion)
}
```

Call it right before each `await exigirHorarioLibre(...)`:

```ts
    exigirAnticipacion(publicarEn, deps.ahora())
```

(once in `aprobarCarrusel`, once in `aprobarVideo`).

- [ ] **Step 4: Run the whole `aprobarVideo` and `aprobarCarrusel` blocks, expect PASS** (the "already passed" test keeps its message)

Run: `pnpm test:db tests/integration/acciones-piezas.test.ts tests/integration/acciones-carrusel.test.ts -t "aprobarVideo|aprobarCarrusel"`

- [ ] **Step 5: Commit** — `git commit -m "Refuse a gate 2 time less than 15 minutes ahead"`

---

### Task 3: Gate 2 data carries the zone and the schedule hour

**Files:**
- Modify: `app/(app)/fechas-de-puerta-2.ts`, `app/(app)/video/[id]/page.tsx:188-218`, `app/(app)/video/[id]/pantalla-video.tsx:43-66` (`DatosDeVideo`), `app/(app)/guion/[id]/carrusel.tsx:113-140`, `app/(app)/guion/[id]/puerta-2-carrusel.tsx` (its datos interface, line ~49)
- Test fixtures: `tests/unit/puerta-2-carrusel.test.tsx` (`DATOS`), `tests/unit/pantalla-video.test.tsx` (its datos fixture)

- [ ] **Step 1: Return the hour.** In `fechasDePuerta2`, change the return type to `Promise<{ fechas: FechaPropuesta[]; zona: string; horaDelRitmo: string }>` and return `{ fechas, zona: contexto.horario.zona, horaDelRitmo: contexto.horario.hora }`. Update its doc comment: "Also the zone and the schedule hour: the labels of a scheduled piece and the start of 'Otra fecha y hora'."

- [ ] **Step 2: Add to both datos types**

```ts
  /** Where her schedule lives ("America/Santiago"): the picked day and time are read there. */
  zona: string
  /** Her schedule hour (`19:00`): where "Otra fecha y hora" starts. */
  horaDelRitmo: string
```

in `DatosDeVideo` and in the carousel datos interface.

- [ ] **Step 3: Pass them.** In `video/[id]/page.tsx`: `const { fechas, zona, horaDelRitmo } = await fechasDePuerta2(db, fila.id, ahora)` and add `zona, horaDelRitmo,` to `datos`. In `guion/[id]/carrusel.tsx` (`carrusel_por_aprobar` case): destructure `{ fechas, zona, horaDelRitmo }` and add both to `datos`.

- [ ] **Step 4: Fixtures.** Add `zona: "America/Santiago", horaDelRitmo: "19:00",` to `DATOS` in `tests/unit/puerta-2-carrusel.test.tsx` and to the datos fixture of `tests/unit/pantalla-video.test.tsx`.

- [ ] **Step 5: Check** — `pnpm type && pnpm test:run tests/unit/puerta-2-carrusel.test.tsx tests/unit/pantalla-video.test.tsx` → PASS (nothing reads the fields yet).

- [ ] **Step 6: Commit** — `git commit -m "Pass the zone and schedule hour to both gate 2 screens"`

---

### Task 4: `FilaConValor` for a day

**Files:**
- Modify: `components/ui/filas.tsx` (`PropiedadesDeFilaConValor` and `FilaConValor`, lines ~30-90)
- Test: `tests/unit/fila-con-valor.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConValor } from "@/components/ui/filas"

describe("FilaConValor", () => {
  it("offers a day with a native date field and shows the text it is given", () => {
    const alCambiar = vi.fn()
    render(<FilaConValor tipo="date" etiqueta="Día" valor="" mostrar="Elegir" alCambiar={alCambiar} />)

    expect(screen.getByText("Elegir")).toBeInTheDocument()
    const campo = screen.getByLabelText("Día")
    expect(campo).toHaveAttribute("type", "date")
    fireEvent.change(campo, { target: { value: "2026-10-28" } })
    expect(alCambiar).toHaveBeenCalledWith("2026-10-28")
  })

  it("passes the step to a time field", () => {
    render(<FilaConValor tipo="time" etiqueta="Hora" valor="10:15" step={300} alCambiar={() => {}} />)
    expect(screen.getByLabelText("Hora")).toHaveAttribute("step", "300")
    expect(screen.getByText("10:15")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/fila-con-valor.test.tsx`

- [ ] **Step 3: Implement.** In `PropiedadesDeFilaConValor`, widen `tipo` to `"select" | "time" | "date"` and add:

```ts
  /** The text shown instead of the raw value (a day reads "miércoles 28 de octubre", not `2026-10-28`). */
  mostrar?: string
  /** For a time: the minutes between choices, in seconds (300 is 5 minutes). */
  step?: number
```

In `FilaConValor`, destructure `mostrar` and `step`, compute

```ts
  const visible =
    mostrar ?? (tipo === "select" ? (opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor) : valor)
```

and replace the `tipo === "time"` branch with one for both native fields:

```tsx
      {tipo === "time" || tipo === "date" ? (
        <input
          type={tipo}
          aria-label={etiqueta}
          value={valor}
          step={step}
          onChange={(evento) => alCambiar(evento.target.value as T)}
          className={clasesDelControl}
        />
      ) : (
```

- [ ] **Step 4: Run, expect PASS** — `pnpm test:run tests/unit/fila-con-valor.test.tsx` and the Ajustes tests (`pnpm test:run tests/unit -t "Ajustes|ajustes"`).

- [ ] **Step 5: Commit** — `git commit -m "Let FilaConValor offer a day and show a label for its value"`

---

### Task 5: A missing date is something to do, not a block

**Files:**
- Modify: `app/(app)/video/[id]/falta-para-firmar.ts`, `app/(app)/guion/[id]/falta-para-programar.ts`
- Test: `tests/unit/falta-para-firmar-video.test.ts`, `tests/unit/falta-para-programar.test.ts`

- [ ] **Step 1: Change the tests first.** In both files, replace every test that expects `{ tipo: "bloqueo", texto: SIN_HORARIO }` (or the text "No hay un horario libre. Avísale a Federico.") and remove the `SIN_HORARIO` import. New cases:

`tests/unit/falta-para-programar.test.ts`:

```ts
  it("asks to choose the date when none is chosen", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: false })).toEqual({
      tipo: "falta",
      cosas: ["elegir la fecha"],
    })
  })

  it("lists the slides first and then the date", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: false, hayFecha: false })).toEqual({
      tipo: "falta",
      cosas: ["ver todas las láminas", "elegir la fecha"],
    })
  })
```

`tests/unit/falta-para-firmar-video.test.ts` (use the file's existing base state object; below it is called `LISTO`, rename to whatever the file uses):

```ts
  it("asks to choose the date last when none is chosen", () => {
    expect(faltaParaFirmarVideo({ ...LISTO, visto: false, hayFecha: false })).toEqual({
      tipo: "falta",
      cosas: ["terminar el video", "elegir la fecha"],
    })
  })
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/falta-para-firmar-video.test.ts tests/unit/falta-para-programar.test.ts`

- [ ] **Step 3: Implement.**

`falta-para-firmar.ts`: delete `SIN_HORARIO`; remove the `if (!estado.hayFecha) return { tipo: "bloqueo", ... }` line; add `estado.hayFecha ? null : "elegir la fecha",` as the last entry of `cosas`. Update the doc comment of `faltaParaFirmarVideo` to "What keeps gate 2's signature closed (decision 11, step 8): a "Falta:" list; the date is the last item." The `bloqueo` variant of `FaltaParaFirmarVideo` stays if anything else returns it; if nothing does, remove it and its branch in `pantalla-video.tsx`.

`falta-para-programar.ts`: remove the `SIN_HORARIO` import and the bloqueo line, and build the list:

```ts
/** What keeps a carousel's gate 2 closed: seeing every slide and choosing the date. */
export function faltaParaProgramarCarrusel(estado: { vioTodas: boolean; hayFecha: boolean }): FaltaParaProgramar {
  const cosas = [estado.vioTodas ? null : "ver todas las láminas", estado.hayFecha ? null : "elegir la fecha"].filter(
    (cosa): cosa is string => cosa !== null,
  )
  return cosas.length === 0 ? { tipo: "nada" } : { tipo: "falta", cosas }
}
```

Keep the `bloqueo` variant in `FaltaParaProgramar` only if the screen still needs it; otherwise remove it and its branch in `puerta-2-carrusel.tsx` (`falta.tipo === "bloqueo"`).

- [ ] **Step 4: Run** — `pnpm test:run tests/unit` → PASS. `grep -rn "SIN_HORARIO\|Avísale a Federico" app lib tests` → only unrelated hits.

- [ ] **Step 5: Commit** — `git commit -m "Make a missing gate 2 date a to-do instead of a block"`

---

### Task 6: The shared date chooser

**Files:**
- Create: `app/(app)/elegir-fecha.tsx`
- Test: `tests/unit/elegir-fecha.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElegirFecha, useEleccionDeFecha } from "@/app/(app)/elegir-fecha"
import type { FechaPropuesta } from "@/app/(app)/video/[id]/pantalla-video"

const FECHAS: FechaPropuesta[] = [
  { iso: "2026-10-29T22:00:00.000Z", etiqueta: "jueves 29 de octubre · 19:00", corta: "jueves 29 · 19:00" },
]

function Prueba({ fechas = FECHAS }: { fechas?: FechaPropuesta[] }) {
  const eleccion = useEleccionDeFecha({ fechas, zona: "America/Santiago", horaDelRitmo: "19:00" })
  return (
    <>
      <ElegirFecha eleccion={eleccion} meta="LinkedIn · hora de Chile" debajo={(iso) => `debajo ${iso}`} />
      <p data-testid="elegida">{eleccion.fecha?.iso ?? "ninguna"}</p>
    </>
  )
}

describe("ElegirFecha", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // Wednesday 28 October 2026, 08:45 in Santiago.
    vi.setSystemTime(new Date("2026-10-28T11:45:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("starts on the first schedule slot and shows what follows from it", () => {
    render(<Prueba />)
    expect(screen.getByText("jueves 29 de octubre · 19:00")).toBeInTheDocument()
    expect(screen.getByText("debajo 2026-10-29T22:00:00.000Z")).toBeInTheDocument()
    expect(screen.getByTestId("elegida")).toHaveTextContent("2026-10-29T22:00:00.000Z")
  })

  it("offers another day and time, and nothing is chosen until the day is set", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))

    expect(screen.getByTestId("elegida")).toHaveTextContent("ninguna")
    expect(screen.getByText("Elige el día.")).toBeInTheDocument()
    expect(screen.getByLabelText("Hora")).toHaveValue("19:00")
  })

  it("takes a valid day and time as the date", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-28" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:15" } })

    expect(screen.getByTestId("elegida")).toHaveTextContent("2026-10-28T13:15:00.000Z")
    expect(screen.getByText("miércoles 28 de octubre · 10:15")).toBeInTheDocument()
    expect(screen.getByText("miércoles 28 de octubre")).toBeInTheDocument()
  })

  it("says why a time too close does not count", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-28" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "08:55" } })

    expect(screen.getByTestId("elegida")).toHaveTextContent("ninguna")
    expect(screen.getByText("Elige una hora con al menos 15 minutos de anticipación.")).toBeInTheDocument()
  })

  it("with no schedule slot opens on another day and time", () => {
    render(<Prueba fechas={[]} />)
    expect(screen.getByRole("radio", { name: "Otra fecha y hora" })).toBeChecked()
    expect(screen.getByLabelText("Día")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/elegir-fecha.test.tsx`

- [ ] **Step 3: Implement** `app/(app)/elegir-fecha.tsx`

```tsx
"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion, FilaConValor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { etiquetaDeDia, etiquetaDeFecha, horaElegida, horaEnBloques } from "@/lib/dominio/fechas"
import type { FechaPropuesta } from "./video/[id]/pantalla-video"

const OTRA = "otra"

export interface EleccionDeFecha {
  /** What the signature sends, or null while nothing valid is chosen. */
  fecha: FechaPropuesta | null
  fechas: FechaPropuesta[]
  zona: string
  elegida: string
  elegir: (valor: string) => void
  dia: string
  setDia: (dia: string) => void
  hora: string
  setHora: (hora: string) => void
  motivo: string | null
  cambiando: boolean
  setCambiando: (cambiando: boolean) => void
}

/**
 * Gate 2's date (spec 2026-10-28): a schedule slot, or "Otra fecha y hora" picked in Chile time. The clock is read only
 * once a day is picked (decision P4), so the server and the first client frame agree.
 */
export function useEleccionDeFecha(entrada: {
  fechas: FechaPropuesta[]
  zona: string
  horaDelRitmo: string
}): EleccionDeFecha {
  const { fechas, zona } = entrada
  const [elegida, elegir] = useState(fechas[0]?.iso ?? OTRA)
  const [dia, setDia] = useState("")
  const [hora, setHora] = useState(horaEnBloques(entrada.horaDelRitmo))
  const [cambiando, setCambiando] = useState(fechas.length === 0)

  let fecha: FechaPropuesta | null = null
  let motivo: string | null = null
  if (elegida === OTRA) {
    const resultado = horaElegida({ dia, hora, zona, ahora: dia === "" ? 0 : Date.now() })
    if (resultado.ok) {
      fecha = {
        iso: resultado.iso,
        etiqueta: etiquetaDeFecha(resultado.iso, zona, "larga"),
        corta: etiquetaDeFecha(resultado.iso, zona, "corta"),
      }
    } else {
      motivo = resultado.motivo
    }
  } else {
    fecha = fechas.find((propuesta) => propuesta.iso === elegida) ?? null
  }
  return { fecha, fechas, zona, elegida, elegir, dia, setDia, hora, setHora, motivo, cambiando, setCambiando }
}

/** The "Cuándo sale" / "Dónde y cuándo" section body: the chosen date, then the choices while she changes it. */
export function ElegirFecha({
  eleccion,
  meta,
  debajo,
}: {
  eleccion: EleccionDeFecha
  /** "LinkedIn · hora de Chile": where and in which clock. */
  meta: string
  /** What follows from the chosen time (the carousel's LinkedIn line). */
  debajo?: (iso: string) => ReactNode
}) {
  const { fecha, cambiando } = eleccion
  const abierto = cambiando || fecha === null
  return (
    <div className="grid gap-2">
      {fecha ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="grid">
            <span data-snapshot="varia" className="font-semibold tabular-nums">
              {fecha.etiqueta}
            </span>
            <span className="text-meta text-apagado">{meta}</span>
          </span>
          <Boton
            variante="secundario"
            tamano="chico"
            aria-expanded={cambiando}
            onClick={() => eleccion.setCambiando(!cambiando)}
          >
            {cambiando ? "Listo" : "Cambiar"}
          </Boton>
        </div>
      ) : null}
      {fecha && debajo ? <p className="text-meta text-apagado">{debajo(fecha.iso)}</p> : null}
      {abierto ? (
        <fieldset className="elecciones grid border-0 p-0">
          <legend className="sr-only">Elige cuándo sale</legend>
          {eleccion.fechas.map((propuesta) => (
            <Eleccion
              key={propuesta.iso}
              nombre="fecha"
              valor={propuesta.iso}
              elegido={propuesta.iso === eleccion.elegida}
              etiqueta={propuesta.etiqueta}
              alElegir={eleccion.elegir}
            />
          ))}
          <Eleccion
            nombre="fecha"
            valor={OTRA}
            elegido={eleccion.elegida === OTRA}
            etiqueta="Otra fecha y hora"
            alElegir={eleccion.elegir}
          />
        </fieldset>
      ) : null}
      {abierto && eleccion.elegida === OTRA ? (
        <>
          <Grupo>
            <FilaConValor
              tipo="date"
              etiqueta="Día"
              valor={eleccion.dia}
              mostrar={etiquetaDeDia(eleccion.dia, eleccion.zona) || "Elegir"}
              alCambiar={eleccion.setDia}
            />
            <FilaConValor
              tipo="time"
              etiqueta="Hora"
              valor={eleccion.hora}
              step={300}
              sufijo="hora de Chile"
              alCambiar={eleccion.setHora}
            />
          </Grupo>
          <p className="text-meta text-apagado" aria-live="polite">
            {eleccion.motivo ?? ""}
          </p>
        </>
      ) : null}
    </div>
  )
}
```

`Grupo` lives in `components/ui/grupo.tsx` and `Boton` in `components/ui/boton.tsx` (as Ajustes and the carousel gate import them).

- [ ] **Step 4: Run, expect PASS** — `pnpm test:run tests/unit/elegir-fecha.test.tsx`

- [ ] **Step 5: Commit** — `git commit -m "Add the shared gate 2 date chooser with another day and time"`

---

### Task 7: Carousel gate 2 uses it

**Files:**
- Modify: `app/(app)/guion/[id]/puerta-2-carrusel.tsx` (state at line ~67-77, section at ~171-206, signature at ~218-241)
- Test: `tests/unit/puerta-2-carrusel.test.tsx`

- [ ] **Step 1: Write the failing test** (add to the describe; wrap with the same fake clock as Task 6 inside the test)

```tsx
  it("schedules at another day and time, and the LinkedIn line follows it", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-28T11:45:00Z"))
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, linkedinExpiraEn: "2026-11-30T12:00:00.000Z" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-12-01" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:15" } })

    expect(screen.getByText("martes 1 de diciembre · 10:15")).toBeInTheDocument()
    expect(
      screen.getByText("Tu conexión con LinkedIn vence antes de esa fecha: te lo dejo para subir a mano."),
    ).toBeInTheDocument()
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/puerta-2-carrusel.test.tsx`

- [ ] **Step 3: Implement.** Replace `const [fecha, setFecha] = useState(...)`, `const [cambiandoFecha, setCambiandoFecha] = ...` and `const fechaElegida = datos.fechas.find(...)` with

```ts
  const eleccionDeFecha = useEleccionDeFecha({ fechas: datos.fechas, zona: datos.zona, horaDelRitmo: datos.horaDelRitmo })
  const fechaElegida = eleccionDeFecha.fecha
```

Replace the whole body of `<Seccion titulo={TEXTO_CUANDO_SALE} id="fecha">` with

```tsx
        <ElegirFecha
          eleccion={eleccionDeFecha}
          meta="LinkedIn · hora de Chile"
          debajo={(iso) => lineaDeLinkedin(datos.linkedinExpiraEn, iso)}
        />
```

In the signature: `alFirmar={() => { if (fechaElegida) firma.ejecutar(() => aprobarCarruselAccion(datos.id, datos.version, datos.carruselId, fechaElegida.iso), redibujar) }}`. Remove now-unused imports (`Eleccion`, `useState` if unused). Import `ElegirFecha, useEleccionDeFecha` from `"../../elegir-fecha"`.

- [ ] **Step 4: Run** — `pnpm test:run tests/unit/puerta-2-carrusel.test.tsx` → PASS; `pnpm type` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "Let carousel gate 2 schedule at another day and time"`

---

### Task 8: Reel gate 2 uses it

**Files:**
- Modify: `app/(app)/video/[id]/pantalla-video.tsx` (state ~81-102, section ~213-248, signature call that sends `fecha`)
- Test: `tests/unit/pantalla-video.test.tsx`

- [ ] **Step 1: Write the failing test** (in `tests/unit/pantalla-video.test.tsx`, using its datos fixture, here `DATOS`)

```tsx
  it("offers another day and time under the schedule slots", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-28T11:45:00Z"))
    render(<PantallaVideo datos={DATOS} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-28" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:15" } })

    expect(screen.getByText("miércoles 28 de octubre · 10:15")).toBeInTheDocument()
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/pantalla-video.test.tsx`

- [ ] **Step 3: Implement.** Same swap as Task 7: `useEleccionDeFecha({ fechas: datos.fechas, zona: datos.zona, horaDelRitmo: datos.horaDelRitmo })`, `const fechaElegida = eleccionDeFecha.fecha`, `hayFecha: fechaElegida !== null` in `faltaParaFirmarVideo`, and the section body becomes

```tsx
        <ElegirFecha eleccion={eleccionDeFecha} meta={`${nombreDeDestinos(destinos)} · hora de Chile`} />
```

The approve call sends `fechaElegida.iso` (guarded by `if (fechaElegida)`). Remove the old `fecha`/`cambiandoFecha` state and unused imports.

- [ ] **Step 4: Run** — `pnpm test:run tests/unit` → PASS; `pnpm type` → PASS; `pnpm lint` → clean.

- [ ] **Step 5: Commit** — `git commit -m "Let reel gate 2 schedule at another day and time"`

---

### Task 9: End to end and visual

**Files:**
- Modify: `tests/e2e/carrusel.spec.ts`, `tests/e2e/video.spec.ts`, `tests/e2e/visual.spec.ts`

- [ ] **Step 1: Fix the radio count.** In `tests/e2e/video.spec.ts`, the test "she watches the whole video, ..." expects `page.getByRole("radio")` to have count 4: the fieldset now has 5 (4 slots plus "Otra fecha y hora"). Change it to `page.getByRole("group", { name: "Elige cuándo sale" }).getByRole("radio")` with count 5, keep `.nth(1)`. Check the other gate 2 tests in that file (lines ~187-260) for radio counts or "No hay un horario libre" and update them the same way.

- [ ] **Step 2: Add the carousel e2e** (in `tests/e2e/carrusel.spec.ts`; `sembrarCarruselDeEscena` already gives a carousel at gate 2)

```ts
test("gate 2 schedules a carousel at another day and time", async ({ page }) => {
  await simularMedios(page)
  const id = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${id}`)
  for (let i = 1; i < 6; i += 1) await page.getByRole("button", { name: "Lámina siguiente" }).click()

  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(manana)
  await page.getByRole("button", { name: "Cambiar" }).click()
  await page.getByRole("radio", { name: "Otra fecha y hora" }).check()
  await page.getByLabel("Día").fill(dia)
  await page.getByLabel("Hora").fill("10:15")
  await expect(page.getByText(/ · 10:15$/).first()).toBeVisible()

  const programar = page.getByRole("slider", { name: "Desliza para programar" })
  await programar.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(/^Programado para el .* · 10:15/)).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("programado")
  expect(new Date(fila.puerta2_publicar_en).getUTCMinutes()).toBe(15)
})
```

(`en-CA` formats as `AAAA-MM-DD`.) If the scheduled screen's text differs, copy the assertion used by "a scheduled carousel says it posts by itself ..." in the same file.

- [ ] **Step 3: Add the reel e2e** in `tests/e2e/video.spec.ts`, after the first test, reusing its helpers (`videoPorAprobar`, `simularMedios`, `ETIQUETA`): play to the end as that test does, tick "Revisé labios", then pick "Otra fecha y hora" exactly as Step 2, slide, and assert `Programado para el` with `10:15` and `getUTCMinutes() === 15`.

- [ ] **Step 4: Visual case** in `tests/e2e/visual.spec.ts`, after "carrusel puerta 2":

```ts
test("carrusel puerta 2 otra fecha", async ({ page }) => {
  await sembrarEscena()
  await simularMedios(page)
  const id = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Cambiar" }).click()
  await page.getByRole("radio", { name: "Otra fecha y hora" }).check()
  await capturaDe(page, "carrusel-puerta-2-otra-fecha")
})
```

The date row stays empty ("Elegir") and the time row shows the schedule hour, so the capture does not depend on the clock. Masked dates (`data-snapshot="varia"`) are handled by `capturaDe` as for the other gate 2 captures.

- [ ] **Step 5: Run** — `pnpm test:e2e tests/e2e/carrusel.spec.ts tests/e2e/video.spec.ts` → PASS (the known flakies `linkedin.spec.ts:63` and `inicio.spec.ts:99` are pre-existing). Then `pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots -g "otra fecha"` to create the new baseline, and run `pnpm test:e2e tests/e2e/visual.spec.ts` without the flag: every other baseline must still pass untouched. Open the new PNG and check it: radios, the two rows, "hora de Chile", no overflow at 390 px.

- [ ] **Step 6: Commit** — `git commit -m "Cover another day and time end to end and visually"`

---

### Task 10: Docs, full suite and hand-off

- [ ] **Step 1: Docs.** `docs/PRODUCT.md`, where gate 2's date is described: add "Además de los horarios de su ritmo, puede elegir otra fecha y hora (hora de Chile, en bloques de 5 minutos, con al menos 15 minutos de anticipación)." `docs/TRASPASO.md`: one bullet "**Fecha y hora exacta en la puerta 2** (spec `2026-10-28-conidolly-fecha-y-hora-exacta-design.md`, plan `2026-10-28-fecha-y-hora-exacta.md`, rama `feat/fecha-exacta`, pendiente de deploy): «Otra fecha y hora» en reels y carruseles; regla `horaElegida`; el servidor exige 15 minutos (`exigirAnticipacion`); sin migración ni cambios en Trigger; una fecha que falta ya no bloquea, es «elegir la fecha»."

- [ ] **Step 2: Full gate** — `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build`, then `pnpm test:e2e`. Grep the diff for em dashes in user-facing copy: `git diff main -- app components lib | grep "^+" | grep "—"` → none in strings.

- [ ] **Step 3: Check the client boundary** — every edited `.tsx` that had `"use client"` still has it on line 1; `app/(app)/elegir-fecha.tsx` starts with it. Load `/guion/<id>` and `/video/<id>` locally once (dev server) to confirm no server/client error.

- [ ] **Step 4: Commit** — `git commit -m "Document the exact date and time at gate 2"`

- [ ] **Step 5: Final review** by a reviewer subagent over `git diff main...feat/fecha-exacta`, then merge `--no-ff` into main locally when Federico says so. Deploy is Vercel only (clean `git archive main`), run by Federico. Then the part 3 smoke: a carousel 15 to 20 minutes ahead, watched in Trigger.dev.
