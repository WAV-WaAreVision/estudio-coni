# Plan 1: Base and domain core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A green, lint-clean `estudio-coni` repo whose pure domain core (subtitle alignment ported byte-for-byte from `coni.py`, the HeyGen request builder, the piece state machine and the two human gates) is fully covered by tests.

**Architecture:** Everything in this plan is pure TypeScript with no I/O: `lib/dominio/` holds rules (estimations, subtitle alignment, states, gates) and `lib/proveedores/` holds provider-shaped helpers (HeyGen request body, HeyGen error parsing). Later plans wire these into Supabase (T3), Trigger.dev tasks (T6–T10) and the UI (T11, D-T2–D-T6). The source of truth for decisions is `~/Projects/coni-heygen/docs/designs/plataforma-coni.md` (approved design doc; its "Cambios aceptados" section wins where it contradicts the body).

**Tech Stack:** Next.js 16, TypeScript strict, Vitest 4, Biome 2, pnpm 12, Node 24.

**Scope of this plan (from the design doc's task list):** T1 (local part only: no cloud accounts), T2 (port of `coni.py`: 29 behaviour cases + 2 real-reel goldens), T4 (state machine, gate hashes, idempotency keys). Later plans: Plan 2 database (T3, T14, T17), Plan 3 production tasks (T5–T7), Plan 4 publishing and maintenance (T8–T10), Plan 5 UI (T11, D-T2–D-T6, T12, T13), Plan 6 metrics and migration (T15, T16, T18).

**Conventions:**
- Domain identifiers stay in Spanish (they mirror the design doc and `coni.py`); prose, comments and commit messages in English.
- Every user-facing string is Chilean Spanish, uses "tú" and never contains an em dash.
- Test names mirror the Python test they port (`<qué hace> cuando <condición>`), so the mapping in `tests/PORT.md` stays obvious.
- Run Biome only in safe mode (`pnpm exec biome check --write`), never `--unsafe` (it has deleted `"use client"` directives before).
- Every "Commit" step starts with `pnpm exec biome check --write <the files of the task>` and `pnpm lint`; fix whatever lint still reports before committing. The code blocks in this plan follow the formatter settings of Task 1 (no semicolons, 120 columns), but Biome has the last word on layout.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/env.ts` | `exigirEnv(nombre, valor)`: fail loudly on a missing env var (replaces `process.env.X!`) |
| `lib/dominio/falla.ts` | `Falla`: error whose message is meant for Coni as-is |
| `lib/dominio/estimaciones.ts` | `palabras`, `estimarSegundos`, `redondearPar` (Python rounding), `mmss`, `pendiente`, `valorDefinido` |
| `lib/dominio/secuencias.ts` | `compararSecuencias`: port of `difflib.SequenceMatcher(None, a, b, autojunk=False)` (`ratio`, `get_opcodes`) |
| `lib/dominio/subtitulos.ts` | `leerSrt`, `alinearConGuion`, `marcaAss`, `assDe` and the Reel safe-zone constants |
| `lib/proveedores/errores.ts` | `mensajeErrorHeygen`: readable reason from a HeyGen error body |
| `lib/proveedores/heygen.ts` | `armarPedido`: HeyGen v3 `POST /v3/videos` body from the production config and the approved script |
| `lib/dominio/estados.ts` | `Pieza`, `Evento`, `transicionar`, `piezaNueva`, errors `TransicionInvalida` and `ArtefactoCambio` |
| `lib/dominio/puertas.ts` | `hashPuerta1`, `hashTexto`, `claveIdempotencia`, `puedeGrabar`, `puedePublicar` |
| `tests/unit/*.test.ts` | One test file per module above |
| `tests/fixtures/goldens/<reel>/` | `guion.txt`, `subtitulos.srt` and the `subtitulos.ass` that `coni.py` produced for the 2 real reels |
| `tests/PORT.md` | Python test → TypeScript test map, plus the cases deferred to later plans |

---

### Task 1: Green baseline

The template fails `pnpm lint` out of the box (non-null assertions, unsorted imports, a `forEach` that returns a value) and ships an animation pack this product does not use (PRODUCT.md: motion is 150–250 ms state feedback, no choreography).

**Files:**
- Create: `lib/env.ts`, `tests/unit/env.test.ts`
- Modify: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/action.ts`, `biome.json`, `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`
- Delete: `lib/animation/`

- [ ] **Step 1: Remove the animation pack**

```bash
cd ~/Projects/estudio-coni
grep -rn -E "gsap|lenis|three|framer-motion|lottie|@react-three" app components lib --include=*.ts --include=*.tsx | grep -v "^lib/animation/"
```
Expected: no output (only `lib/animation/` uses them).

```bash
pnpm remove @gsap/react @react-three/drei @react-three/fiber framer-motion gsap lenis lottie-react three @types/three
rm -r lib/animation
```

- [ ] **Step 2: Write the failing test for `exigirEnv`**

`tests/unit/env.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { exigirEnv } from "@/lib/env"

describe("exigirEnv", () => {
  it("devuelve el valor cuando la variable existe", () => {
    expect(exigirEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321")
  })

  it("falla nombrando la variable cuando falta o está vacía", () => {
    expect(() => exigirEnv("NEXT_PUBLIC_SUPABASE_URL", undefined)).toThrow(
      "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL.",
    )
    expect(() => exigirEnv("NEXT_PUBLIC_SUPABASE_URL", "")).toThrow("NEXT_PUBLIC_SUPABASE_URL")
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm test:run tests/unit/env.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/env"`.

- [ ] **Step 4: Implement `lib/env.ts`**

```ts
// The value is passed in, not read here: Next.js only inlines NEXT_PUBLIC_* variables in client
// bundles when the code spells out `process.env.NEXT_PUBLIC_X` literally.
export function exigirEnv(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}.`)
  }
  return valor
}
```

- [ ] **Step 5: Use it in the Supabase helpers**

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr"
import { exigirEnv } from "@/lib/env"

export function createClient() {
  return createBrowserClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
```

`lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // no-op in Server Components — use action.ts for writes
        },
      },
    },
  )
}
```

`lib/supabase/action.ts`:
```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"

export async function createActionClient() {
  const cookieStore = await cookies()

  return createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    },
  )
}
```

- [ ] **Step 6: Make Biome match the template's style, apply safe fixes, check client directives survived**

The template code has no semicolons but `biome.json` uses the default formatter, which demands them; that mismatch is most of the baseline lint failure. In `biome.json`, replace the `"formatter"` block with:
```json
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "javascript": {
    "formatter": {
      "semicolons": "asNeeded"
    }
  },
```

```bash
grep -rl '"use client"' app components lib 2>/dev/null > /tmp/use-client-antes.txt || true
pnpm exec biome check --write .
grep -rl '"use client"' app components lib 2>/dev/null > /tmp/use-client-despues.txt || true
diff /tmp/use-client-antes.txt /tmp/use-client-despues.txt && echo DIRECTIVES_OK
```
Expected: `DIRECTIVES_OK`.

- [ ] **Step 7: Pin pnpm for CI and add a type check**

The template CI installs pnpm 11, which cannot read a lockfile written by pnpm 12. In `package.json` add (top level, after `"description"`):
```json
  "packageManager": "pnpm@12.6.0",
```
Add a script in `"scripts"`:
```json
    "type": "tsc --noEmit",
```
In `.github/workflows/ci.yml`, in both jobs, replace
```yaml
      - uses: pnpm/action-setup@v4
        with:
          version: 11
```
with
```yaml
      - uses: pnpm/action-setup@v4
```
and in the `build` job add `- run: pnpm type` between `pnpm lint` and `pnpm build`.

- [ ] **Step 8: Project rules in `CLAUDE.md`**

Replace the section that starts at `## Hard rules de este proyecto` and ends right before `## Reference` with:
```markdown
## Hard rules de este proyecto

- **Mapa:** las decisiones viven en `~/Projects/coni-heygen/docs/designs/plataforma-coni.md`
  ("Cambios aceptados" manda sobre el cuerpo), `PRODUCT.md` y `DESIGN.md` del mismo directorio.
  Planes de construcción en `docs/superpowers/plans/`.
- **Capas:** `lib/dominio/` es puro (sin red, sin base, sin reloj implícito: la hora entra como
  parámetro). `lib/proveedores/` habla con HeyGen, ElevenLabs, Anthropic, Meta y R2.
- **Dos puertas humanas:** solo Coni aprueba (guion + voz en la puerta 1; video, texto y fecha en
  la puerta 2). Ninguna tarea con `service_role` escribe aprobaciones. Antes de gastar créditos de
  video o publicar, la tarea compara el artefacto actual con el aprobado (`puedeGrabar`,
  `puedePublicar`).
- **Nunca se publica a una hora no aprobada:** más de 30 min de atraso vuelve a aprobación.
- **Subtítulos:** el port de `coni.py` tiene goldens de 2 reels reales; si cambian, se regeneran
  con `coni.py` y se explica por qué en el commit.
- **Llaves fuera del repo** (`.env*` está ignorado). Fechas en UTC; se muestran en
  `America/Santiago`.
- **Textos para Coni:** español de Chile, tú, sin rayas largas (em dash). Colores y tipos solo desde
  los tokens de `DESIGN.md`.
- **Biome solo en modo seguro** (`biome check --write`); nunca `--unsafe`.
```

- [ ] **Step 9: Verify the whole baseline**

```bash
pnpm test:run && pnpm lint && pnpm type && pnpm build
```
Expected: 2 tests pass; Biome prints no errors; `tsc` exits 0; `next build` finishes with `✓ Compiled successfully`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: green baseline without the animation pack"
```

---

### Task 2: Estimations and `Falla`

Ports `TestEstimaciones` (4 cases) plus one extra case for Python's tie-to-even rounding, which `mmss` and the subtitle timestamps depend on (`round(112.5) == 112` in Python, `Math.round(112.5) === 113` in JavaScript).

**Files:**
- Create: `lib/dominio/falla.ts`, `lib/dominio/estimaciones.ts`, `tests/unit/estimaciones.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/estimaciones.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { estimarSegundos, mmss, pendiente, redondearPar, valorDefinido } from "@/lib/dominio/estimaciones"

describe("estimaciones", () => {
  it("estima sesenta segundos cuando hay ciento cincuenta palabras", () => {
    expect(estimarSegundos("palabra ".repeat(150))).toBeCloseTo(60, 9)
  })

  it("suma una pausa cuando hay una línea en blanco", () => {
    expect(estimarSegundos("uno dos\n\ntres")).toBeCloseTo((3 / 150) * 60 + 0.6, 9)
  })

  it("formatea minutos y segundos cuando pasa del minuto", () => {
    expect(mmss(90)).toBe("1:30")
    expect(mmss(53.4)).toBe("0:53")
  })

  it("redondea los empates al par cuando el valor termina en .5, igual que Python", () => {
    expect(mmss(2.5)).toBe("0:02")
    expect(mmss(3.5)).toBe("0:04")
    expect(redondearPar(112.5)).toBe(112)
    expect(redondearPar(137.5)).toBe(138)
    expect(redondearPar(112.4999)).toBe(112)
  })

  it("marca pendiente cuando el valor falta o dice pendiente", () => {
    for (const valor of [null, undefined, "", "PENDIENTE"]) {
      expect(pendiente(valor)).toBe(true)
    }
    expect(pendiente("look_123")).toBe(false)
    expect(valorDefinido("PENDIENTE")).toBeNull()
    expect(valorDefinido("look_123")).toBe("look_123")
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/estimaciones.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/estimaciones"`.

- [ ] **Step 3: Implement**

`lib/dominio/falla.ts`:
```ts
/** Error whose message is written to be shown to Coni as-is. */
export class Falla extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "Falla"
  }
}
```

`lib/dominio/estimaciones.ts`:
```ts
// Same pace as the script reviewer of the course (curso-heygen.html) and coni.py.
export const PALABRAS_POR_MINUTO = 150
export const PENDIENTE = "PENDIENTE"

/** Python's `str.split()`: split on whitespace runs and drop empty pieces. */
export function palabras(texto: string): string[] {
  return texto.split(/\s+/).filter(Boolean)
}

export function estimarSegundos(texto: string): number {
  const pausas = texto.split("\n\n").length - 1
  return (palabras(texto).length / PALABRAS_POR_MINUTO) * 60 + pausas * 0.6
}

/** Python's `round(x)`: ties go to the even integer. `Math.round` would shift some subtitles by 10 ms. */
export function redondearPar(x: number): number {
  const piso = Math.floor(x)
  const resto = x - piso
  if (resto > 0.5) return piso + 1
  if (resto < 0.5) return piso
  return piso % 2 === 0 ? piso : piso + 1
}

export function mmss(segundos: number): string {
  const s = redondearPar(segundos)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function pendiente(valor: string | null | undefined): boolean {
  return !valor || valor === PENDIENTE
}

/** The value, or null when it is missing or still says PENDIENTE. */
export function valorDefinido(valor: string | null | undefined): string | null {
  return valor && valor !== PENDIENTE ? valor : null
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/estimaciones.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/falla.ts lib/dominio/estimaciones.ts tests/unit/estimaciones.test.ts
git commit -m "feat(dominio): port script estimations with Python rounding"
```

---

### Task 3: HeyGen error messages

Ports `TestErrorHeygen` (3 cases). In the platform HeyGen is called over its v3 HTTP API instead of the CLI, so the input is the response body instead of stderr; the parsing rules are the same.

**Files:**
- Create: `lib/proveedores/errores.ts`, `tests/unit/errores.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/errores.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { mensajeErrorHeygen } from "@/lib/proveedores/errores"

describe("mensajeErrorHeygen", () => {
  it("une mensaje y pista cuando el cuerpo es JSON", () => {
    const cuerpo = JSON.stringify({ error: { message: "Sin créditos", hint: "Recarga en HeyGen" } })
    expect(mensajeErrorHeygen(cuerpo)).toBe("Sin créditos · Recarga en HeyGen")
  })

  it("devuelve el texto tal cual cuando el cuerpo no es JSON", () => {
    expect(mensajeErrorHeygen("command not found")).toBe("command not found")
  })

  it("dice sin detalle cuando el cuerpo viene vacío", () => {
    expect(mensajeErrorHeygen("")).toBe("sin detalle")
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/errores.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/proveedores/errores"`.

- [ ] **Step 3: Implement**

`lib/proveedores/errores.ts`:
```ts
/** Readable reason from a HeyGen error body `{"error": {"message", "hint"}}`; same rules as coni.py. */
export function mensajeErrorHeygen(cuerpo: string): string {
  let datos: unknown
  try {
    datos = JSON.parse(cuerpo)
  } catch {
    // Not JSON (a proxy page, a plain-text error): the raw text is the best explanation we have.
    return cuerpo || "sin detalle"
  }
  const error = typeof datos === "object" && datos !== null ? (datos as { error?: unknown }).error : undefined
  if (typeof error !== "object" || error === null) {
    return cuerpo || "sin detalle"
  }
  const { message, hint } = error as { message?: unknown; hint?: unknown }
  return [message, hint].filter((parte): parte is string => typeof parte === "string" && parte !== "").join(" · ")
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/errores.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/errores.ts tests/unit/errores.test.ts
git commit -m "feat(proveedores): port HeyGen error parsing"
```

---

### Task 4: Sequence matcher (port of `difflib.SequenceMatcher`)

`alinear_con_guion` in `coni.py` relies on `difflib.SequenceMatcher(None, a, b, autojunk=False)`. The expected values below were produced by Python 3 on 2026-10-01; they are the ground truth.

**Files:**
- Create: `lib/dominio/secuencias.ts`, `tests/unit/secuencias.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/secuencias.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { compararSecuencias, type Opcode } from "@/lib/dominio/secuencias"

// Produced by Python 3: difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() / .get_opcodes()
const CASOS: { a: string[]; b: string[]; ratio: number; opcodes: Opcode[] }[] = [
  {
    a: ["hola", "hola", "a", "todas"],
    b: ["hola", "a", "todas"],
    ratio: 0.8571428571428571,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 4, 0, 3],
    ],
  },
  {
    a: ["te", "cuesta", "sentirte", "la", "es", "súper", "común", "dudar", "de", "soy", "coni", "del", "rosario"],
    b: ["te", "cuesta", "sentirte", "la", "es", "supercomún", "dudar", "de", "soy", "connie", "del", "rosario"],
    ratio: 0.8,
    opcodes: [
      ["equal", 0, 5, 0, 5],
      ["replace", 5, 7, 5, 6],
      ["equal", 7, 10, 6, 9],
      ["replace", 10, 11, 9, 10],
      ["equal", 11, 13, 10, 12],
    ],
  },
  { a: ["a", "b", "c"], b: ["x", "y"], ratio: 0, opcodes: [["replace", 0, 3, 0, 2]] },
  {
    a: ["a", "b", "a", "b", "c"],
    b: ["b", "a", "b", "c", "a"],
    ratio: 0.8,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 5, 0, 4],
      ["insert", 5, 5, 4, 5],
    ],
  },
  { a: [], b: ["a"], ratio: 0, opcodes: [["insert", 0, 0, 0, 1]] },
  { a: [], b: [], ratio: 1, opcodes: [] },
]

describe("compararSecuencias", () => {
  it.each(CASOS)("da el mismo ratio y las mismas operaciones que difflib cuando a=$a y b=$b", ({ a, b, ratio, opcodes }) => {
    const resultado = compararSecuencias(a, b)
    expect(resultado.ratio).toBe(ratio)
    expect(resultado.opcodes).toEqual(opcodes)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/secuencias.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/secuencias"`.

- [ ] **Step 3: Implement**

`lib/dominio/secuencias.ts`:
```ts
// Port of Python's difflib.SequenceMatcher(None, a, b, autojunk=False): no junk and no "popular"
// elements. coni.py aligns subtitles with it, so ratio() and get_opcodes() must match exactly,
// including how ties between equally long matches are broken.

export type Etiqueta = "equal" | "replace" | "delete" | "insert"
export type Opcode = [Etiqueta, number, number, number, number]
type Bloque = [number, number, number]
type Tramo = [number, number, number, number]

export function compararSecuencias(
  a: readonly string[],
  b: readonly string[],
): { ratio: number; opcodes: Opcode[] } {
  const bloques = bloquesIguales(a, b)
  const iguales = bloques.reduce((suma, bloque) => suma + bloque[2], 0)
  const total = a.length + b.length
  return { ratio: total ? (2 * iguales) / total : 1, opcodes: opcodesDe(bloques) }
}

function indicesEnB(b: readonly string[]): Map<string, number[]> {
  const indices = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const lista = indices.get(b[j])
    if (lista) {
      lista.push(j)
    } else {
      indices.set(b[j], [j])
    }
  }
  return indices
}

function coincidenciaMasLarga(
  a: readonly string[],
  b: readonly string[],
  indices: Map<string, number[]>,
  [alo, ahi, blo, bhi]: Tramo,
): Bloque {
  let mejorI = alo
  let mejorJ = blo
  let mejorK = 0
  let largoEn = new Map<number, number>()
  for (let i = alo; i < ahi; i++) {
    const nuevo = new Map<number, number>()
    for (const j of indices.get(a[i]) ?? []) {
      if (j < blo) continue
      if (j >= bhi) break
      const k = (largoEn.get(j - 1) ?? 0) + 1
      nuevo.set(j, k)
      if (k > mejorK) {
        mejorI = i - k + 1
        mejorJ = j - k + 1
        mejorK = k
      }
    }
    largoEn = nuevo
  }
  // difflib extends the match over equal neighbours afterwards. Without junk these loops never move
  // anything, but they are kept so the port reads line-for-line against the Python source.
  while (mejorI > alo && mejorJ > blo && a[mejorI - 1] === b[mejorJ - 1]) {
    mejorI--
    mejorJ--
    mejorK++
  }
  while (mejorI + mejorK < ahi && mejorJ + mejorK < bhi && a[mejorI + mejorK] === b[mejorJ + mejorK]) {
    mejorK++
  }
  return [mejorI, mejorJ, mejorK]
}

function bloquesIguales(a: readonly string[], b: readonly string[]): Bloque[] {
  const indices = indicesEnB(b)
  const cola: Tramo[] = [[0, a.length, 0, b.length]]
  const bloques: Bloque[] = []
  for (let tramo = cola.pop(); tramo; tramo = cola.pop()) {
    const [alo, ahi, blo, bhi] = tramo
    const [i, j, k] = coincidenciaMasLarga(a, b, indices, tramo)
    if (k) {
      bloques.push([i, j, k])
      if (alo < i && blo < j) cola.push([alo, i, blo, j])
      if (i + k < ahi && j + k < bhi) cola.push([i + k, ahi, j + k, bhi])
    }
  }
  bloques.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])

  const unidos: Bloque[] = []
  let [i1, j1, k1] = [0, 0, 0]
  for (const [i2, j2, k2] of bloques) {
    if (i1 + k1 === i2 && j1 + k1 === j2) {
      k1 += k2
    } else {
      if (k1) unidos.push([i1, j1, k1])
      ;[i1, j1, k1] = [i2, j2, k2]
    }
  }
  if (k1) unidos.push([i1, j1, k1])
  unidos.push([a.length, b.length, 0])
  return unidos
}

function opcodesDe(bloques: Bloque[]): Opcode[] {
  const opcodes: Opcode[] = []
  let i = 0
  let j = 0
  for (const [ai, bj, k] of bloques) {
    let etiqueta: Etiqueta | null = null
    if (i < ai && j < bj) {
      etiqueta = "replace"
    } else if (i < ai) {
      etiqueta = "delete"
    } else if (j < bj) {
      etiqueta = "insert"
    }
    if (etiqueta) opcodes.push([etiqueta, i, ai, j, bj])
    i = ai + k
    j = bj + k
    if (k) opcodes.push(["equal", ai, i, bj, j])
  }
  return opcodes
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/secuencias.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/secuencias.ts tests/unit/secuencias.test.ts
git commit -m "feat(dominio): port difflib SequenceMatcher for subtitle alignment"
```

---

### Task 5: Subtitles (`leerSrt`, `alinearConGuion`, `assDe`)

Ports `TestSubtitulosTexto` (5 cases) plus 1 case for tie rounding in timestamps. Intentional difference from `coni.py`: the font is **Montserrat** (accepted change Q3; Avenir Next only exists on macOS and the render runs in the Trigger.dev container).

**Files:**
- Create: `lib/dominio/subtitulos.ts`, `tests/unit/subtitulos.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/subtitulos.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { alinearConGuion, assDe, leerSrt, marcaAss } from "@/lib/dominio/subtitulos"

const SRT_HEYGEN =
  "﻿1\r\n00:00:00,100 --> 00:00:01,020\r\n¿Te cuesta sentirte la\r\n\r\n" +
  "2\r\n00:00:03,500 --> 00:00:05,120\r\nEs supercomún dudar de\r\n\r\n" +
  "3\r\n00:00:44,720 --> 00:00:45,920\r\nSoy Connie del\r\nRosario.\r\n"
const GUION = "¿Te cuesta sentirte la\n\nEs súper común dudar de\n\nSoy Coni del Rosario."

describe("subtítulos", () => {
  it("lee tiempos y texto cuando el srt trae bom y crlf", () => {
    expect(leerSrt(SRT_HEYGEN)).toEqual([
      [0.1, 1.02, "¿Te cuesta sentirte la"],
      [3.5, 5.12, "Es supercomún dudar de"],
      [44.72, 45.92, "Soy Connie del Rosario."],
    ])
  })

  it("usa las palabras del guion cuando la transcripción difiere", () => {
    const cues = alinearConGuion(leerSrt(SRT_HEYGEN), GUION)
    expect(cues.map(([, , texto]) => texto)).toEqual([
      "¿Te cuesta sentirte la",
      "Es súper común dudar de",
      "Soy Coni del Rosario.",
    ])
    expect(cues.map(([inicio, fin]) => [inicio, fin])).toEqual([
      [0.1, 1.02],
      [3.5, 5.12],
      [44.72, 45.92],
    ])
  })

  it("mantiene el orden cuando el guion tiene una palabra que no se transcribió", () => {
    const srt = [
      [0, 1, "hola a"],
      [1, 2, "todas"],
    ] as const
    expect(alinearConGuion(srt, "Hola, hola a todas.")).toEqual([
      [0, 1, "Hola, hola a"],
      [1, 2, "todas."],
    ])
  })

  it("falla cuando el srt no corresponde al guion", () => {
    const srt = [[0, 2, "un texto que no tiene nada que ver"]] as const
    expect(() => alinearConGuion(srt, GUION)).toThrow(Falla)
    expect(() => alinearConGuion(srt, GUION)).toThrow("no calza con el guion")
  })

  it("arma el ass centrado en la zona segura con la fuente de coni", () => {
    const ass = assDe([
      [0.1, 1.02, "¿Te cuesta"],
      [61.5, 62.25, "Soy Coni."],
    ])
    expect(ass).toContain("PlayResX: 1080\nPlayResY: 1920")
    expect(ass).toContain("Style: Coni,Montserrat,84,")
    expect(ass).toContain("Dialogue: 0,0:00:00.10,0:00:01.02,Coni,,0,0,0,,{\\an5\\pos(540,1344)}¿Te cuesta")
    expect(ass).toContain("Dialogue: 0,0:01:01.50,0:01:02.25,Coni,,0,0,0,,{\\an5\\pos(540,1344)}Soy Coni.")
  })

  it("redondea los centésimos al par cuando el tiempo cae justo en la mitad, igual que Python", () => {
    expect(marcaAss(1.125)).toBe("0:00:01.12")
    expect(marcaAss(1.375)).toBe("0:00:01.38")
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/subtitulos.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/subtitulos"`.

- [ ] **Step 3: Implement**

`lib/dominio/subtitulos.ts`:
```ts
import { palabras, redondearPar } from "@/lib/dominio/estimaciones"
import { Falla } from "@/lib/dominio/falla"
import { compararSecuencias } from "@/lib/dominio/secuencias"

/** [start, end, phrase], times in seconds. */
export type Cue = readonly [inicio: number, fin: number, frase: string]

// Safe zone of a 1080x1920 Reel: Instagram covers the bottom ~20% and the right button column.
// The subtitle sits centred at 70% of the height, with 800 px of usable width.
export const ANCHO_REEL = 1080
export const ALTO_REEL = 1920
export const CENTRO_SUBTITULO = [540, 1344] as const
export const MARGEN_LATERAL_SUBTITULO = 140
// coni.py used Avenir Next, which only exists on macOS; the render container ships Montserrat.
export const FUENTE_SUBTITULO = "Montserrat"

// Python's str.splitlines() also breaks on \r and the Unicode line separators.
const SALTO_DE_LINEA = /\r\n|[\n\r  ]/

function segundos(marca: string): number {
  const [h, m, s] = marca.trim().replaceAll(",", ".").split(":")
  const total = Number.parseInt(h, 10) * 3600 + Number.parseInt(m, 10) * 60 + Number.parseFloat(s)
  return Math.round(total * 1000) / 1000
}

export function leerSrt(texto: string): Cue[] {
  const cues: Cue[] = []
  const limpio = texto.replace(/^﻿+/, "").replaceAll("\r\n", "\n").trim()
  for (const bloque of limpio.split(/\n\s*\n/)) {
    const lineas = bloque.split(SALTO_DE_LINEA)
    const i = lineas.findIndex((linea) => linea.includes("-->"))
    if (i === -1) continue
    const [inicio, fin] = lineas[i].split("-->")
    const frase = lineas
      .slice(i + 1)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .join(" ")
    if (frase) cues.push([segundos(inicio), segundos(fin), frase])
  }
  return cues
}

// Python's re.sub(r"[^\w]", "", palabra.lower()): keep Unicode letters, digits and underscore.
function comparable(palabra: string): string {
  return palabra.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "")
}

/**
 * Phrases with the approved script's words and the SRT's timing. HeyGen transcribes the audio and
 * gets names wrong ("Connie" for "Coni"): each script word goes to the SRT phrase it aligns with,
 * and words HeyGen did not transcribe go to the neighbouring phrase.
 */
export function alinearConGuion(cues: readonly Cue[], guion: string): Cue[] {
  const delSrt = cues.flatMap(([, , frase], n) => palabras(frase).map((palabra) => [n, palabra] as const))
  const delGuion = palabras(guion)
  const { ratio, opcodes } = compararSecuencias(
    delGuion.map(comparable),
    delSrt.map(([, palabra]) => comparable(palabra)),
  )
  if (ratio < 0.8) {
    throw new Falla("El SRT de HeyGen no calza con el guion. ¿Cambió el guion después del render?")
  }

  const fraseDe: (number | null)[] = delGuion.map(() => null)
  for (const [op, g1, g2, s1, s2] of opcodes) {
    if (op !== "equal" && op !== "replace") continue
    for (let k = 0; k < g2 - g1; k++) {
      fraseDe[g1 + k] = delSrt[s1 + Math.floor((k * (s2 - s1)) / (g2 - g1))][0]
    }
  }
  for (let k = 1; k < fraseDe.length; k++) {
    fraseDe[k] ??= fraseDe[k - 1]
  }
  for (let k = fraseDe.length - 2; k >= 0; k--) {
    fraseDe[k] ??= fraseDe[k + 1]
  }

  const porFrase = new Map<number, string[]>()
  for (let k = 0; k < delGuion.length; k++) {
    const n = fraseDe[k]
    if (n === null) continue
    const lista = porFrase.get(n)
    if (lista) {
      lista.push(delGuion[k])
    } else {
      porFrase.set(n, [delGuion[k]])
    }
  }
  return cues.flatMap(([inicio, fin], n): Cue[] => {
    const lista = porFrase.get(n)
    return lista ? [[inicio, fin, lista.join(" ")]] : []
  })
}

export function marcaAss(segundos: number): string {
  const cs = redondearPar(segundos * 100)
  const dos = (x: number) => String(x).padStart(2, "0")
  return `${Math.floor(cs / 360000)}:${dos(Math.floor(cs / 6000) % 60)}:${dos(Math.floor(cs / 100) % 60)}.${dos(cs % 100)}`
}

/** ASS subtitles for a Reel: bold white text with an outline, centred in the safe zone. */
export function assDe(cues: readonly Cue[]): string {
  const [x, y] = CENTRO_SUBTITULO
  const m = MARGEN_LATERAL_SUBTITULO
  const encabezado = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${ANCHO_REEL}`,
    `PlayResY: ${ALTO_REEL}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Coni,${FUENTE_SUBTITULO},84,&H00FFFFFF,&H00FFFFFF,&H14000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,5,${m},${m},0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ]
  const dialogos = cues.map(
    ([inicio, fin, frase]) =>
      `Dialogue: 0,${marcaAss(inicio)},${marcaAss(fin)},Coni,,0,0,0,,{\\an5\\pos(${x},${y})}${frase}`,
  )
  return `${encabezado.join("\n")}\n${dialogos.join("\n")}\n`
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/subtitulos.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/subtitulos.ts tests/unit/subtitulos.test.ts
git commit -m "feat(dominio): port subtitle alignment and ASS generation"
```

---

### Task 6: Goldens from the two real reels

`coni.py` produced `subtitulos.ass` for the two published reels; on 2026-10-01 regenerating them from `guion.txt` + `subtitulos.srt` gave identical files (31 and 34 cues). The port must produce the same bytes except the `Style:` line (font).

**Files:**
- Create: `tests/fixtures/goldens/2026-09-25-taller-propia-diosa/{guion.txt,subtitulos.srt,subtitulos.ass}`, `tests/fixtures/goldens/2026-09-30-deseo-se-esconde/{guion.txt,subtitulos.srt,subtitulos.ass}`, `tests/fixtures/goldens/README.md`, `tests/unit/subtitulos-goldens.test.ts`

- [ ] **Step 1: Copy the fixtures from `coni-heygen`**

```bash
for reel in 2026-09-25-taller-propia-diosa 2026-09-30-deseo-se-esconde; do
  mkdir -p tests/fixtures/goldens/$reel
  cp ~/Projects/coni-heygen/contenido/$reel/{guion.txt,subtitulos.srt,subtitulos.ass} tests/fixtures/goldens/$reel/
done
```

`tests/fixtures/goldens/README.md`:
```markdown
# Subtitle goldens

`guion.txt`, `subtitulos.srt` (from HeyGen) and `subtitulos.ass` (from `scripts/coni.py`) of the two
reels published before the platform, copied from `coni-heygen` at commit `4b3ec17`.
`tests/unit/subtitulos-goldens.test.ts` requires the TypeScript port to produce the same `.ass`
except the `Style:` line (Montserrat instead of Avenir Next).

To regenerate after an intentional format change, run in `coni-heygen`:

    python3 scripts/coni.py subtitulos contenido/<reel>

and copy the new `subtitulos.ass` here, explaining the change in the commit message.
```

- [ ] **Step 2: Write the golden test**

`tests/unit/subtitulos-goldens.test.ts`:
```ts
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"

const REELS = ["2026-09-25-taller-propia-diosa", "2026-09-30-deseo-se-esconde"]

function leer(reel: string, archivo: string): string {
  return readFileSync(new URL(`../fixtures/goldens/${reel}/${archivo}`, import.meta.url), "utf-8")
}

function sinFuente(ass: string): string {
  return ass
    .split("\n")
    .filter((linea) => !linea.startsWith("Style: "))
    .join("\n")
}

describe.each(REELS)("golden %s", (reel) => {
  it("genera el mismo ass que coni.py cuando se cambia solo la fuente", () => {
    const cues = alinearConGuion(leerSrt(leer(reel, "subtitulos.srt")), leer(reel, "guion.txt").trim())
    const ass = assDe(cues)
    expect(sinFuente(ass)).toBe(sinFuente(leer(reel, "subtitulos.ass")))
    expect(ass).toContain("Style: Coni,Montserrat,84,")
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm test:run tests/unit/subtitulos-goldens.test.ts`
Expected: 2 passed. If it fails, the diff shows the first differing line: fix the port in `lib/dominio/subtitulos.ts` or `lib/dominio/secuencias.ts`, never the golden.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/goldens tests/unit/subtitulos-goldens.test.ts
git commit -m "test(dominio): pin subtitle output to the two real reels"
```

---

### Task 7: HeyGen request builder

Ports `TestPedido` (17 cases). The config keeps the snake_case shape of `coni.config.json` (`ruta_voz`, `heygen.*`) because it migrates as-is to Ajustes. Intentional differences: the title comes from the piece instead of the folder name; the CLI flag `--audio-asset-id` becomes the `audioAssetId` argument; output text becomes return values (`ruta`, `avisos`).

**Files:**
- Create: `lib/proveedores/heygen.ts`, `tests/unit/pedido.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/pedido.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { armarPedido, type ConfigProduccion } from "@/lib/proveedores/heygen"

const GUION = "¿Peleas siempre por lo mismo?\n\nSoy Coni del Rosario."
const TITULO = "Coni · 2026-09-29-celos"

function config(): ConfigProduccion {
  return {
    ruta_voz: "heygen",
    heygen: {
      avatar_id: "look_123",
      voice_id: "voz_456",
      ajustes_elevenlabs: {
        model: "eleven_multilingual_v2",
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
      velocidad: 1,
      aspect_ratio: "9:16",
      resolution: "1080p",
      motor: null,
      referencia_movimiento: null,
    },
  }
}

function pedido(cfg = config(), extra: { audioAssetId?: string; avatarId?: string; guion?: string | null } = {}) {
  return armarPedido({ config: cfg, guion: GUION, titulo: TITULO, ...extra })
}

describe("armarPedido", () => {
  it("arma el pedido de la ruta a cuando la config está completa", () => {
    const cfg = config()
    const { cuerpo, ruta } = pedido(cfg)
    expect(cuerpo.type).toBe("avatar")
    expect(cuerpo.avatar_id).toBe("look_123")
    expect(cuerpo.voice_id).toBe("voz_456")
    expect(cuerpo.script).toBe(GUION)
    expect(cuerpo.title).toBe(TITULO)
    expect(cuerpo.aspect_ratio).toBe("9:16")
    expect(cuerpo.resolution).toBe("1080p")
    // Only the separate SRT: HeyGen's burned-in captions sit where Instagram covers them.
    expect(cuerpo.caption).toEqual({ file_format: "srt" })
    expect(cuerpo.voice_settings).toEqual({
      engine_settings: { engine_type: "elevenlabs", ...cfg.heygen.ajustes_elevenlabs },
    })
    expect(cuerpo).not.toHaveProperty("engine")
    expect(cuerpo).not.toHaveProperty("audio_asset_id")
    expect(ruta).toBe("A")
  })

  it("usa otro look cuando se indica avatar id", () => {
    expect(pedido(config(), { avatarId: "foto_2" }).cuerpo.avatar_id).toBe("foto_2")
  })

  it("agrega la velocidad cuando no es uno", () => {
    const cfg = config()
    cfg.heygen.velocidad = 1.1
    expect(pedido(cfg).cuerpo.voice_settings?.speed).toBe(1.1)
  })

  it("agrega el motor cuando la config lo define", () => {
    const cfg = config()
    cfg.heygen.motor = "avatar_iv"
    expect(pedido(cfg).cuerpo.engine).toEqual({ type: "avatar_iv" })
  })

  it("fija el gemelo como referencia cuando el motor es avatar_v", () => {
    const cfg = config()
    cfg.heygen.motor = "avatar_v"
    cfg.heygen.referencia_movimiento = "gemelo_1"
    expect(pedido(cfg).cuerpo.engine).toEqual({ type: "avatar_v", reference_look_id: "gemelo_1" })
  })

  it("falla cuando avatar_v no tiene referencia de movimiento", () => {
    // Without a reference, HeyGen may animate the photo with a public look's motion (another person).
    const cfg = config()
    cfg.heygen.motor = "avatar_v"
    expect(() => pedido(cfg)).toThrow(Falla)
    expect(() => pedido(cfg)).toThrow("referencia_movimiento")
  })

  it("falla cuando hay referencia de movimiento sin avatar_v", () => {
    const cfg = config()
    cfg.heygen.referencia_movimiento = "gemelo_1"
    expect(() => pedido(cfg)).toThrow("solo sirve con motor avatar_v")
  })

  it("omite ajustes de voz cuando no vienen de elevenlabs", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = null
    expect(pedido(cfg).cuerpo).not.toHaveProperty("voice_settings")
  })

  it("usa el audio propio cuando hay audio asset id", () => {
    const cfg = config()
    cfg.ruta_voz = "elevenlabs"
    const { cuerpo, ruta } = pedido(cfg, { audioAssetId: "asset_9" })
    expect(cuerpo.audio_asset_id).toBe("asset_9")
    for (const campo of ["script", "voice_id", "voice_settings"]) {
      expect(cuerpo).not.toHaveProperty(campo)
    }
    expect(ruta).toBe("B")
  })

  it("avisa cuando el guion pasa de noventa segundos", () => {
    const { avisos } = pedido(config(), { guion: "palabra ".repeat(240) })
    expect(avisos.join(" ")).toContain("pasa de 90 s")
  })

  it("falla cuando la ruta b no trae audio asset id", () => {
    const cfg = config()
    cfg.ruta_voz = "elevenlabs"
    expect(() => pedido(cfg)).toThrow("audio_asset_id")
  })

  it("falla cuando el avatar sigue pendiente", () => {
    const cfg = config()
    cfg.heygen.avatar_id = "PENDIENTE"
    expect(() => pedido(cfg)).toThrow("avatar_id")
  })

  it("falla cuando la voz sigue pendiente en la ruta a", () => {
    const cfg = config()
    cfg.heygen.voice_id = "PENDIENTE"
    expect(() => pedido(cfg)).toThrow("voice_id")
  })

  it("falla cuando el modelo de elevenlabs no existe", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = { model: "eleven_inventado", stability: 0.5 }
    expect(() => pedido(cfg)).toThrow("Modelo de ElevenLabs no válido")
  })

  it("falla cuando eleven_v3 trae una stability no permitida", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = { model: "eleven_v3", stability: 0.3 }
    expect(() => pedido(cfg)).toThrow("stability")
  })

  it("falla cuando no hay guion", () => {
    expect(() => pedido(config(), { guion: null })).toThrow("Falta")
  })

  it("falla cuando el guion está vacío", () => {
    expect(() => pedido(config(), { guion: "  \n" })).toThrow("vacío")
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/pedido.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/proveedores/heygen"`.

- [ ] **Step 3: Implement**

`lib/proveedores/heygen.ts`:
```ts
import { estimarSegundos, palabras, valorDefinido } from "@/lib/dominio/estimaciones"
import { Falla } from "@/lib/dominio/falla"

export const MODELOS_ELEVEN = new Set(["eleven_multilingual_v2", "eleven_v3", "eleven_turbo_v2_5", "eleven_flash_v2_5"])

export interface AjustesElevenlabs {
  model?: string
  stability?: number | null
  [clave: string]: unknown
}

/** Same shape as the `ruta_voz` and `heygen` keys of coni.config.json, which move to Ajustes. */
export interface ConfigProduccion {
  ruta_voz: "heygen" | "elevenlabs"
  heygen: {
    avatar_id: string | null
    voice_id: string | null
    ajustes_elevenlabs: AjustesElevenlabs | null
    velocidad: number | null
    aspect_ratio: string | null
    resolution: string | null
    motor: string | null
    referencia_movimiento: string | null
  }
}

/** Body of HeyGen v3 `POST /v3/videos`. */
export interface PedidoHeygen {
  type: "avatar"
  avatar_id: string
  title: string
  aspect_ratio: string
  caption: { file_format: "srt" }
  resolution?: string
  engine?: { type: string; reference_look_id?: string }
  audio_asset_id?: string
  script?: string
  voice_id?: string
  voice_settings?: {
    engine_settings?: AjustesElevenlabs & { engine_type: "elevenlabs" }
    speed?: number
  }
}

export interface Pedido {
  cuerpo: PedidoHeygen
  /** A: HeyGen speaks the script with the imported ElevenLabs voice. B: HeyGen lip-syncs our own audio. */
  ruta: "A" | "B"
  palabras: number
  segundos: number
  avisos: string[]
}

function textoDelGuion(guion: string | null): string {
  if (guion === null) {
    throw new Falla("Falta el guion aprobado.")
  }
  const texto = guion.trim()
  if (!texto) {
    throw new Falla("El guion está vacío.")
  }
  return texto
}

export function armarPedido(entrada: {
  config: ConfigProduccion
  guion: string | null
  titulo: string
  audioAssetId?: string
  avatarId?: string
}): Pedido {
  const { config, titulo, audioAssetId, avatarId } = entrada
  const hg = config.heygen
  const texto = textoDelGuion(entrada.guion)

  const avatar = valorDefinido(avatarId || hg.avatar_id)
  if (!avatar) {
    throw new Falla("Falta heygen.avatar_id en la configuración.")
  }
  const cuerpo: PedidoHeygen = {
    type: "avatar",
    avatar_id: avatar,
    title: titulo,
    aspect_ratio: hg.aspect_ratio || "9:16",
    caption: { file_format: "srt" },
  }
  if (hg.resolution) {
    cuerpo.resolution = hg.resolution
  }

  const referencia = valorDefinido(hg.referencia_movimiento)
  if (hg.motor === "avatar_v") {
    if (!referencia) {
      throw new Falla(
        "Con motor avatar_v falta heygen.referencia_movimiento (un digital_twin del grupo). Sin ella, HeyGen puede usar el movimiento de un look público de otra persona.",
      )
    }
    cuerpo.engine = { type: "avatar_v", reference_look_id: referencia }
  } else if (referencia) {
    throw new Falla("heygen.referencia_movimiento solo sirve con motor avatar_v.")
  } else if (hg.motor) {
    cuerpo.engine = { type: hg.motor }
  }

  let ruta: "A" | "B"
  if (audioAssetId) {
    cuerpo.audio_asset_id = audioAssetId
    ruta = "B"
  } else if (config.ruta_voz === "elevenlabs") {
    throw new Falla("La Ruta B necesita el audio de ElevenLabs subido a HeyGen (audio_asset_id).")
  } else {
    const voz = valorDefinido(hg.voice_id)
    if (!voz) {
      throw new Falla("Falta heygen.voice_id en la configuración.")
    }
    cuerpo.script = texto
    cuerpo.voice_id = voz
    const ajustesVoz: NonNullable<PedidoHeygen["voice_settings"]> = {}
    const ajustes = hg.ajustes_elevenlabs
    if (ajustes) {
      if (ajustes.model && !MODELOS_ELEVEN.has(ajustes.model)) {
        throw new Falla(`Modelo de ElevenLabs no válido: ${ajustes.model}`)
      }
      const stability = ajustes.stability
      if (ajustes.model === "eleven_v3" && stability !== undefined && stability !== null && ![0, 0.5, 1].includes(stability)) {
        throw new Falla("Con eleven_v3, stability debe ser 0, 0.5 o 1.")
      }
      ajustesVoz.engine_settings = { engine_type: "elevenlabs", ...ajustes }
    }
    if (hg.velocidad !== null && hg.velocidad !== 1) {
      ajustesVoz.speed = hg.velocidad
    }
    if (Object.keys(ajustesVoz).length > 0) {
      cuerpo.voice_settings = ajustesVoz
    }
    ruta = "A"
  }

  const segundos = estimarSegundos(texto)
  const avisos = segundos > 90 ? ["El guion pasa de 90 s. Para Reels conviene de 30 a 60 s."] : []
  return { cuerpo, ruta, palabras: palabras(texto).length, segundos, avisos }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/pedido.test.ts`
Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/heygen.ts tests/unit/pedido.test.ts
git commit -m "feat(proveedores): port the HeyGen v3 request builder"
```

---

### Task 8: Gate hashes and idempotency keys

Design decision recorded here: **gate 1 hashes the script and the voice audio only**. The design doc's body says gate 1 also covers the caption, but accepted change A11 and finding R2-5 move caption approval to gate 2 so a caption typo never forces a paid re-render. With the caption inside gate 1, a caption fix followed by "Regrabar" would be blocked by `puedeGrabar`. The caption is approved in both gates in the UI; gate 2's `hashTexto` is the one the publish task checks.

**Files:**
- Create: `lib/dominio/puertas.ts`, `tests/unit/puertas.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/puertas.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { claveIdempotencia, hashPuerta1, hashTexto } from "@/lib/dominio/puertas"

describe("hashes de las puertas", () => {
  const base = { guion: "Soy Coni del Rosario.", audioId: "audio_1" }

  it("da el mismo hash cuando el guion y el audio no cambian", () => {
    expect(hashPuerta1(base)).toBe(hashPuerta1({ ...base }))
    expect(hashPuerta1(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cambia el hash de la puerta 1 cuando cambia el guion o el audio", () => {
    expect(hashPuerta1({ ...base, guion: "Soy Coni." })).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, audioId: "audio_2" })).not.toBe(hashPuerta1(base))
  })

  it("no confunde campos cuando un separador aparece dentro del texto", () => {
    expect(hashPuerta1({ guion: "a|b", audioId: "c" })).not.toBe(hashPuerta1({ guion: "a", audioId: "b|c" }))
  })

  it("separa el hash del texto de publicación del hash del guion", () => {
    expect(hashTexto("Soy Coni del Rosario.")).not.toBe(hashPuerta1(base))
    expect(hashTexto("Hola")).not.toBe(hashTexto("Hola."))
  })
})

describe("claveIdempotencia", () => {
  const clave = { piezaId: "pieza_1", paso: "grabar" as const, hash: "a".repeat(64), intento: 0 }

  it("repite la clave cuando es el mismo intento, para que un reintento ciego no cobre dos veces", () => {
    expect(claveIdempotencia(clave)).toBe("pieza_1:grabar:aaaaaaaaaaaaaaaa:0")
    expect(claveIdempotencia({ ...clave })).toBe(claveIdempotencia(clave))
  })

  it("cambia la clave cuando sube el intento o cambia el artefacto", () => {
    expect(claveIdempotencia({ ...clave, intento: 1 })).not.toBe(claveIdempotencia(clave))
    expect(claveIdempotencia({ ...clave, hash: "b".repeat(64) })).not.toBe(claveIdempotencia(clave))
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/puertas.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/puertas"`.

- [ ] **Step 3: Implement**

`lib/dominio/puertas.ts`:
```ts
import { createHash } from "node:crypto"

// A JSON array keeps field boundaries unambiguous ("a|b" + "c" never equals "a" + "b|c").
function sha256(partes: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex")
}

/**
 * Gate 1 binds what costs video credits: the approved script and the exact voice audio. The caption
 * is bound by gate 2 (accepted change A11, finding R2-5), so fixing it never forces a re-render.
 */
export function hashPuerta1(artefacto: { guion: string; audioId: string }): string {
  return sha256(["puerta1", artefacto.guion, artefacto.audioId])
}

export function hashTexto(texto: string): string {
  return sha256(["texto", texto])
}

export type Paso = "producir" | "grabar" | "publicar"

/**
 * Same piece, step, approved artifact and attempt: same key, so a blind retry is deduplicated.
 * Regrabar, retries after an error and date changes bump the attempt (finding R2-1).
 */
export function claveIdempotencia(clave: { piezaId: string; paso: Paso; hash: string; intento: number }): string {
  return `${clave.piezaId}:${clave.paso}:${clave.hash.slice(0, 16)}:${clave.intento}`
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/puertas.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/puertas.ts tests/unit/puertas.test.ts
git commit -m "feat(dominio): gate hashes and idempotency keys"
```

---

### Task 9: Piece state machine

Implements the "Estados y transiciones" table of the design doc without own clips (accepted change D1), plus: caption-only edits (R2-5), discard and date change cancel the scheduled publish (R2-3), retry after a late publish returns to approval (A3, R2-4), `version` + `intento` on every transition (A1). The function is pure: the caller runs the returned `efectos` and persists the new piece in one step; if an effect fails, nothing is persisted.

**Files:**
- Create: `lib/dominio/estados.ts`, `tests/unit/estados.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/estados.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import {
  ArtefactoCambio,
  type Evento,
  type Pieza,
  piezaNueva,
  TransicionInvalida,
  transicionar,
} from "@/lib/dominio/estados"

const HORA = "2026-10-08T22:00:00.000Z" // jueves 8 de octubre, 19:00 en Santiago
const ANTES = "2026-10-06T15:00:00.000Z"

function en(estado: Pieza["estado"], cambios: Partial<Pieza> = {}): Pieza {
  return { ...piezaNueva(), estado, ...cambios }
}

const programada = en("programado", {
  audioId: "audio_1",
  videoId: "video_1",
  puerta1: { hash: "h1", en: ANTES },
  puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES },
})

const aprobarGuion = (cambios: Partial<Extract<Evento, { tipo: "aprobar_guion" }>> = {}): Evento => ({
  tipo: "aprobar_guion",
  actor: "coni",
  hashVisto: "h1",
  hashActual: "h1",
  en: ANTES,
  ...cambios,
})

const aprobarVideo = (cambios: Partial<Extract<Evento, { tipo: "aprobar_video" }>> = {}): Evento => ({
  tipo: "aprobar_video",
  actor: "coni",
  videoVisto: "video_1",
  hashTextoVisto: "t1",
  hashTextoActual: "t1",
  publicarEn: HORA,
  en: ANTES,
  ...cambios,
})

describe("transicionar", () => {
  it("recorre el camino feliz y sube la versión en cada paso", () => {
    const eventos: Evento[] = [
      { tipo: "elegir" },
      { tipo: "guion_listo", audioId: "audio_1" },
      aprobarGuion(),
      { tipo: "render_entregado" },
      { tipo: "video_listo", videoId: "video_1" },
      aprobarVideo(),
      { tipo: "publicado" },
    ]
    let pieza = piezaNueva()
    for (const evento of eventos) {
      pieza = transicionar(pieza, evento).pieza
    }
    expect(pieza.estado).toBe("publicado")
    expect(pieza.version).toBe(eventos.length)
    expect(pieza.puerta1).toEqual({ hash: "h1", en: ANTES })
    expect(pieza.puerta2).toEqual({ videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES })
  })

  it("rechaza un evento cuando no corresponde al estado", () => {
    expect(() => transicionar(piezaNueva(), aprobarGuion())).toThrow(TransicionInvalida)
    expect(() => transicionar(en("video_por_aprobar"), { tipo: "publicado" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("publicado"), { tipo: "descartar" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("en_render"), { tipo: "editar_texto" })).toThrow(TransicionInvalida)
  })

  it("rechaza la aprobación cuando no la hace coni", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ actor: "sistema" }))).toThrow("Solo Coni puede aprobar")
    expect(() => transicionar(pieza, aprobarGuion({ actor: "admin" }))).toThrow("Solo Coni puede aprobar")
    const video = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(video, aprobarVideo({ actor: "sistema" }))).toThrow("Solo Coni puede aprobar")
  })

  it("rechaza la puerta 1 cuando el guion o la voz cambiaron mientras coni revisaba", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ hashActual: "h2" }))).toThrow(ArtefactoCambio)
  })

  it("rechaza la puerta 1 cuando todavía no hay voz", () => {
    expect(() => transicionar(en("guion_por_aprobar"), aprobarGuion())).toThrow(TransicionInvalida)
  })

  it("rechaza la puerta 2 cuando el video, el texto o la hora no sirven", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(pieza, aprobarVideo({ videoVisto: "video_0" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ hashTextoActual: "t2" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ publicarEn: ANTES }))).toThrow("ya pasó")
  })

  it("borra la voz cuando coni pide cambios al guion", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), { tipo: "pedir_cambios" })
    expect(pieza.estado).toBe("guion_en_proceso")
    expect(pieza.audioId).toBeNull()
  })

  it("vuelve a la puerta 1 con la explicación cuando heygen rechaza el contenido", () => {
    const pieza = en("en_render", { audioId: "audio_1", puerta1: { hash: "h1", en: ANTES } })
    const { pieza: nueva } = transicionar(pieza, { tipo: "politica_contenido", explicacion: "HeyGen marcó una frase." })
    expect(nueva.estado).toBe("guion_por_aprobar")
    expect(nueva.puerta1).toBeNull()
    expect(nueva.explicacion).toBe("HeyGen marcó una frase.")
  })

  it("regraba con un intento nuevo cuando coni pide regrabar, sin tocar la puerta 1", () => {
    const pieza = en("video_por_aprobar", { audioId: "audio_1", videoId: "video_1", puerta1: { hash: "h1", en: ANTES } })
    const { pieza: nueva } = transicionar(pieza, { tipo: "regrabar" })
    expect(nueva.estado).toBe("en_render")
    expect(nueva.videoId).toBeNull()
    expect(nueva.intento).toBe(1)
    expect(nueva.puerta1).toEqual({ hash: "h1", en: ANTES })
  })

  it("borra puerta 1, voz y video cuando coni cambia el guion después del video", () => {
    const pieza = en("video_por_aprobar", { audioId: "audio_1", videoId: "video_1", puerta1: { hash: "h1", en: ANTES } })
    const { pieza: nueva } = transicionar(pieza, { tipo: "cambiar_guion" })
    expect(nueva).toMatchObject({ estado: "guion_en_proceso", puerta1: null, audioId: null, videoId: null })
  })

  it("pide revisar el texto sin regrabar cuando coni edita solo el texto de publicación", () => {
    const enGuion = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), { tipo: "editar_texto" })
    expect(enGuion.pieza.estado).toBe("guion_por_aprobar")
    expect(enGuion.efectos).toEqual(["revisar_texto"])

    const enVideo = transicionar(en("video_por_aprobar", { videoId: "video_1", puerta1: { hash: "h1", en: ANTES } }), {
      tipo: "editar_texto",
    })
    expect(enVideo.pieza).toMatchObject({ estado: "video_por_aprobar", videoId: "video_1", puerta2: null })
    expect(enVideo.pieza.puerta1).toEqual({ hash: "h1", en: ANTES })

    const programado = transicionar(programada, { tipo: "editar_texto" })
    expect(programado.pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, videoId: "video_1" })
    expect(programado.efectos).toEqual(["cancelar_publicacion", "revisar_texto"])
  })

  it("cancela la publicación programada cuando coni cambia la fecha", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "cambiar_fecha" })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, intento: 1 })
    expect(efectos).toEqual(["cancelar_publicacion"])
  })

  it("cancela la publicación cuando se descarta una pieza programada", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "descartar" })
    expect(pieza).toMatchObject({ estado: "descartado", puerta1: null, puerta2: null })
    expect(efectos).toEqual(["cancelar_publicacion"])
    expect(transicionar(en("guion_por_aprobar"), { tipo: "descartar" }).efectos).toEqual([])
  })

  it("vuelve al paso donde falló con un intento nuevo cuando coni reintenta un error de producción", () => {
    const fallida = transicionar(en("subtitulando"), { tipo: "falla_produccion", explicacion: "ffmpeg falló" }).pieza
    expect(fallida).toMatchObject({ estado: "error_produccion", estadoAntesDelError: "subtitulando", explicacion: "ffmpeg falló" })
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: ANTES })
    expect(pieza).toMatchObject({ estado: "subtitulando", estadoAntesDelError: null, intento: 1, explicacion: null })
  })

  it("vuelve a programado cuando coni reintenta la publicación dentro de los 30 minutos", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Instagram no respondió" }).pieza
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-08T22:30:00.000Z" })
    expect(pieza).toMatchObject({ estado: "programado", intento: 1 })
    expect(pieza.puerta2?.publicarEn).toBe(HORA)
  })

  it("pide una fecha nueva cuando coni reintenta la publicación con la hora aprobada vencida", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Instagram no respondió" }).pieza
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-08T22:31:00.000Z" })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, intento: 1 })
    expect(pieza.explicacion).toContain("La hora aprobada ya pasó")
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/estados"`.

- [ ] **Step 3: Implement**

`lib/dominio/estados.ts`:
```ts
import { Falla } from "@/lib/dominio/falla"

export const ESTADOS = [
  "idea",
  "guion_en_proceso",
  "guion_por_aprobar",
  "en_render",
  "subtitulando",
  "video_por_aprobar",
  "programado",
  "publicado",
  "error_produccion",
  "error_publicacion",
  "descartado",
] as const
export type Estado = (typeof ESTADOS)[number]
export type Actor = "coni" | "sistema" | "admin"

/** An approved time this late goes back to Coni instead of being published (accepted change A3). */
export const MARGEN_HORA_APROBADA_MS = 30 * 60 * 1000

export interface AprobacionGuion {
  hash: string
  en: string
}

export interface AprobacionVideo {
  videoId: string
  hashTexto: string
  publicarEn: string
  en: string
}

export interface Pieza {
  estado: Estado
  /** Optimistic lock: every transition bumps it; the database update requires the old value. */
  version: number
  /** Part of the idempotency key: Regrabar, retries and date changes bump it (R2-1). */
  intento: number
  estadoAntesDelError: Estado | null
  audioId: string | null
  videoId: string | null
  puerta1: AprobacionGuion | null
  puerta2: AprobacionVideo | null
  explicacion: string | null
}

export type Evento =
  | { tipo: "elegir" }
  | { tipo: "guion_listo"; audioId: string }
  | { tipo: "pedir_cambios" }
  | { tipo: "editar_texto" }
  | { tipo: "aprobar_guion"; actor: Actor; hashVisto: string; hashActual: string; en: string }
  | { tipo: "render_entregado" }
  | { tipo: "politica_contenido"; explicacion: string }
  | { tipo: "falla_produccion"; explicacion: string }
  | { tipo: "video_listo"; videoId: string }
  | {
      tipo: "aprobar_video"
      actor: Actor
      videoVisto: string
      hashTextoVisto: string
      hashTextoActual: string
      publicarEn: string
      en: string
    }
  | { tipo: "regrabar" }
  | { tipo: "cambiar_guion" }
  | { tipo: "cambiar_fecha" }
  | { tipo: "publicado" }
  | { tipo: "falla_publicacion"; explicacion: string }
  | { tipo: "reintentar"; ahora: string }
  | { tipo: "descartar" }

/** Side effects the caller must complete before persisting the transition. */
export type Efecto = "cancelar_publicacion" | "revisar_texto"

export interface Transicion {
  pieza: Pieza
  efectos: Efecto[]
}

export class TransicionInvalida extends Falla {
  constructor(estado: Estado, evento: Evento["tipo"]) {
    super(`No se puede hacer "${evento}" cuando la pieza está en "${estado}".`)
    this.name = "TransicionInvalida"
  }
}

export class ArtefactoCambio extends Falla {
  constructor() {
    super("Lo que aprobaste cambió mientras lo revisabas. Vuelve a revisarlo.")
    this.name = "ArtefactoCambio"
  }
}

export function piezaNueva(): Pieza {
  return {
    estado: "idea",
    version: 0,
    intento: 0,
    estadoAntesDelError: null,
    audioId: null,
    videoId: null,
    puerta1: null,
    puerta2: null,
    explicacion: null,
  }
}

function soloConi(actor: Actor): void {
  if (actor !== "coni") {
    throw new Falla("Solo Coni puede aprobar.")
  }
}

export function transicionar(pieza: Pieza, evento: Evento): Transicion {
  const { estado } = pieza
  const a = (destino: Estado, cambios: Partial<Pieza> = {}, efectos: Efecto[] = []): Transicion => ({
    pieza: { ...pieza, explicacion: null, ...cambios, estado: destino, version: pieza.version + 1 },
    efectos,
  })
  const invalida = () => new TransicionInvalida(estado, evento.tipo)

  switch (evento.tipo) {
    case "elegir":
      if (estado !== "idea") throw invalida()
      return a("guion_en_proceso")

    case "guion_listo":
      if (estado !== "guion_en_proceso") throw invalida()
      return a("guion_por_aprobar", { audioId: evento.audioId })

    case "pedir_cambios":
      if (estado !== "guion_por_aprobar") throw invalida()
      return a("guion_en_proceso", { audioId: null })

    case "editar_texto":
      if (estado === "guion_por_aprobar") return a("guion_por_aprobar", {}, ["revisar_texto"])
      if (estado === "video_por_aprobar") return a("video_por_aprobar", { puerta2: null }, ["revisar_texto"])
      if (estado === "programado") {
        return a("video_por_aprobar", { puerta2: null }, ["cancelar_publicacion", "revisar_texto"])
      }
      throw invalida()

    case "aprobar_guion":
      if (estado !== "guion_por_aprobar" || !pieza.audioId) throw invalida()
      soloConi(evento.actor)
      if (evento.hashVisto !== evento.hashActual) throw new ArtefactoCambio()
      return a("en_render", { puerta1: { hash: evento.hashVisto, en: evento.en } })

    case "render_entregado":
      if (estado !== "en_render") throw invalida()
      return a("subtitulando")

    case "politica_contenido":
      if (estado !== "en_render") throw invalida()
      return a("guion_por_aprobar", { puerta1: null, explicacion: evento.explicacion })

    case "falla_produccion":
      if (estado !== "en_render" && estado !== "subtitulando") throw invalida()
      return a("error_produccion", { estadoAntesDelError: estado, explicacion: evento.explicacion })

    case "video_listo":
      if (estado !== "subtitulando") throw invalida()
      return a("video_por_aprobar", { videoId: evento.videoId })

    case "aprobar_video": {
      if (estado !== "video_por_aprobar") throw invalida()
      soloConi(evento.actor)
      if (evento.videoVisto !== pieza.videoId || evento.hashTextoVisto !== evento.hashTextoActual) {
        throw new ArtefactoCambio()
      }
      if (Date.parse(evento.publicarEn) <= Date.parse(evento.en)) {
        throw new Falla("La fecha de publicación ya pasó. Elige una hora futura.")
      }
      const puerta2 = {
        videoId: evento.videoVisto,
        hashTexto: evento.hashTextoVisto,
        publicarEn: evento.publicarEn,
        en: evento.en,
      }
      return a("programado", { puerta2 })
    }

    case "regrabar":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("en_render", { videoId: null, intento: pieza.intento + 1 })

    case "cambiar_guion":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("guion_en_proceso", { puerta1: null, audioId: null, videoId: null })

    case "cambiar_fecha":
      if (estado !== "programado") throw invalida()
      return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1 }, ["cancelar_publicacion"])

    case "publicado":
      if (estado !== "programado") throw invalida()
      return a("publicado")

    case "falla_publicacion":
      if (estado !== "programado") throw invalida()
      return a("error_publicacion", { estadoAntesDelError: "programado", explicacion: evento.explicacion })

    case "reintentar": {
      const intento = pieza.intento + 1
      if (estado === "error_produccion" && pieza.estadoAntesDelError) {
        return a(pieza.estadoAntesDelError, { estadoAntesDelError: null, intento })
      }
      if (estado === "error_publicacion") {
        const atraso = pieza.puerta2 ? Date.parse(evento.ahora) - Date.parse(pieza.puerta2.publicarEn) : Number.POSITIVE_INFINITY
        if (atraso > MARGEN_HORA_APROBADA_MS) {
          return a("video_por_aprobar", {
            estadoAntesDelError: null,
            puerta2: null,
            intento,
            explicacion: "La hora aprobada ya pasó. Elige una nueva fecha.",
          })
        }
        return a("programado", { estadoAntesDelError: null, intento })
      }
      throw invalida()
    }

    case "descartar":
      if (estado === "publicado" || estado === "descartado") throw invalida()
      return a("descartado", { puerta1: null, puerta2: null }, estado === "programado" ? ["cancelar_publicacion"] : [])
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts tests/unit/estados.test.ts
git commit -m "feat(dominio): piece state machine with versioned transitions"
```

---

### Task 10: Guards before spending and publishing

The render and publish tasks call these right before acting ("Las tareas verifican antes de gastar o publicar"). The service-role write test belongs to Plan 2 (database trigger).

**Files:**
- Modify: `lib/dominio/puertas.ts`
- Modify: `tests/unit/puertas.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/unit/puertas.test.ts` (and add `puedeGrabar, puedePublicar` to the existing import from `@/lib/dominio/puertas`, plus `import { type Pieza, piezaNueva } from "@/lib/dominio/estados"`):
```ts
const HORA = "2026-10-08T22:00:00.000Z"
const APROBADA = "2026-10-06T15:00:00.000Z"

function pieza(cambios: Partial<Pieza>): Pieza {
  return { ...piezaNueva(), ...cambios }
}

describe("puedeGrabar", () => {
  const enRender = pieza({ estado: "en_render", audioId: "audio_1", puerta1: { hash: "h1", en: APROBADA } })

  it("deja grabar cuando lo actual es lo que coni aprobó", () => {
    expect(puedeGrabar(enRender, "h1")).toEqual({ ok: true })
  })

  it("no deja grabar cuando no hay aprobación", () => {
    expect(puedeGrabar({ ...enRender, puerta1: null }, "h1")).toEqual({ ok: false, motivo: "sin_aprobacion" })
  })

  it("no deja grabar cuando el guion o la voz cambiaron después de aprobar", () => {
    expect(puedeGrabar(enRender, "h2")).toEqual({ ok: false, motivo: "artefacto_cambio" })
  })

  it("no deja grabar cuando la pieza no está en render", () => {
    expect(puedeGrabar({ ...enRender, estado: "guion_por_aprobar" }, "h1")).toEqual({ ok: false, motivo: "estado" })
  })
})

describe("puedePublicar", () => {
  const programada = pieza({
    estado: "programado",
    videoId: "video_1",
    puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: APROBADA },
  })
  const actual = (ahora: string, hashTexto = "t1") => ({ ahora, hashTexto })

  it("deja publicar desde la hora aprobada hasta 30 minutos después", () => {
    expect(puedePublicar(programada, actual(HORA))).toEqual({ ok: true })
    expect(puedePublicar(programada, actual("2026-10-08T22:30:00.000Z"))).toEqual({ ok: true })
  })

  it("no publica antes de la hora aprobada", () => {
    expect(puedePublicar(programada, actual("2026-10-08T21:59:00.000Z"))).toEqual({ ok: false, motivo: "antes_de_hora" })
  })

  it("no publica cuando la hora aprobada venció hace más de 30 minutos", () => {
    expect(puedePublicar(programada, actual("2026-10-08T22:30:01.000Z"))).toEqual({ ok: false, motivo: "hora_vencida" })
  })

  it("no publica cuando el texto o el video cambiaron después de aprobar", () => {
    expect(puedePublicar(programada, actual(HORA, "t2"))).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedePublicar({ ...programada, videoId: "video_2" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("no publica cuando la pieza no está programada o no tiene puerta 2", () => {
    expect(puedePublicar({ ...programada, estado: "video_por_aprobar" }, actual(HORA))).toEqual({ ok: false, motivo: "estado" })
    expect(puedePublicar({ ...programada, puerta2: null }, actual(HORA))).toEqual({ ok: false, motivo: "sin_aprobacion" })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run tests/unit/puertas.test.ts`
Expected: FAIL, `puedeGrabar is not a function` (or a missing export error).

- [ ] **Step 3: Implement**

Add to the top of `lib/dominio/puertas.ts`, after the `node:crypto` import:
```ts
import { MARGEN_HORA_APROBADA_MS, type Pieza } from "@/lib/dominio/estados"
```
Append to `lib/dominio/puertas.ts`:
```ts
export type Veredicto =
  | { ok: true }
  | { ok: false; motivo: "estado" | "sin_aprobacion" | "artefacto_cambio" | "antes_de_hora" | "hora_vencida" }

const no = (motivo: Exclude<Veredicto, { ok: true }>["motivo"]): Veredicto => ({ ok: false, motivo })

/** The render task calls this right before spending HeyGen credits. */
export function puedeGrabar(pieza: Pieza, hashActual: string): Veredicto {
  if (pieza.estado !== "en_render") return no("estado")
  if (!pieza.puerta1) return no("sin_aprobacion")
  if (pieza.puerta1.hash !== hashActual) return no("artefacto_cambio")
  return { ok: true }
}

/** The publish task calls this right before publishing; it never publishes at an unapproved time. */
export function puedePublicar(pieza: Pieza, actual: { hashTexto: string; ahora: string }): Veredicto {
  if (pieza.estado !== "programado") return no("estado")
  const aprobacion = pieza.puerta2
  if (!aprobacion) return no("sin_aprobacion")
  if (aprobacion.videoId !== pieza.videoId || aprobacion.hashTexto !== actual.hashTexto) return no("artefacto_cambio")
  const atraso = Date.parse(actual.ahora) - Date.parse(aprobacion.publicarEn)
  if (atraso < 0) return no("antes_de_hora")
  if (atraso > MARGEN_HORA_APROBADA_MS) return no("hora_vencida")
  return { ok: true }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test:run tests/unit/puertas.test.ts`
Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/puertas.ts tests/unit/puertas.test.ts
git commit -m "feat(dominio): guards before rendering and publishing"
```

---

### Task 11: Port map and final verification

**Files:**
- Create: `tests/PORT.md`

- [ ] **Step 1: Write the map**

`tests/PORT.md`:
```markdown
# Port of `coni-heygen/scripts/coni.py`

Design decision D7 (2026-09-30): port the behaviour cases and pin the output of two real reels.

## Ported in Plan 1 (29 cases + 2 goldens)

| Python (`coni-heygen/tests/test_coni.py`) | TypeScript |
|---|---|
| `TestEstimaciones` (4) | `tests/unit/estimaciones.test.ts` (+1 for Python tie rounding) |
| `TestErrorHeygen` (3) | `tests/unit/errores.test.ts` |
| `TestPedido` (17) | `tests/unit/pedido.test.ts` |
| `TestSubtitulosTexto` (5) | `tests/unit/subtitulos.test.ts` (+1 for timestamp tie rounding) |
| — | `tests/unit/secuencias.test.ts` (difflib ground truth) |
| — | `tests/unit/subtitulos-goldens.test.ts` (2 real reels) |

Intentional differences: Montserrat instead of Avenir Next; HeyGen errors come from the HTTP body
instead of CLI stderr; the request builder returns `ruta` and `avisos` instead of printing them.

## Deferred to the plan that owns the I/O

| Python | Goes with | Why |
|---|---|---|
| `TestEsperar` (4) | Plan 3, T7 `grabar-pieza` | Polling becomes a Trigger.dev waitpoint plus reconciliation |
| `TestSubtitulos` (6) | Plan 3, T7 `grabar-pieza` | ffmpeg, fetching the SRT and the size limit run in the container |
| `TestVerificarElevenLabs` (1) | Plan 3, T6 `producir-pieza` | ElevenLabs over HTTP with MSW |

## Not ported (terminal commands)

`TestLeerEnv`, `TestVerificar`, `TestVerificarReferencia`, `TestVerificarFfmpeg`, `TestVoz`, `TestMain`.
```

- [ ] **Step 2: Run everything**

```bash
pnpm test:run && pnpm lint && pnpm type && pnpm build
```
Expected: 72 tests pass (2 env + 5 estimaciones + 3 errores + 6 secuencias + 6 subtítulos + 2 goldens + 17 pedido + 15 puertas + 16 estados), 0 failures; Biome clean; `tsc` exit 0; `next build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add tests/PORT.md
git commit -m "docs(tests): map the coni.py port"
```

---

## Self-review notes

- **Spec coverage:** T1 local scope (Task 1), T2 (Tasks 2–7, 29 cases + 2 goldens; 11 cases explicitly deferred with owner), T4 (Tasks 8–10: transitions table, version/intento, gate hashes, idempotency keys, invalidations, A3, A11, R2-1, R2-3, R2-4, R2-5). Gate test "escritura con rol de servicio" is Plan 2 by design (it is a database trigger).
- **Deviation recorded:** gate 1 hash excludes the caption (Task 8). Update the design doc's "Las puertas, a prueba de errores" in the same PR that merges this plan.
- **Out of this plan:** cloud accounts (Supabase project, Trigger.dev, R2, Resend, Vercel, GitHub remote) need Federico's go-ahead; they are the first steps of Plan 2.
