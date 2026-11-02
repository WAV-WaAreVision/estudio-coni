# Biblioteca with the same style and the same session (change 29a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni opens the Biblioteca (the Ingesta app) from a 4th tab of Conidolly without typing a code, and Ingesta looks like Conidolly (its tokens, Geist and the Soft UI relief on its shared pieces); WAV keeps entering Ingesta with its own code.

**Architecture:** Conidolly's `GET /ir-a-biblioteca` checks that the caller is Coni, mints a one-time Supabase login link for her with the service-role admin API (`generateLink`, which sends no email) and answers a tiny HTML page whose form POSTs the hashed token to Ingesta's `POST /ingreso/puente` and submits itself. Ingesta expires whatever session cookies the browser had, verifies the token with `verifyOtp({ token_hash, type: "email" })` through a server client that writes the new session cookies onto a 303 to `/`, and sends a used or expired token to `/ingreso?puente=vencido`. In the same PR Ingesta swaps its raspberry palette for Conidolly's tokens (class names renamed one to one, so stage 2 copies markup without translating), loads Geist and redraws its five shared pieces in Soft UI.

**Tech Stack:** Next.js 16.2 App Router (route handlers), React 19, TypeScript strict, `@supabase/ssr` 0.10.3, `@supabase/supabase-js` (2.105.4 in estudio-coni, 2.117.2 resolved in conidolly-ingesta), Zod 4, Tailwind v4 (`@theme inline`), `class-variance-authority`, `tailwind-merge` 3, `geist` 1.7, Vitest 4 (jsdom unit, node integration), Playwright 1.59 + `@axe-core/playwright`, Biome 2.2 (safe mode only).

**Spec:** `docs/superpowers/specs/2026-11-02-biblioteca-misma-sesion-design.md` (board: WAV-WaAreVision/estudio-coni#13; sources `docs/pedido-coni-2026-10-31/fichas.md` change 29, `decisiones.md` A6, A14, B11).

---

## Where to work

Two repos, two worktrees, Ingesta first (its PR ships before Conidolly's).

- **Ingesta** (`conidolly-ingesta`): create the worktree once, before Task 1.

  ```bash
  git -C /Users/fede/Projects/conidolly-ingesta fetch origin
  git -C /Users/fede/Projects/conidolly-ingesta worktree add .worktrees/biblioteca-sesion -b feat/biblioteca-sesion origin/main
  cd /Users/fede/Projects/conidolly-ingesta/.worktrees/biblioteca-sesion
  pnpm install --frozen-lockfile
  cp ../../.env.local .env.local   # local Supabase keys only; never print it, never commit it (.env* is ignored)
  ```

  Below, **`INGESTA`** means `/Users/fede/Projects/conidolly-ingesta/.worktrees/biblioteca-sesion`. Read its `CLAUDE.md`.
- **Conidolly** (`estudio-coni`): the worktree already exists with the spec commits on `feat/biblioteca-sesion`.

  ```bash
  cd /Users/fede/Projects/estudio-coni/.worktrees/biblioteca-sesion && pnpm install --frozen-lockfile
  ```

  Below, **`CONIDOLLY`** means `/Users/fede/Projects/estudio-coni/.worktrees/biblioteca-sesion`.
- Local Supabase of estudio-coni must be running (`cd /Users/fede/Projects/estudio-coni && pnpm db:start`): API `127.0.0.1:54421`, database `54422`, Mailpit `54424`. Both apps use it.

## Rules for every task

- TDD strict: the failing test first, run it and see it fail for the reason written, then the minimal code, then green.
- Commit after each task, messages in English, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes only, **never `--unsafe`**) and check line 1 of every edited client file is still `"use client"` (`head -1 <file>`).
- No `any`, no `@ts-expect-error`, no non-null `!`, no silent `catch`. No hex colour outside `app/globals.css` (and the literal OS colours of `lib/diseno/marca.ts`). Copy for people in Spanish of Chile, tú, without em dashes.
- **Never log the token**: no `console.*` receives the token, the HTML of the bridge page or the request body.
- No push, no PR, no Vercel or Supabase hosted action inside Tasks 1 to 21. The release is Task 22.

## Facts fixed before planning

- **B11 (answer): the token is `data.properties.hashed_token` of `auth.admin.generateLink({ type: "magiclink", email })`, and it is verified with `auth.verifyOtp({ token_hash, type: "email" })`. `generateLink` sends no email.** Evidence:
  - Installed types (`node_modules/.pnpm/@supabase+auth-js@2.117.2/.../lib/types.d.ts:739-746, 839-859`): `VerifyTokenHashParams { token_hash: string; type: EmailOtpType }` with `EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'`; `GenerateLinkProperties` carries `action_link`, `email_otp`, `hashed_token`, `redirect_to`, `verification_type`. There is no field called `token_hash` in the response: the spec's name is the form field and the `verifyOtp` parameter; its value is `hashed_token`.
  - Admin API docs in the same package (`GoTrueAdminApi.d.ts:137`) and https://supabase.com/docs/reference/javascript/auth-admin-generatelink: "Generates email links and OTPs to be sent via a custom email provider" (it returns them; it does not send). https://supabase.com/docs/reference/javascript/auth-verifyotp shows `verifyOtp({ token_hash: tokenHash, type: 'email' })` as the token-hash form.
  - Throwaway run on 2026-11-02 against the local stack (GoTrue `v2.197.0`), with supabase-js 2.105.4 (estudio-coni) and 2.117.2 (Ingesta), same results: a temporary confirmed user, `generateLink` magiclink returned `verification_type: "magiclink"` and a 56-character hex `hashed_token`; Mailpit search `to:<user>` counted 0 messages before and 0 after (positive control: `signInWithOtp` to the same kind of user took the count from 0 to 1); `verifyOtp` with `type: "magiclink"` signed in, with `type: "email"` signed in, with `type: "signup"` was refused; the same token a second time gave `403 otp_expired`; a garbage hash gave `403 otp_expired`; minting a newer link invalidated the older one (`403 otp_expired`); the user was deleted. The hosted project was not touched.
  - Decision: `type: "email"` (the documented, non-deprecated form). Pinned by Task 4 (Ingesta) and Task 18 (Conidolly).
- **Cookies are not sent on the bridge POST.** Conidolly and Ingesta are different sites (`vercel.app` is a public suffix), and the Supabase session cookies are `SameSite=Lax`, so the cross-site POST carries none of Ingesta's cookies. `signOut` on the server can only clear what it sees, so the route also expires the session cookie and its chunks by name (`sb-<first label of the Supabase host>-auth-token`, `.0` to `.4`) before writing Coni's. That is what really "replaces whatever session the browser had".
- **Next `<Link>` would mint links.** A `<Link>` to a route handler is prefetched and then fetched again on click, so every render of the tab bar would call `generateLink`. The Biblioteca tab and the "Volver a intentar" button are plain `<a href>` (precedent: `app/(app)/ajustes/cuentas-conectadas.tsx` links to `/api/linkedin/conectar` the same way).
- **E2E cookie jars.** Both apps run on the same machine against the same Supabase, so both name the session cookie `sb-127-auth-token`; cookies ignore ports. The E2E runs Conidolly on `127.0.0.1:3200` and Ingesta on `localhost:3300` so each app has its own jar, as in production.
- Ingesta has no `toHaveScreenshot` baselines; its visual baselines are the PNGs in `docs/capturas/` written by its E2E (`capturar(..., CARPETA_DE_DOCUMENTACION)` in `autores`, `materiales`, `semana`, `subir`, `temas` specs). Conidolly's are `tests/e2e/visual.spec.ts-snapshots/*.png`.
- `tailwind-merge` in Ingesta is the stock one, which reads `text-meta` as a colour and drops it next to `text-apagado` inside `cn()` (it already does so today in the status chip). Conidolly extends it with its scale (`lib/utils.ts`); Ingesta copies that.

## Decisions taken while planning (not in the spec)

- **P1. Failure page is a page of the app, not HTML from the route.** On failure `/ir-a-biblioteca` redirects to `/biblioteca-no-abrio`, a server page inside `app/(app)` (Coni gate, tokens, nav and axe all for free). The route itself never renders anything but the bridge form.
- **P2. Coni's email** comes from the session: `leerSesion()` in `lib/sesion/coni.ts` adds `correo: data.user.email ?? null` to the `coni` state (it already reads the user).
- **P3. Tab order:** the 4th entry goes last (`Inicio · Métricas · Ajustes · Biblioteca`), as the spec says "a 4th entry". The grid goes to `grid-cols-4`.
- **P4. `RUTA_DE_LA_BIBLIOTECA = "/ir-a-biblioteca"`** lives in Conidolly's `lib/sesion/rutas.ts` (the nav is a client component and must not import the bridge module).
- **P5. Ingesta GET `/ingreso/puente`** answers 303 to `/ingreso`. A body that is not a form, a missing or empty `token_hash`, or one longer than 512 characters goes to `/ingreso?puente=vencido` without calling Auth. A verify error other than 403 is logged with status and code only.
- **P6. Token rename map** (Ingesta → Conidolly), applied to every utility prefix (`bg-`, `text-`, `border-`, `outline-`, `accent-`, ... and variants like `focus:`):

  | Ingesta | Conidolly | | Ingesta | Conidolly |
  |---|---|---|---|---|
  | `fondo` | `piedra` | | `error-tinta` | `error` |
  | `superficie` | `piedra-alta` | | `error-fondo` | `piedra-honda` |
  | `hundido` (colour) | `piedra-honda` | | `ok-tinta` | `ok` (new, Ingesta only) |
  | `linea` | `hilo` | | `ok-fondo` | `piedra-honda` |
  | `acento` | `tinta` | | `aviso-tinta` | `aviso` (new, Ingesta only) |
  | `acento-profundo` | `tinta` | | `aviso-fondo` | `piedra-honda` |
  | `acento-suave` | `piedra-honda` | | `text-display` | `text-pantalla` |
  | `acento-claro` | `campo` | | `text-title` | `text-pieza` |
  | `sobre-acento` | `luz` | | `text-label`, `text-body` | `text-cuerpo` |
  | `rounded-sm` | `rounded-casilla` | | `text-nav` | `text-meta` |
  | `rounded-md` | `rounded-bloque` | | `text-script` | `text-guion` |
  | `rounded-lg`, `rounded-xl` | `rounded-panel` | | `font-serif` | (removed: Geist only) |
  | `ease-fuerte` | `ease-salida` | | `shadow-flotante` | (unused, removed) |

  `--ok: #2e5e45` (6.28:1 on piedra, 5.46:1 on piedra-honda) and `--aviso: #7a4a00` (6.27:1, 5.45:1): a dark green and a dark amber muted to sit on the stone, both AA. The raspberry stays only as `--firma` (unused in Ingesta, kept for stage 2).
- **P7. Ingesta takes `tema-cerrado.css`** (closes Tailwind's default palette, radii, shadows and text sizes) like Conidolly. The only default Ingesta uses is `bg-transparent`, re-declared in the `@theme` block.
- **P8. Ingesta drops dead CSS** that referenced the old tokens and that no component uses (`.deslizador`, `.carta-idea`, `body:has([data-superficie="marca"])`, `.aviso`); Task 7 Step 1 proves they are unused before removing them.
- **P9. Conidolly's two-app E2E has its own Playwright config** (`playwright.biblioteca.config.ts`, script `test:e2e:biblioteca`, folder `tests/e2e-biblioteca/`) so `pnpm test:e2e` does not need an Ingesta checkout. It needs `E2E_INGESTA_DIR` pointing at an Ingesta checkout with the bridge.

## File structure

### Ingesta (`INGESTA`)

| File | Responsibility |
|---|---|
| `lib/sesion/rutas.ts` (modify) | `RUTA_DEL_PUENTE`; `decidirRuta` lets it through with or without a session |
| `lib/sesion/puente.ts` (new) | `cruzarPuente(auth, token)`: Zod check, sign out, verify, destination; `claveDeSesion`, `galletasDeLaSesionAnterior`; `TEXTO_PUENTE_VENCIDO`, `DESTINO_DEL_PUENTE_VENCIDO` |
| `app/ingreso/puente/route.ts` (new) | POST: form body, server client that collects cookies, expiry of the old session cookies, 303; GET: 303 to `/ingreso` |
| `app/ingreso/page.tsx`, `app/ingreso/formulario-ingreso.tsx` (modify) | `?puente=vencido` shows the message |
| `components/navegacion-principal.tsx` (modify) | "Volver a Conidolly" for Coni (`CONIDOLLY_URL`); Soft UI segmented control |
| `.env.example` (modify) | `CONIDOLLY_URL` |
| `app/tema-cerrado.css` (new), `app/globals.css` (rewrite), `biome.json` (modify) | Conidolly's tokens |
| `lib/utils.ts` (modify) | `cn` that knows the custom scale |
| every `.ts`/`.tsx` under `app/`, `components/`, `lib/` with old class names (modify) | rename map P6 |
| `app/layout.tsx`, `lib/diseno/marca.ts`, `package.json`, `pnpm-lock.yaml` (modify) | Geist, stone theme colour |
| `components/ui/clases-de-boton.ts`, `components/ui/boton.tsx` (modify) | Soft UI button, same props |
| `components/campo.tsx`, `components/casillas-codigo.tsx` (modify) | sunken fields |
| `app/(app)/tarjeta-de-material.tsx` (modify) | raised card surface |
| Tests (new): `tests/unit/puente.test.ts`, `tests/unit/puente-ruta.test.ts`, `tests/integration/puente.test.ts`, `tests/unit/ingreso-pagina.test.tsx`, `tests/unit/tokens.test.ts`, `tests/unit/utils.test.ts`, `tests/unit/marca.test.ts`, `tests/unit/boton.test.tsx`, `tests/unit/campo.test.tsx`, `tests/e2e/estilo.spec.ts` | |
| Tests (modify): `tests/unit/rutas.test.ts`, `tests/unit/formulario-ingreso.test.tsx`, `tests/unit/navegacion-principal.test.tsx`, `tests/unit/estado-de-material.test.ts`, `tests/unit/casillas-codigo.test.tsx`, `tests/unit/tarjeta-de-material.test.tsx` | |
| `docs/capturas/*.png` | regenerated in their own commit after a person looks |

### Conidolly (`CONIDOLLY`)

| File | Responsibility |
|---|---|
| `lib/sesion/puente.ts` (new) | `abrirPuente({ admin, correo, urlDeIngesta })` → bridge HTML or failure; `paginaDelPuente`; `TEXTO_FALLO_DEL_PUENTE`, `RUTA_DE_FALLO_DEL_PUENTE` |
| `lib/sesion/rutas.ts` (modify) | `RUTA_DE_LA_BIBLIOTECA` |
| `lib/sesion/coni.ts` (modify) | the `coni` session carries `correo` |
| `app/ir-a-biblioteca/route.ts` (new) | GET: session check, service client, bridge page or redirect |
| `app/(app)/biblioteca-no-abrio/page.tsx` (new) | the plain failure page |
| `components/nav-inferior.tsx` (modify) | 4th tab, `grid-cols-4`, plain `<a>` |
| `.env.example` (modify) | `INGESTA_URL` |
| `playwright.config.ts` (modify), `playwright.biblioteca.config.ts` (new), `package.json` (modify) | `iphone` export, `INGESTA_URL` for the app server, two-app run |
| `tests/e2e/entorno.ts`, `tests/e2e/ayudas.ts` (modify) | `URL_DE_INGESTA`; `entrarComo(context, correo, url)` |
| Tests (new): `tests/unit/puente.test.ts`, `tests/unit/ir-a-biblioteca.test.ts`, `tests/unit/biblioteca-no-abrio.test.tsx`, `tests/integration/puente-biblioteca.test.ts`, `tests/e2e-biblioteca/biblioteca.spec.ts` | |
| Tests (modify): `tests/unit/nav-inferior.test.tsx`, `tests/e2e/letra-grande.spec.ts`; `tests/e2e/visual.spec.ts-snapshots/*.png` regenerated in their own commit | |
| `docs/TRASPASO.md` (modify, Task 22) | what shipped |

---

# Part A: Ingesta (`INGESTA`)

### Task 1: `decidirRuta` lets the bridge through

**Files:**
- Modify: `INGESTA/lib/sesion/rutas.ts`
- Test: `INGESTA/tests/unit/rutas.test.ts`

- [ ] **Step 1: Write the failing test.** Append to the `describe` of `tests/unit/rutas.test.ts`:

```ts
  it("lets the bridge from Conidolly through with or without a session, so it can swap the session", () => {
    expect(decidirRuta({ ruta: "/ingreso/puente", haySesion: false })).toBe("seguir")
    expect(decidirRuta({ ruta: "/ingreso/puente", haySesion: true })).toBe("seguir")
    // Only the bridge: the rest of /ingreso still sends someone with a session to Inicio.
    expect(decidirRuta({ ruta: "/ingreso/otra", haySesion: true })).toBe("a_inicio")
  })
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/rutas.test.ts`
Expected: FAIL, `expected 'a_inicio' to be 'seguir'` on the second assertion.

- [ ] **Step 3: Minimal implementation.** Replace `lib/sesion/rutas.ts` with:

```ts
export const RUTA_DE_INGRESO = "/ingreso"
export const RUTA_DEL_PUENTE = "/ingreso/puente"

export type DecisionDeRuta = "seguir" | "a_ingreso" | "a_inicio"

/** The optimistic check of `proxy.ts`: the real authorisation is Coni's row in `miembros`, checked on the server. */
export function decidirRuta(entrada: { ruta: string; haySesion: boolean }): DecisionDeRuta {
  // The bridge from Conidolly (change 29a) replaces whatever session the browser has: it runs with one or without.
  if (entrada.ruta === RUTA_DEL_PUENTE) return "seguir"
  const enIngreso = entrada.ruta === RUTA_DE_INGRESO || entrada.ruta.startsWith(`${RUTA_DE_INGRESO}/`)
  if (!entrada.haySesion) return enIngreso ? "seguir" : "a_ingreso"
  return enIngreso ? "a_inicio" : "seguir"
}
```

`proxy.ts` needs no change: its matcher already covers `/ingreso/puente` (all methods) and it returns `respuesta` on `"seguir"`.

- [ ] **Step 4: Run it and see it pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/rutas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write lib/sesion/rutas.ts tests/unit/rutas.test.ts
git add lib/sesion/rutas.ts tests/unit/rutas.test.ts
git commit -m "$(cat <<'EOF'
Let the Conidolly bridge through the proxy with or without a session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: `cruzarPuente`, the bridge logic

**Files:**
- Create: `INGESTA/lib/sesion/puente.ts`
- Test: `INGESTA/tests/unit/puente.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/puente.test.ts`:

```ts
import { AuthError } from "@supabase/supabase-js"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cruzarPuente,
  claveDeSesion,
  DESTINO_DEL_PUENTE_VENCIDO,
  galletasDeLaSesionAnterior,
  TEXTO_PUENTE_VENCIDO,
} from "@/lib/sesion/puente"

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"

function authFalso(verificar: { error: AuthError | null } = { error: null }) {
  const llamadas: string[] = []
  return {
    llamadas,
    signOut: vi.fn(async () => {
      llamadas.push("signOut")
      return { error: null }
    }),
    verifyOtp: vi.fn(async () => {
      llamadas.push("verifyOtp")
      return verificar
    }),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cruzarPuente", () => {
  it("signs the old session out first, then verifies the token as an email token hash, and opens Inicio", async () => {
    const auth = authFalso()

    expect(await cruzarPuente(auth, TOKEN)).toBe("/")
    expect(auth.llamadas).toEqual(["signOut", "verifyOtp"])
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "email" })
  })

  it.each([
    ["nothing", null],
    ["an empty value", "   "],
    ["a value longer than 512 characters", "a".repeat(513)],
    ["a file instead of text", new Blob(["x"])],
  ])("sends %s to the expired-link message without asking Supabase", async (_caso, token) => {
    const auth = authFalso()

    expect(await cruzarPuente(auth, token)).toBe(DESTINO_DEL_PUENTE_VENCIDO)
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it("sends a used or expired token to the message, quietly: that is a normal case", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const auth = authFalso({ error: new AuthError("Email link is invalid or has expired", 403, "otp_expired") })

    expect(await cruzarPuente(auth, TOKEN)).toBe("/ingreso?puente=vencido")
    expect(registro).not.toHaveBeenCalled()
  })

  it("logs an unexpected Auth failure with status and code, never the token", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const auth = authFalso({ error: new AuthError("upstream exploded", 500, "unexpected_failure") })

    expect(await cruzarPuente(auth, TOKEN)).toBe(DESTINO_DEL_PUENTE_VENCIDO)
    expect(registro).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(registro.mock.calls)).not.toContain(TOKEN)
  })

  it("says what to do in plain Spanish", () => {
    expect(TEXTO_PUENTE_VENCIDO).toBe("El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez.")
  })
})

describe("the session cookie of the previous person", () => {
  it("is named after the first label of the Supabase host, as supabase-js names it", () => {
    expect(claveDeSesion("http://127.0.0.1:54421")).toBe("sb-127-auth-token")
    expect(claveDeSesion("https://mvfytttfxmzzjajecsch.supabase.co")).toBe("sb-mvfytttfxmzzjajecsch-auth-token")
  })

  it("is expired whole: the cookie and the five chunks @supabase/ssr may have split it into", () => {
    expect(galletasDeLaSesionAnterior("sb-127-auth-token")).toEqual([
      "sb-127-auth-token",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
      "sb-127-auth-token.2",
      "sb-127-auth-token.3",
      "sb-127-auth-token.4",
    ])
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/puente.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/sesion/puente"`.

- [ ] **Step 3: Minimal implementation.** Create `lib/sesion/puente.ts`:

```ts
import type { AuthError } from "@supabase/supabase-js"
import { z } from "zod"
import { RUTA_DE_INGRESO } from "./rutas"

type Respuesta = { error: Pick<AuthError, "message" | "status" | "code"> | null }

/** The two calls of Supabase Auth the bridge needs; a test passes a fake. */
export interface AuthDelPuente {
  signOut(args: { scope: "local" }): PromiseLike<Respuesta>
  verifyOtp(args: { token_hash: string; type: "email" }): PromiseLike<Respuesta>
}

export const DESTINO_DEL_PUENTE_VENCIDO = `${RUTA_DE_INGRESO}?puente=vencido`
export const TEXTO_PUENTE_VENCIDO = "El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez."

// GoTrue's hashed tokens are 56 hex characters today; the bound only keeps a junk body away from Auth.
const TokenDelPuente = z.string().trim().min(1).max(512)

/**
 * Swaps whatever session this browser had for the one the token of Conidolly's Biblioteca tab opens. The token is
 * `hashed_token` of `auth.admin.generateLink({ type: "magiclink" })`, verified as an email token hash (B11, pinned by
 * tests/integration/puente.test.ts). Who may then enter is decided as always by `leerSesion` and `miembros`.
 */
export async function cruzarPuente(auth: AuthDelPuente, token: unknown): Promise<string> {
  const leido = TokenDelPuente.safeParse(token)
  if (!leido.success) return DESTINO_DEL_PUENTE_VENCIDO
  const salida = await auth.signOut({ scope: "local" })
  if (salida.error) {
    console.error("No pude cerrar la sesión anterior antes del puente", {
      status: salida.error.status,
      code: salida.error.code,
    })
  }
  const { error } = await auth.verifyOtp({ token_hash: leido.data, type: "email" })
  if (!error) return "/"
  // 403 is a used, expired or unknown token: a normal case with its own message, nothing for WAV to read.
  if (error.status !== 403) {
    console.error("No pude verificar el enlace de la Biblioteca", { status: error.status, code: error.code })
  }
  return DESTINO_DEL_PUENTE_VENCIDO
}

/** The cookie @supabase/ssr keeps the session in: supabase-js names it after the first label of the project's host. */
export function claveDeSesion(urlDeSupabase: string): string {
  return `sb-${new URL(urlDeSupabase).hostname.split(".")[0]}-auth-token`
}

/**
 * The bridge POST comes from another site, so the browser sends none of the `SameSite=Lax` session cookies and
 * `signOut` cannot see them. These names are expired by hand, the cookie and every chunk, so nothing of the previous
 * person's session survives next to Coni's.
 */
export function galletasDeLaSesionAnterior(clave: string): string[] {
  return [clave, ...Array.from({ length: 5 }, (_, indice) => `${clave}.${indice}`)]
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/puente.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write lib/sesion/puente.ts tests/unit/puente.test.ts
git add lib/sesion/puente.ts tests/unit/puente.test.ts
git commit -m "$(cat <<'EOF'
Add the bridge logic that swaps the browser's session for Coni's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: the route `POST /ingreso/puente`

**Files:**
- Create: `INGESTA/app/ingreso/puente/route.ts`
- Test: `INGESTA/tests/unit/puente-ruta.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/puente-ruta.test.ts` (it mocks `@supabase/ssr`, the third-party boundary, and captures the cookie writer the route hands it):

```ts
// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Galleta = { name: string; value: string; options: Record<string, unknown> }

const auth = vi.hoisted(() => ({ signOut: vi.fn(), verifyOtp: vi.fn() }))
const escritor = vi.hoisted(() => ({ setAll: (_galletas: Galleta[]): void => undefined }))
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _clave: string, opciones: { cookies: { setAll: (g: Galleta[]) => void } }) => {
    escritor.setAll = opciones.cookies.setAll
    return { auth }
  },
}))

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
const URL_DEL_PUENTE = "http://localhost:3100/ingreso/puente"

function pedidoConFormulario(campos: Record<string, string>) {
  return new NextRequest(URL_DEL_PUENTE, { method: "POST", body: new URLSearchParams(campos) })
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave-anonima")
  auth.signOut.mockResolvedValue({ error: null })
  auth.verifyOtp.mockImplementation(async () => {
    escritor.setAll([{ name: "sb-127-auth-token", value: "sesion-de-coni", options: { path: "/" } }])
    return { data: {}, error: null }
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  auth.signOut.mockReset()
  auth.verifyOtp.mockReset()
})

describe("POST /ingreso/puente", () => {
  it("writes Coni's session and opens Inicio with a 303, uncached and without a referrer", async () => {
    const { POST } = await import("@/app/ingreso/puente/route")

    const respuesta = await POST(pedidoConFormulario({ token_hash: TOKEN }))

    expect(respuesta.status).toBe(303)
    expect(respuesta.headers.get("location")).toBe("/")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(respuesta.headers.get("referrer-policy")).toBe("no-referrer")
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "email" })
    expect(respuesta.cookies.get("sb-127-auth-token")?.value).toBe("sesion-de-coni")
  })

  it("expires every chunk of the previous session, which the cross-site POST never showed it", async () => {
    const { POST } = await import("@/app/ingreso/puente/route")

    const respuesta = await POST(pedidoConFormulario({ token_hash: TOKEN }))

    for (const indice of [0, 1, 2, 3, 4]) {
      expect(respuesta.cookies.get(`sb-127-auth-token.${indice}`)).toMatchObject({ value: "", maxAge: 0, path: "/" })
    }
  })

  it("sends a refused token to the expired-link message and still clears the old session", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired", status: 403, code: "otp_expired" } })
    const { POST } = await import("@/app/ingreso/puente/route")

    const respuesta = await POST(pedidoConFormulario({ token_hash: TOKEN }))

    expect(respuesta.headers.get("location")).toBe("/ingreso?puente=vencido")
    expect(respuesta.cookies.get("sb-127-auth-token")).toMatchObject({ value: "", maxAge: 0 })
  })

  it("refuses a body that is not a form without asking Supabase, and never logs the body", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { POST } = await import("@/app/ingreso/puente/route")

    const respuesta = await POST(
      new NextRequest(URL_DEL_PUENTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token_hash: TOKEN }),
      }),
    )

    expect(respuesta.headers.get("location")).toBe("/ingreso?puente=vencido")
    expect(auth.verifyOtp).not.toHaveBeenCalled()
    expect(JSON.stringify(registro.mock.calls)).not.toContain(TOKEN)
  })
})

describe("GET /ingreso/puente", () => {
  it("is not a way in: it goes to the sign-in page", async () => {
    const { GET } = await import("@/app/ingreso/puente/route")

    const respuesta = GET()

    expect(respuesta.status).toBe(303)
    expect(respuesta.headers.get("location")).toBe("/ingreso")
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/puente-ruta.test.ts`
Expected: FAIL, `Failed to resolve import "@/app/ingreso/puente/route"`.

- [ ] **Step 3: Minimal implementation.** Create `app/ingreso/puente/route.ts`:

```ts
import { type CookieOptions, createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { exigirEnv } from "@/lib/env"
import {
  claveDeSesion,
  cruzarPuente,
  DESTINO_DEL_PUENTE_VENCIDO,
  galletasDeLaSesionAnterior,
} from "@/lib/sesion/puente"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

export const dynamic = "force-dynamic"

// The token rode in a POST body: the answer is never cached and never tells the next page where it came from.
const CABECERAS = { "cache-control": "no-store", "referrer-policy": "no-referrer" }

function irA(ruta: string): NextResponse {
  // A relative Location keeps the host the browser is on (no `new URL(..., request.url)`).
  return new NextResponse(null, { status: 303, headers: { location: ruta, ...CABECERAS } })
}

type GalletaNueva = { name: string; value: string; options: CookieOptions }

/** The other end of Conidolly's Biblioteca tab (change 29a): the form there posts Coni's one-time token here. */
export async function POST(request: NextRequest) {
  const urlDeSupabase = exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)
  const nuevas: GalletaNueva[] = []
  const db = createServerClient(
    urlDeSupabase,
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(galletas) {
          nuevas.push(...galletas)
        },
      },
    },
  )

  let formulario: FormData
  try {
    formulario = await request.formData()
  } catch (error) {
    // Only the kind of error: the body may hold a token and never reaches the log.
    console.error("El puente recibió un cuerpo que no es un formulario", error instanceof Error ? error.name : "otro")
    return conSesionNueva(irA(DESTINO_DEL_PUENTE_VENCIDO), urlDeSupabase, nuevas)
  }

  const destino = await cruzarPuente(db.auth, formulario.get("token_hash"))
  return conSesionNueva(irA(destino), urlDeSupabase, nuevas)
}

/** Expires the previous person's session cookies first; the ones Supabase just wrote replace them by name. */
function conSesionNueva(respuesta: NextResponse, urlDeSupabase: string, nuevas: GalletaNueva[]): NextResponse {
  for (const nombre of galletasDeLaSesionAnterior(claveDeSesion(urlDeSupabase))) {
    respuesta.cookies.set(nombre, "", { path: "/", maxAge: 0 })
  }
  for (const { name, value, options } of nuevas) respuesta.cookies.set(name, value, options)
  return respuesta
}

export function GET() {
  return irA(RUTA_DE_INGRESO)
}
```

- [ ] **Step 4: Run it and see it pass, then the whole unit suite and the types.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/puente-ruta.test.ts && pnpm test:run && pnpm type`
Expected: PASS (5 tests in the file), all unit tests green, `tsc` without errors.

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write app/ingreso/puente/route.ts tests/unit/puente-ruta.test.ts
git add app/ingreso/puente/route.ts tests/unit/puente-ruta.test.ts
git commit -m "$(cat <<'EOF'
Add the POST /ingreso/puente route that opens Coni's session from Conidolly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: integration test with a real token (pins B11)

**Files:**
- Create: `INGESTA/tests/integration/puente.test.ts`

- [ ] **Step 1: Write the test.** Create `tests/integration/puente.test.ts`:

```ts
import { createServerClient } from "@supabase/ssr"
import { describe, expect, it } from "vitest"
import { claveDeSesion, cruzarPuente, DESTINO_DEL_PUENTE_VENCIDO } from "@/lib/sesion/puente"
import type { Database } from "@/lib/supabase/database.types"
import { clienteDeServicio } from "./sesion"

const CORREO_DE_CONI = "coni@estudio.test"

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: copia las claves del Supabase local a .env.local (ver .env.example).`)
  return valor
}

/** A browser of its own: the cookies the server client writes, kept in memory. */
function navegador() {
  const galletas = new Map<string, string>()
  const cliente = createServerClient<Database>(variable("SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => [...galletas].map(([name, value]) => ({ name, value })),
      setAll: (nuevas) => {
        for (const { name, value } of nuevas) {
          if (value === "") galletas.delete(name)
          else galletas.set(name, value)
        }
      },
    },
  })
  return { cliente, galletas }
}

/** What Conidolly's /ir-a-biblioteca puts in the form: the hashed token of an admin magic link. */
async function tokenDeConi(): Promise<string> {
  const { data, error } = await clienteDeServicio().auth.admin.generateLink({ type: "magiclink", email: CORREO_DE_CONI })
  if (error) throw new Error(`No pude generar el enlace de Coni: ${error.message}`, { cause: error })
  return data.properties.hashed_token
}

describe("the bridge against the local Supabase", () => {
  it("opens Coni's session from a generateLink token, with the session cookie the app reads", async () => {
    const { cliente, galletas } = navegador()

    expect(await cruzarPuente(cliente.auth, await tokenDeConi())).toBe("/")

    const { data } = await cliente.auth.getUser()
    expect(data.user?.email).toBe(CORREO_DE_CONI)
    const clave = claveDeSesion(variable("SUPABASE_URL"))
    expect([...galletas.keys()].some((nombre) => nombre === clave || nombre.startsWith(`${clave}.`))).toBe(true)
    // GoTrue stamps the token with its own clock; PostgREST rejects one "issued at future" in the same second.
    await new Promise((resolver) => setTimeout(resolver, 1100))
    const esConi = await cliente.rpc("es_coni")
    expect(esConi.error).toBeNull()
    expect(esConi.data).toBe(true)
  })

  it("refuses the same token a second time and sends to the expired-link message", async () => {
    const token = await tokenDeConi()
    expect(await cruzarPuente(navegador().cliente.auth, token)).toBe("/")

    const segundo = navegador()
    expect(await cruzarPuente(segundo.cliente.auth, token)).toBe(DESTINO_DEL_PUENTE_VENCIDO)
    const { data } = await segundo.cliente.auth.getUser()
    expect(data.user).toBeNull()
  })
})
```

- [ ] **Step 2: Run it.** This pins external behaviour (the code exists since Task 2), so it passes on the first run; if it fails, the B11 facts above no longer hold and the plan stops here.

Run: `cd INGESTA && pnpm test:db tests/integration/puente.test.ts`
Expected: PASS (2 tests). A failure with `otp_expired` on the first test means `type: "email"` no longer verifies admin magic links: report it, do not switch types by guess.

- [ ] **Step 3: Prove the test can fail.** Temporarily change `type: "email"` to `type: "signup"` in `lib/sesion/puente.ts`, run the same command, expect the first test to FAIL (`expected '/ingreso?puente=vencido' to be '/'`), then restore `type: "email"` and run again: PASS.

- [ ] **Step 4: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write tests/integration/puente.test.ts
git add tests/integration/puente.test.ts
git commit -m "$(cat <<'EOF'
Pin the bridge against the local Supabase: a generateLink token opens Coni's session once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: the expired-link message on `/ingreso`

**Files:**
- Modify: `INGESTA/app/ingreso/page.tsx`, `INGESTA/app/ingreso/formulario-ingreso.tsx`
- Test: `INGESTA/tests/unit/ingreso-pagina.test.tsx` (new), `INGESTA/tests/unit/formulario-ingreso.test.tsx`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/ingreso-pagina.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import Ingreso from "@/app/ingreso/page"

vi.mock("@/app/ingreso/acciones", () => ({ pedirCodigoAccion: vi.fn(), verificarCodigoAccion: vi.fn() }))

describe("the sign-in page", () => {
  it("says the Biblioteca link was used or expired when the bridge sends her back", async () => {
    render(await Ingreso({ searchParams: Promise.resolve({ puente: "vencido" }) }))

    expect(screen.getByRole("status")).toHaveTextContent(
      "El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez.",
    )
    // She can still sign in with her code.
    expect(screen.getByRole("button", { name: "Soy Coni" })).toBeInTheDocument()
  })

  it("says nothing about the bridge on a normal visit", async () => {
    render(await Ingreso({ searchParams: Promise.resolve({}) }))

    expect(screen.queryByText(/El enlace ya se usó/)).not.toBeInTheDocument()
  })
})
```

Append to the `describe("FormularioIngreso")` of `tests/unit/formulario-ingreso.test.tsx`:

```tsx
  it("hides the bridge message once she chooses who enters", async () => {
    pedir.mockResolvedValue({ ok: true, correoEnmascarado: "c•••@estudio.test" })
    render(<FormularioIngreso avisoDelPuente="El enlace ya se usó o venció." />)
    expect(screen.getByRole("status")).toHaveTextContent("El enlace ya se usó o venció.")

    fireEvent.click(screen.getByRole("button", { name: "Soy Coni" }))

    expect(await screen.findByRole("heading", { name: "Entra con el código que te mandé" })).toBeInTheDocument()
    expect(screen.queryByText("El enlace ya se usó o venció.")).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run them and see them fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/ingreso-pagina.test.tsx tests/unit/formulario-ingreso.test.tsx`
Expected: FAIL: `Ingreso` takes no props and renders no `status` (`Unable to find role="status"`); TypeScript in the editor flags `avisoDelPuente` as unknown.

- [ ] **Step 3: Minimal implementation.** Replace `app/ingreso/page.tsx` with:

```tsx
import { TEXTO_PUENTE_VENCIDO } from "@/lib/sesion/puente"
import { FormularioIngreso } from "./formulario-ingreso"

export const dynamic = "force-dynamic"

export default async function Ingreso({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { puente } = await searchParams
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[560px] content-start px-4.5 pt-[max(4rem,env(safe-area-inset-top))] pb-8">
      <FormularioIngreso avisoDelPuente={puente === "vencido" ? TEXTO_PUENTE_VENCIDO : null} />
    </main>
  )
}
```

In `app/ingreso/formulario-ingreso.tsx` change the signature and the first screen (the rest stays):

```tsx
export function FormularioIngreso({ avisoDelPuente = null }: { avisoDelPuente?: string | null }) {
```

and inside `if (rol === null) { return ( ... ) }`, right after the `<div className="grid gap-2.5">` with the title and its paragraph:

```tsx
        {avisoDelPuente && !error ? (
          <p role="status" className="rounded-md bg-aviso-fondo p-3.5 text-aviso-tinta">
            {avisoDelPuente}
          </p>
        ) : null}
```

(The old token names are renamed by Task 7 with the rest of the app.)

- [ ] **Step 4: Run them and see them pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/ingreso-pagina.test.tsx tests/unit/formulario-ingreso.test.tsx && pnpm type`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write app/ingreso/page.tsx app/ingreso/formulario-ingreso.tsx tests/unit/ingreso-pagina.test.tsx tests/unit/formulario-ingreso.test.tsx
head -1 app/ingreso/formulario-ingreso.tsx   # must print "use client"
git add app/ingreso/page.tsx app/ingreso/formulario-ingreso.tsx tests/unit/ingreso-pagina.test.tsx tests/unit/formulario-ingreso.test.tsx
git commit -m "$(cat <<'EOF'
Tell Coni on the sign-in page when the Biblioteca link was used or expired

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: "Volver a Conidolly" for Coni, and `CONIDOLLY_URL`

**Files:**
- Modify: `INGESTA/components/navegacion-principal.tsx`, `INGESTA/.env.example`
- Test: `INGESTA/tests/unit/navegacion-principal.test.tsx`

- [ ] **Step 1: Write the failing test.** In `tests/unit/navegacion-principal.test.tsx` change the vitest import to `import { afterEach, describe, expect, it, vi } from "vitest"`, add after the imports:

```tsx
afterEach(() => {
  vi.unstubAllEnvs()
})
```

and append to the `describe`:

```tsx
  it("takes Coni back to Conidolly, the app she came from", () => {
    vi.stubEnv("CONIDOLLY_URL", "https://conidolly.example")
    render(<NavegacionPrincipal actual="materiales" rol="coni" />)

    expect(screen.getByRole("link", { name: "Volver a Conidolly" })).toHaveAttribute(
      "href",
      "https://conidolly.example",
    )
  })

  it("never offers Conidolly to WAV, which does not enter it", () => {
    vi.stubEnv("CONIDOLLY_URL", "https://conidolly.example")
    render(<NavegacionPrincipal actual="materiales" rol="wav" />)

    expect(screen.queryByRole("link", { name: "Volver a Conidolly" })).toBeNull()
  })

  it("hides the link while CONIDOLLY_URL is not set", () => {
    vi.stubEnv("CONIDOLLY_URL", "")
    render(<NavegacionPrincipal actual="materiales" rol="coni" />)

    expect(screen.queryByRole("link", { name: "Volver a Conidolly" })).toBeNull()
  })
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/navegacion-principal.test.tsx`
Expected: FAIL, `Unable to find an accessible element with the role "link" and name "Volver a Conidolly"`.

- [ ] **Step 3: Minimal implementation.** In `components/navegacion-principal.tsx` (a Server Component: it reads the variable at request time) replace the function with:

```tsx
export function NavegacionPrincipal({ actual, rol }: { actual: Seccion; rol: Rol }) {
  const visibles = SECCIONES.filter((seccion) => !seccion.soloWav || rol === "wav")
  // Coni comes from Conidolly's Biblioteca tab (change 29a) and goes back the same way. WAV never enters Conidolly (A6).
  const conidolly = rol === "coni" ? process.env.CONIDOLLY_URL : undefined
  return (
    <nav aria-label="Secciones" className="flex flex-wrap gap-1.5">
      {visibles.map((seccion) => (
        <Link
          key={seccion.clave}
          href={seccion.ruta}
          aria-current={seccion.clave === actual ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-auto items-center justify-center rounded-md border border-linea px-1 text-nav font-semibold",
            "focus-visible:outline-3 focus-visible:outline-acento",
            seccion.clave === actual
              ? "border-acento bg-acento-suave text-acento-profundo"
              : "bg-superficie text-tinta",
          )}
        >
          {seccion.texto}
        </Link>
      ))}
      {conidolly ? (
        <a
          href={conidolly}
          className="flex min-h-11 min-w-0 flex-auto items-center justify-center px-1 text-nav font-semibold text-acento underline underline-offset-4"
        >
          Volver a Conidolly
        </a>
      ) : null}
    </nav>
  )
}
```

Append to `.env.example`:

```
# Conidolly's address (no trailing slash): "Volver a Conidolly" in the main navigation, shown to Coni only.
# Production: https://conidolly.vercel.app
CONIDOLLY_URL=
```

- [ ] **Step 4: Run it and see it pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/navegacion-principal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write components/navegacion-principal.tsx tests/unit/navegacion-principal.test.tsx
git add components/navegacion-principal.tsx tests/unit/navegacion-principal.test.tsx .env.example
git commit -m "$(cat <<'EOF'
Offer Coni a way back to Conidolly from the main navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 7: Conidolly's tokens and the rename of every class

**Files:**
- Create: `INGESTA/app/tema-cerrado.css`, `INGESTA/tests/unit/tokens.test.ts`, `INGESTA/tests/unit/utils.test.ts`
- Rewrite: `INGESTA/app/globals.css`
- Modify: `INGESTA/lib/utils.ts`, `INGESTA/biome.json`, `INGESTA/tests/unit/estado-de-material.test.ts`, and every `.ts`/`.tsx` under `INGESTA/app`, `INGESTA/components`, `INGESTA/lib` that the rename touches (listed by Step 6)

- [ ] **Step 1: Prove the dead CSS is dead** (P8).

Run: `cd INGESTA && grep -rnE "deslizador|carta-idea|data-superficie|esqueleto|className=[^>]*[\"' ]aviso[\"' ]" app components lib --include='*.tsx' --include='*.ts'`
Expected: no output. If something prints, keep that CSS class in Step 5 with its tokens renamed by the map instead of dropping it.

- [ ] **Step 2: Write the failing tests.** Create `tests/unit/tokens.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(__dirname, "..", "..")
const CSS = readFileSync(join(RAIZ, "app", "globals.css"), "utf-8")

function token(nombre: string): string {
  const valor = new RegExp(`--${nombre}:\\s*(#[0-9a-f]{6});`).exec(CSS)?.[1]
  if (!valor) throw new Error(`No encontré --${nombre} con un color hex en app/globals.css`)
  return valor
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((inicio) => {
    const canal = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return ((clara ?? 0) + 0.05) / ((oscura ?? 0) + 0.05)
}

/** Every class name of the old raspberry palette and serif scale (rename map, plan P6). */
const NOMBRES_VIEJOS =
  /(?<![\w-])(?:[\w-]+:)*(?:(?:bg|text|border(?:-[lrtbxy])?|outline|accent|fill|stroke|ring|decoration|divide)-(?:fondo|superficie|hundido|linea|acento(?:-profundo|-suave|-claro)?|sobre-acento|(?:ok|aviso|error)-(?:tinta|fondo))|text-(?:display|title|label|body|nav|script)|rounded-(?:sm|md|lg|xl)|font-serif|ease-fuerte|shadow-flotante)(?![\w-])/

function archivosDeLaApp(): string[] {
  return ["app", "components", "lib"].flatMap((carpeta) =>
    readdirSync(join(RAIZ, carpeta), { recursive: true, encoding: "utf-8" })
      .filter((ruta) => /\.tsx?$/.test(ruta) && !ruta.endsWith("database.types.ts"))
      .map((ruta) => join(carpeta, ruta)),
  )
}

describe("Conidolly's tokens in Ingesta", () => {
  it("carry Conidolly's stone, ink, signature and light", () => {
    expect(token("piedra")).toBe("#ebebea")
    expect(token("piedra-alta")).toBe("#f4f4f3")
    expect(token("piedra-honda")).toBe("#dcdcdb")
    expect(token("tinta")).toBe("#262626")
    expect(token("firma")).toBe("#a8285a")
    expect(token("luz")).toBe("#fbfbfa")
  })

  it.each(["ok", "aviso", "error", "apagado", "tinta"])("keep %s readable (AA) on piedra and on piedra-honda", (nombre) => {
    expect(contraste(token(nombre), token("piedra"))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(token(nombre), token("piedra-honda"))).toBeGreaterThanOrEqual(4.5)
  })

  it("name Conidolly's globals.css as their source", () => {
    expect(CSS).toContain("estudio-coni app/globals.css")
    expect(CSS).not.toContain("docs/DESIGN.md")
  })

  it("leave no class with an old token name in app, components or lib", () => {
    const conNombresViejos = archivosDeLaApp().filter((ruta) =>
      NOMBRES_VIEJOS.test(readFileSync(join(RAIZ, ruta), "utf-8")),
    )
    expect(conNombresViejos).toEqual([])
  })

  it("keep literal colours in globals.css and the OS colour of lib/diseno/marca.ts only", () => {
    const conHex = archivosDeLaApp().filter(
      (ruta) => ruta !== join("lib", "diseno", "marca.ts") && /#[0-9a-fA-F]{6}\b/.test(readFileSync(join(RAIZ, ruta), "utf-8")),
    )
    expect(conHex).toEqual([])
  })
})
```

Create `tests/unit/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("keeps a size of the scale next to a colour (stock tailwind-merge reads text-meta as a colour)", () => {
    expect(cn("text-meta", "text-apagado")).toBe("text-meta text-apagado")
    expect(cn("text-pantalla", "text-tinta")).toBe("text-pantalla text-tinta")
  })

  it("lets the later relief, radius or target win, like any other utility", () => {
    expect(cn("shadow-relieve", "shadow-hundido")).toBe("shadow-hundido")
    expect(cn("rounded-panel", "rounded-control")).toBe("rounded-control")
    expect(cn("min-h-boton", "min-h-objetivo")).toBe("min-h-objetivo")
  })
})
```

In `tests/unit/estado-de-material.test.ts` change the expected chip of the waiting material to the renamed token:

```ts
    expect(estadoVisible(esperando)).toEqual({ texto: "Espera tu OK", clases: "bg-piedra-honda text-apagado" })
```

- [ ] **Step 3: Run them and see them fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/tokens.test.ts tests/unit/utils.test.ts tests/unit/estado-de-material.test.ts`
Expected: FAIL: `No encontré --piedra con un color hex`, the old-names list holds about 30 files, `cn("text-meta", "text-apagado")` gives `"text-apagado"`, and the chip still says `bg-hundido`.

- [ ] **Step 4: Create `app/tema-cerrado.css`** (identical to Conidolly's) and exclude it from Biome.

```css
/*
 * Closes Tailwind's defaults so a forgotten bg-white, rounded-lg or text-sm compiles to nothing and shows up in review.
 * It lives in its own file, imported first by globals.css, because Biome's CSS parser rejects the wildcard names; the
 * file is excluded from Biome in biome.json for that reason only.
 */
@theme inline {
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --text-*: initial;
}
```

In `biome.json` change `files.includes` to:

```json
    "includes": ["**", "!node_modules", "!.next", "!dist", "!build", "!lib/supabase/database.types.ts", "!app/tema-cerrado.css"]
```

- [ ] **Step 5: Rewrite `app/globals.css`** with exactly:

```css
/* biome-ignore-all lint/a11y/useGenericFontNames: `font: -apple-system-body` is a system keyword; body sets the family again. */
/* biome-ignore-all lint/suspicious/noShorthandPropertyOverrides: that shorthand deliberately replaces the 17 px root on touch screens. */
@import "tailwindcss";
/* Closes the default palette, radii, shadows and type sizes (before the tokens below define the real ones). */
@import "./tema-cerrado.css";

/*
 * Conidolly's tokens. Source: estudio-coni app/globals.css (Soft UI v6, gris neutro). Keep the shared values in sync
 * with that file until stage 2 moves these screens into Conidolly (estudio-coni,
 * docs/superpowers/specs/2026-11-02-biblioteca-misma-sesion-design.md). This is the only place with literal colours:
 * components use the names below (bg-piedra, text-tinta, shadow-relieve, ...). Light only.
 * --ok and --aviso are Ingesta's own (Conidolly has no such states), AA on piedra and piedra-honda
 * (tests/unit/tokens.test.ts).
 */
:root {
  color-scheme: light;

  /* ---------- Colour ---------- */
  --piedra: #ebebea; /* page and every raised surface */
  --piedra-alta: #f4f4f3; /* reading panels, flat groups */
  --piedra-honda: #dcdcdb; /* sunken tracks and fields, status pills, warning and error blocks, disabled */
  --luz: #fbfbfa; /* light side of the relief; text on tinta */
  --tinta: #262626; /* all text, primary fill, focus ring */
  --apagado: #5a5a59; /* meta, help, disabled labels */
  --campo: #727271; /* outlines at high contrast, the quote rule of a card */
  --hilo: var(--piedra-honda); /* 1 px dividers, decorative */
  --error: #a8200d; /* error text, always with words */
  --firma: #a8285a; /* raspberry: Conidolly's signature, kept for stage 2 */
  --sobre-firma: var(--luz);
  --ok: #2e5e45; /* Ingesta only: a material is ready, a code was sent */
  --aviso: #7a4a00; /* Ingesta only: processing, a confirmation before something that cannot be undone */

  /* ---------- Relief: sunken, raised and high, never a fourth level ---------- */
  --relieve: -6px -6px 14px rgb(251 251 250 / 0.9), 6px 6px 14px rgb(60 60 60 / 0.18);
  --relieve-alto: -10px -10px 24px rgb(251 251 250 / 0.9), 10px 10px 24px rgb(60 60 60 / 0.22);
  --relieve-fijo: 0 -4px 14px rgb(60 60 60 / 0.1), inset 0 1px 0 rgb(251 251 250 / 0.9);
  --hundido: inset 4px 4px 10px rgb(60 60 60 / 0.18), inset -4px -4px 10px rgb(251 251 250 / 0.9);

  /* ---------- Type: rem on the iOS body size, so the system text size scales text and targets together ---------- */
  --letra: var(--font-geist-sans), ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif;
  --t-pantalla: 2rem;
  --i-pantalla: 1.125;
  --tr-pantalla: -0.022em;
  --t-pieza: 1.5rem;
  --i-pieza: 1.167;
  --tr-pieza: -0.014em;
  --t-guion: 1.18rem;
  --i-guion: 1.6;
  --t-boton: 1.125rem;
  --i-boton: 1.333;
  --t-cuerpo: 1rem;
  --i-cuerpo: 1.333;
  --t-meta: 0.9375rem;
  --i-meta: 1.333;
  --peso-titulo: 600;

  /* ---------- Shape ---------- */
  --r-control: 999px;
  --r-panel: 24px;
  --r-bloque: 18px;
  --r-casilla: 9px;

  /* ---------- Motion: only in response to touch ---------- */
  --dur-corta: 150ms;
  --dur-media: 200ms;
  --curva-salida: cubic-bezier(0.23, 1, 0.32, 1);
  --latido: 1.6s;
}

/* Reduced motion keeps every state change and drops the movement. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-corta: 0ms;
    --dur-media: 0ms;
  }
}

/* Pillars: one hue each; tint, strong tint, ink and dot all derive from it. */
[data-pilar="pareja"] {
  --p-h: 245;
}
[data-pilar="deseo"] {
  --p-h: 320;
}
[data-pilar="autoestima"] {
  --p-h: 50;
}
[data-pilar="limites"] {
  --p-h: 160;
}
[data-pilar="bienestar"] {
  --p-h: 85;
}
[data-pilar] {
  --p-tinte: oklch(0.955 0.028 var(--p-h));
  --p-tinte-fuerte: oklch(0.91 0.05 var(--p-h));
  --p-tinta: oklch(0.43 0.09 var(--p-h));
  --p-punto: oklch(0.62 0.12 var(--p-h));
}

@theme inline {
  --color-transparent: transparent;
  --color-current: currentColor;
  --color-piedra: var(--piedra);
  --color-piedra-alta: var(--piedra-alta);
  --color-piedra-honda: var(--piedra-honda);
  --color-luz: var(--luz);
  --color-tinta: var(--tinta);
  --color-apagado: var(--apagado);
  --color-campo: var(--campo);
  --color-hilo: var(--hilo);
  --color-error: var(--error);
  --color-firma: var(--firma);
  --color-sobre-firma: var(--sobre-firma);
  --color-ok: var(--ok);
  --color-aviso: var(--aviso);
  --color-pilar-tinte: var(--p-tinte);
  --color-pilar-tinte-fuerte: var(--p-tinte-fuerte);
  --color-pilar-tinta: var(--p-tinta);
  --color-pilar-punto: var(--p-punto);

  --font-sans: var(--font-geist-sans), ui-sans-serif, -apple-system, system-ui, sans-serif;

  --text-pantalla: var(--t-pantalla);
  --text-pantalla--line-height: var(--i-pantalla);
  --text-pantalla--letter-spacing: var(--tr-pantalla);
  --text-pantalla--font-weight: var(--peso-titulo);
  --text-pieza: var(--t-pieza);
  --text-pieza--line-height: var(--i-pieza);
  --text-pieza--letter-spacing: var(--tr-pieza);
  --text-pieza--font-weight: var(--peso-titulo);
  --text-guion: var(--t-guion);
  --text-guion--line-height: var(--i-guion);
  --text-boton: var(--t-boton);
  --text-boton--line-height: var(--i-boton);
  --text-cuerpo: var(--t-cuerpo);
  --text-cuerpo--line-height: var(--i-cuerpo);
  --text-meta: var(--t-meta);
  --text-meta--line-height: var(--i-meta);

  --radius-control: var(--r-control);
  --radius-panel: var(--r-panel);
  --radius-bloque: var(--r-bloque);
  --radius-casilla: var(--r-casilla);

  --shadow-relieve: var(--relieve);
  --shadow-relieve-alto: var(--relieve-alto);
  --shadow-relieve-fijo: var(--relieve-fijo);
  --shadow-hundido: var(--hundido);

  /* Paddings stay px when the root grows with the iOS text size; targets are rem (lib/utils.ts lists these names). */
  --spacing: 4px;
  --spacing-objetivo: 2.75rem;
  --spacing-boton: 3.25rem;
  --spacing-nav: 3.5rem;

  --ease-salida: var(--curva-salida);
}

/* 17 px everywhere; iPhone and iPad with touch take Dynamic Type. The media guard is Conidolly's: on macOS Safari
   -apple-system-body resolves to the desktop body size and would shrink the app. */
html {
  font-size: 106.25%;
  -webkit-text-size-adjust: 100%;
}
@media (hover: none) and (pointer: coarse) {
  @supports (font: -apple-system-body) {
    html {
      font: -apple-system-body;
    }
  }
}

/* The shorthand above also sets a system family: the body sets family, size and line height again. */
body {
  background: var(--piedra);
  color: var(--tinta);
  font-family: var(--letra);
  font-size: var(--t-cuerpo);
  line-height: var(--i-cuerpo);
  -webkit-font-smoothing: antialiased;
}

/* In the base layer so a utility can change the colour where it must. */
@layer base {
  :focus-visible {
    outline: 2px solid var(--tinta);
    outline-offset: 2px;
  }
}

/* With more contrast every raised or sunken container gets a campo outline and apagado turns ink. */
@media (prefers-contrast: more) {
  :root {
    --apagado: var(--tinta);
  }
  :where(.shadow-relieve, .shadow-relieve-alto, .shadow-relieve-fijo, .shadow-hundido, .campo) {
    outline: 2px solid var(--campo);
    outline-offset: -2px;
  }
  :where(.shadow-relieve, .shadow-relieve-alto, .shadow-relieve-fijo, .shadow-hundido, .campo):focus-visible {
    outline-color: var(--tinta);
    outline-offset: 2px;
  }
  .campo[aria-invalid="true"] {
    outline-color: var(--error);
  }
}

/* Shadows vanish in forced colours: raised and sunken shapes get a system border. */
@media (forced-colors: active) {
  :where(.shadow-relieve, .shadow-relieve-alto, .shadow-relieve-fijo, .shadow-hundido, .campo) {
    border: 1px solid CanvasText;
  }
}

/* Fields sink: a 3.25rem pill for one line; a text area has 24 px corners and grows with its text. In the components
   layer so a utility can still adjust one. */
@layer components {
  .campo {
    background: var(--piedra-honda);
    box-shadow: var(--hundido);
    border: 0;
    border-radius: var(--r-control);
    padding: 0 20px;
    min-height: 3.25rem;
    color: var(--tinta);
  }
  textarea.campo {
    field-sizing: content;
    border-radius: var(--r-panel);
    padding: 14px 20px;
  }
  .campo[aria-invalid="true"] {
    outline: 2px solid var(--error);
    outline-offset: 0;
  }
  .campo:disabled {
    box-shadow: none;
    color: var(--apagado);
  }
  .campo::placeholder {
    color: var(--apagado);
  }
}

/* Loading: a slow pulse of opacity, never a spinner in the middle of the content. */
@keyframes latido {
  50% {
    opacity: 0.55;
  }
}
.esqueleto {
  animation: latido var(--latido) ease-in-out infinite;
  background: var(--piedra-honda);
  border-radius: var(--r-control);
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  .esqueleto {
    animation: none;
  }
}
```

- [ ] **Step 6: Rename every class** with the map P6 (prefix-preserving, word-bounded; `perl` ships with macOS and CI's Ubuntu):

```bash
cd INGESTA
ARCHIVOS=$(grep -rlE "acento|superficie|hundido|linea|fondo|ok-|aviso-|error-|font-serif|text-(display|title|label|body|nav|script)|rounded-(sm|md|lg|xl)|ease-fuerte" app components lib --include='*.ts' --include='*.tsx' | grep -v 'lib/supabase/database.types.ts')
echo "$ARCHIVOS"
perl -pi -e '
  BEGIN {
    %c = ("acento-profundo" => "tinta", "acento-suave" => "piedra-honda", "acento-claro" => "campo",
          "sobre-acento" => "luz", "acento" => "tinta", "superficie" => "piedra-alta", "fondo" => "piedra",
          "hundido" => "piedra-honda", "linea" => "hilo", "error-tinta" => "error", "error-fondo" => "piedra-honda",
          "ok-tinta" => "ok", "ok-fondo" => "piedra-honda", "aviso-tinta" => "aviso", "aviso-fondo" => "piedra-honda");
    %t = (display => "pantalla", title => "pieza", label => "cuerpo", body => "cuerpo", nav => "meta", script => "guion");
    %r = (sm => "casilla", md => "bloque", lg => "panel", xl => "panel");
  }
  s/(?<![\w-])((?:[\w-]+:)*(?:bg|text|border(?:-[lrtbxy])?|outline|accent|fill|stroke|ring|decoration|divide))-(acento-profundo|acento-suave|acento-claro|sobre-acento|acento|superficie|fondo|hundido|linea|error-tinta|error-fondo|ok-tinta|ok-fondo|aviso-tinta|aviso-fondo)(?![\w-])/$1-$c{$2}/g;
  s/(?<![\w-])((?:[\w-]+:)*)text-(display|title|label|body|nav|script)(?![\w-])/$1text-$t{$2}/g;
  s/(?<![\w-])((?:[\w-]+:)*)rounded-(sm|md|lg|xl)(?![\w-])/$1rounded-$r{$2}/g;
  s/(?<![\w-])ease-fuerte(?![\w-])/ease-salida/g;
  s/(?<![\w-])font-serif ?//g;
' $ARCHIVOS
git diff --stat
```

Expected: about 30 files changed, only class strings. Spot-check `git diff app/(app)/estado-de-material.ts components/ui/clases-de-boton.ts app/ingreso/formulario-ingreso.tsx`: `bg-aviso-fondo text-aviso-tinta` became `bg-piedra-honda text-aviso`, `font-serif text-display` became `text-pantalla`, `focus:border-acento` became `focus:border-tinta`.

- [ ] **Step 7: Prove no old name remains** (the grep the spec asks for; the same check lives in `tests/unit/tokens.test.ts`).

Run: `cd INGESTA && grep -rnE "(bg|text|border|outline|accent)-(fondo|superficie|hundido|linea|acento|sobre-acento|ok-tinta|ok-fondo|aviso-tinta|aviso-fondo|error-tinta|error-fondo)\b|text-(display|title|label|body|nav|script)\b|font-serif|rounded-(sm|md|lg|xl)\b|ease-fuerte|shadow-flotante" app components lib --include='*.ts' --include='*.tsx'`
Expected: no output.

- [ ] **Step 8: Teach `cn` the scale.** Replace `lib/utils.ts` with:

```ts
import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The custom scale of app/globals.css (Conidolly's, lib/utils.ts there). Without it tailwind-merge reads `text-meta` as
// a colour and drops it next to `text-tinta`. Keep these lists in step with the @theme block of globals.css.
const fusionar = extendTailwindMerge({
  extend: {
    theme: {
      text: ["pantalla", "pieza", "guion", "boton", "cuerpo", "meta"],
      shadow: ["relieve", "relieve-alto", "relieve-fijo", "hundido"],
      radius: ["control", "panel", "bloque", "casilla"],
      spacing: ["objetivo", "boton", "nav"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return fusionar(clsx(inputs))
}
```

- [ ] **Step 9: Run the three tests, then everything.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/tokens.test.ts tests/unit/utils.test.ts tests/unit/estado-de-material.test.ts && pnpm test:run && pnpm lint && pnpm type && pnpm build`
Expected: all PASS; `next build` compiles the CSS (a typo in a token name shows up as an unknown utility only visually, which is why Task 12 looks at the screens).

- [ ] **Step 10: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write app components lib tests/unit/tokens.test.ts tests/unit/utils.test.ts tests/unit/estado-de-material.test.ts
for f in $(git diff --name-only -- '*.tsx'); do if grep -q '"use client"' "$f"; then head -1 "$f" | grep -qx '"use client"' || echo "LOST use client: $f"; fi; done
git add -A app components lib biome.json tests/unit/tokens.test.ts tests/unit/utils.test.ts tests/unit/estado-de-material.test.ts
git commit -m "$(cat <<'EOF'
Take Conidolly's tokens and rename every class to Conidolly's names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(The `for` line must print nothing.)

### Task 8: Geist and the stone theme colour

**Files:**
- Modify: `INGESTA/app/layout.tsx`, `INGESTA/lib/diseno/marca.ts`, `INGESTA/package.json`, `INGESTA/pnpm-lock.yaml`
- Test: `INGESTA/tests/unit/marca.test.ts` (new)

- [ ] **Step 1: Write the failing test.** Create `tests/unit/marca.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import RootLayout, { viewport } from "@/app/layout"
import { COLOR_DE_FONDO } from "@/lib/diseno/marca"

// next/font only exists inside the Next build; the font is a third-party boundary.
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "--font-geist-sans" } }))

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8")

describe("brand constants", () => {
  it("repeat the stone of globals.css for the OS, which reads it before any stylesheet", () => {
    expect(css).toContain(`--piedra: ${COLOR_DE_FONDO};`)
  })

  it("tell the phone the app is light only, on the stone colour", () => {
    expect(viewport.colorScheme).toBe("light")
    expect(viewport.themeColor).toBe(COLOR_DE_FONDO)
  })

  it("set the text in Geist, one family, as Conidolly does", () => {
    expect(RootLayout({ children: null }).props.className).toBe("--font-geist-sans")
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/marca.test.ts`
Expected: FAIL: `Failed to resolve import "geist/font/sans"` (not installed yet) or, once installed, `expected '#fbf6f8'` not contained and the class name check failing.

- [ ] **Step 3: Minimal implementation.**

```bash
cd INGESTA && pnpm add geist@^1.7.2
```

Replace `lib/diseno/marca.ts` with:

```ts
// The viewport is read by the operating system before any stylesheet loads, so it needs a literal colour. It repeats
// `--piedra` of app/globals.css (tests/unit/marca.test.ts keeps them in sync).
export const COLOR_DE_FONDO = "#ebebea"
export const NOMBRE_DE_LA_APP = "Material de Coni"
```

Replace `app/layout.tsx` with:

```tsx
import { GeistSans } from "geist/font/sans"
import type { Metadata, Viewport } from "next"
import { COLOR_DE_FONDO, NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"
import "./globals.css"

export const metadata: Metadata = {
  title: NOMBRE_DE_LA_APP,
  description: "Donde Coni y WAV suben el material que alimenta a Conidolly.",
  applicationName: NOMBRE_DE_LA_APP,
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COLOR_DE_FONDO,
  colorScheme: "light",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL" className={GeistSans.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/marca.test.ts tests/unit/tokens.test.ts && pnpm type && pnpm build`
Expected: PASS; build green (Geist resolves through `geist/font/sans` without a `next.config`).

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write app/layout.tsx lib/diseno/marca.ts tests/unit/marca.test.ts
git add app/layout.tsx lib/diseno/marca.ts tests/unit/marca.test.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
Set Ingesta in Geist on Conidolly's stone, light only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 9: the button in Soft UI

**Files:**
- Modify: `INGESTA/components/ui/clases-de-boton.ts`, `INGESTA/components/ui/boton.tsx`
- Test: `INGESTA/tests/unit/boton.test.tsx` (new)

- [ ] **Step 1: Write the failing test.** Create `tests/unit/boton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"

describe("Boton", () => {
  it("is a raised ink pill by default, pressing sinks it", () => {
    render(<Boton>Subir material</Boton>)

    expect(screen.getByRole("button", { name: "Subir material" })).toHaveClass(
      "rounded-control",
      "bg-tinta",
      "text-luz",
      "shadow-relieve",
      "active:shadow-hundido",
      "min-h-boton",
      "text-boton",
    )
  })

  it("draws the line variant as Conidolly's raised secondary on stone", () => {
    render(<Boton variante="linea">Salir</Boton>)

    expect(screen.getByRole("button", { name: "Salir" })).toHaveClass("bg-piedra", "text-tinta", "shadow-relieve")
  })

  it("draws the quiet variant as underlined ink text on a 2.75rem target, without a surface", () => {
    render(<Boton variante="callado">Cambiar de persona</Boton>)

    const boton = screen.getByRole("button", { name: "Cambiar de persona" })
    expect(boton).toHaveClass("text-tinta", "underline", "min-h-objetivo", "px-0")
    expect(boton).not.toHaveClass("min-h-boton", "shadow-relieve")
  })

  it("stays focusable when disabled and turns flat", () => {
    render(<Boton deshabilitado>Entrar</Boton>)

    const boton = screen.getByRole("button", { name: "Entrar" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).not.toBeDisabled()
    expect(boton).toHaveClass("aria-disabled:bg-piedra-honda", "aria-disabled:shadow-none")
  })

  it("gives links that look like buttons the same classes", () => {
    expect(clasesDeBoton()).toContain("bg-tinta")
    expect(clasesDeBoton({ variante: "linea", tamano: "chico" })).toContain("min-h-objetivo")
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/boton.test.tsx`
Expected: FAIL, `Expected the element to have class: rounded-control bg-tinta ...` (it has `rounded-bloque bg-tinta text-luz` from the rename, no relief).

- [ ] **Step 3: Minimal implementation.** Replace `components/ui/clases-de-boton.ts` with:

```ts
// Not a client module: Server Components use these classes too, for links that look like buttons.
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const PLANO_SI_ESTA_DESHABILITADO =
  "aria-disabled:bg-piedra-honda aria-disabled:text-apagado aria-disabled:shadow-none aria-disabled:active:shadow-none"

/**
 * Conidolly's button (estudio-coni components/ui/clases-de-boton.ts): everything touchable is a raised pill and pressing
 * sinks it. Ingesta keeps its variant names (`linea` is Conidolly's `secundario`) so no caller changes.
 */
const variantesDeBoton = cva(
  [
    "inline-flex items-center justify-between gap-3 rounded-control text-left font-semibold",
    "transition-[box-shadow,opacity] duration-[var(--dur-corta)] ease-salida",
    "aria-disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variante: {
        primario: `bg-tinta text-luz shadow-relieve active:shadow-hundido ${PLANO_SI_ESTA_DESHABILITADO}`,
        linea: `bg-piedra text-tinta shadow-relieve active:shadow-hundido ${PLANO_SI_ESTA_DESHABILITADO}`,
        callado:
          "justify-start text-tinta underline decoration-1 underline-offset-4 active:opacity-70 aria-disabled:text-apagado aria-disabled:no-underline",
      },
      tamano: {
        grande: "min-h-boton w-full px-[22px] text-boton",
        chico: "min-h-objetivo px-[18px] text-cuerpo",
      },
    },
    // The quiet action has no surface at any size: its target is the 2.75rem row of its text.
    compoundVariants: [{ variante: "callado", class: "min-h-objetivo w-auto px-0 text-cuerpo" }],
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)

export type OpcionesDeBoton = VariantProps<typeof variantesDeBoton>

/** Also used for links that look like buttons, so the two never drift apart. Merged with `cn`, so the compound wins. */
export function clasesDeBoton({ className, ...opciones }: OpcionesDeBoton & { className?: string } = {}): string {
  return cn(variantesDeBoton(opciones), className)
}
```

In `components/ui/boton.tsx` replace the imports and the interface head, and the className line (the rest stays):

```tsx
"use client"

import type { ButtonHTMLAttributes, MouseEvent } from "react"
import { clasesDeBoton, type OpcionesDeBoton } from "./clases-de-boton"

interface PropiedadesDeBoton extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">, OpcionesDeBoton {
```

and

```tsx
      className={clasesDeBoton({ variante, tamano, className })}
```

(`cn` is no longer imported in `boton.tsx`.)

- [ ] **Step 4: Run it and see it pass, with every caller.**

Run: `cd INGESTA && grep -rn "clasesDeBoton(" app components | head -40 && pnpm exec vitest run tests/unit/boton.test.tsx && pnpm test:run && pnpm type`
Expected: every caller passes `{ variante?, tamano? }` or nothing (the signature accepts both); PASS; `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write components/ui/clases-de-boton.ts components/ui/boton.tsx tests/unit/boton.test.tsx
head -1 components/ui/boton.tsx   # "use client"
git add components/ui/clases-de-boton.ts components/ui/boton.tsx tests/unit/boton.test.tsx
git commit -m "$(cat <<'EOF'
Draw Ingesta's button as Conidolly's raised pill, same props

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 10: sunken fields and code boxes

**Files:**
- Modify: `INGESTA/components/campo.tsx`, `INGESTA/components/casillas-codigo.tsx`
- Test: `INGESTA/tests/unit/campo.test.tsx` (new), `INGESTA/tests/unit/casillas-codigo.test.tsx`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/campo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CLASES_DE_CAMPO, Campo } from "@/components/campo"

describe("Campo", () => {
  it("sinks the field like Conidolly's (the .campo class of globals.css) and labels it in body size", () => {
    render(
      <Campo id="titulo" etiqueta="Título" ayuda="Como lo dice la fuente.">
        <input id="titulo" className={CLASES_DE_CAMPO} aria-describedby="titulo-ayuda" />
      </Campo>,
    )

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveClass("campo", "w-full", "text-cuerpo")
    expect(screen.getByText("Título")).toHaveClass("text-cuerpo", "font-semibold")
    expect(screen.getByText("Como lo dice la fuente.")).toHaveClass("text-meta", "text-apagado")
  })
})
```

Append to the `describe("CasillasCodigo")` of `tests/unit/casillas-codigo.test.tsx`:

```tsx
  it("sinks each box like Conidolly's code boxes and marks a wrong code on every box", () => {
    render(<CasillasCodigo alCompletar={() => undefined} invalido />)

    for (const casilla of casillas()) {
      expect(casilla).toHaveClass("campo", "rounded-bloque", "text-pieza", "tabular-nums")
      expect(casilla).toHaveAttribute("aria-invalid", "true")
    }
  })
```

- [ ] **Step 2: Run them and see them fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/campo.test.tsx tests/unit/casillas-codigo.test.tsx`
Expected: FAIL, `Expected the element to have class: campo`.

- [ ] **Step 3: Minimal implementation.** In `components/campo.tsx` replace the constant:

```ts
/** Classes of the text fields: Conidolly's sunken `.campo` (app/globals.css), 3.25rem tall for a thumb. */
export const CLASES_DE_CAMPO = "campo w-full text-cuerpo"
```

(The label already reads `text-cuerpo font-semibold` and the hint `text-meta text-apagado` after Task 7.)

In `components/casillas-codigo.tsx` replace the `className` of the `<input>`:

```tsx
          className="campo h-[4rem] w-full rounded-bloque px-0 text-center text-pieza text-tinta tabular-nums"
```

(The invalid state is drawn by `.campo[aria-invalid="true"]`, already set on each box.)

- [ ] **Step 4: Run them and see them pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/campo.test.tsx tests/unit/casillas-codigo.test.tsx && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write components/campo.tsx components/casillas-codigo.tsx tests/unit/campo.test.tsx tests/unit/casillas-codigo.test.tsx
head -1 components/casillas-codigo.tsx   # "use client"
git add components/campo.tsx components/casillas-codigo.tsx tests/unit/campo.test.tsx tests/unit/casillas-codigo.test.tsx
git commit -m "$(cat <<'EOF'
Sink Ingesta's fields and code boxes like Conidolly's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 11: the main navigation and the material card in Soft UI

**Files:**
- Modify: `INGESTA/components/navegacion-principal.tsx`, `INGESTA/app/(app)/tarjeta-de-material.tsx`
- Test: `INGESTA/tests/unit/navegacion-principal.test.tsx`, `INGESTA/tests/unit/tarjeta-de-material.test.tsx`

- [ ] **Step 1: Write the failing tests.** Append to `tests/unit/navegacion-principal.test.tsx`:

```tsx
  it("is Conidolly's segmented control: a sunken track and the current section raised", () => {
    render(<NavegacionPrincipal actual="temas" rol="coni" />)

    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveClass("bg-piedra-honda", "shadow-hundido")
    expect(screen.getByRole("link", { name: "Temas" })).toHaveClass(
      "bg-piedra",
      "shadow-relieve",
      "font-semibold",
      "min-h-objetivo",
      "rounded-control",
    )
    expect(screen.getByRole("link", { name: "Autores" })).toHaveClass("text-apagado")
    expect(screen.getByRole("link", { name: "Autores" }).className).not.toMatch(/shadow-relieve/)
  })
```

Append inside the top-level `describe` of `tests/unit/tarjeta-de-material.test.tsx`:

```tsx
  it("sits on a raised stone card, Conidolly's surface, without a border", () => {
    const { container } = render(<TarjetaDeMaterial material={material()} />)

    const tarjeta = container.querySelector("li")
    expect(tarjeta).toHaveClass("rounded-panel", "bg-piedra", "shadow-relieve")
    expect(tarjeta).not.toHaveClass("border")
  })
```

- [ ] **Step 2: Run them and see them fail.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/navegacion-principal.test.tsx tests/unit/tarjeta-de-material.test.tsx`
Expected: FAIL: the nav has `flex flex-wrap gap-1.5` only; the card has `border border-hilo bg-piedra-alta`.

- [ ] **Step 3: Minimal implementation.** Replace the `return (...)` of `NavegacionPrincipal` with:

```tsx
  return (
    <nav aria-label="Secciones" className="flex flex-wrap gap-1 rounded-panel bg-piedra-honda p-1 shadow-hundido">
      {visibles.map((seccion) => (
        <Link
          key={seccion.clave}
          href={seccion.ruta}
          aria-current={seccion.clave === actual ? "page" : undefined}
          className={cn(
            "flex min-h-objetivo min-w-0 flex-auto items-center justify-center rounded-control px-3 text-meta",
            "transition-shadow duration-[var(--dur-corta)] ease-salida",
            seccion.clave === actual ? "bg-piedra font-semibold text-tinta shadow-relieve" : "font-medium text-apagado",
          )}
        >
          {seccion.texto}
        </Link>
      ))}
      {conidolly ? (
        <a
          href={conidolly}
          className="flex min-h-objetivo min-w-0 flex-auto items-center justify-center rounded-control px-3 text-meta font-medium text-tinta underline decoration-1 underline-offset-4"
        >
          Volver a Conidolly
        </a>
      ) : null}
    </nav>
  )
```

In `app/(app)/tarjeta-de-material.tsx` replace the `<li>`'s className:

```tsx
    <li className="grid gap-1.5 rounded-panel bg-piedra p-4 shadow-relieve">
```

- [ ] **Step 4: Run them and see them pass.**

Run: `cd INGESTA && pnpm exec vitest run tests/unit/navegacion-principal.test.tsx tests/unit/tarjeta-de-material.test.tsx && pnpm test:run && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd INGESTA && pnpm exec biome check --write components/navegacion-principal.tsx "app/(app)/tarjeta-de-material.tsx" tests/unit/navegacion-principal.test.tsx tests/unit/tarjeta-de-material.test.tsx
git add components/navegacion-principal.tsx "app/(app)/tarjeta-de-material.tsx" tests/unit/navegacion-principal.test.tsx tests/unit/tarjeta-de-material.test.tsx
git commit -m "$(cat <<'EOF'
Draw the main navigation and the material card in Soft UI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 12: Ingesta's style check in the browser and the full gate

**Files:**
- Create: `INGESTA/tests/e2e/estilo.spec.ts`

- [ ] **Step 1: Write the browser check.** Create `tests/e2e/estilo.spec.ts`:

```ts
import { expect, test } from "@playwright/test"

test("the text is set in Geist, one family, as in Conidolly", async ({ page }) => {
  await page.goto("/")
  const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(familia).toMatch(/Geist/i)
  expect(familia).not.toMatch(/Hanken|Young/i)
})

test("the app stays on Conidolly's stone even when the phone is in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(235, 235, 234)")
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light")
})

test("the sign-in page explains a used Biblioteca link and still offers both sign-ins", async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await contexto.newPage()

  await page.goto("/ingreso?puente=vencido")

  await expect(page.getByRole("status")).toHaveText(
    "El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez.",
  )
  await expect(page.getByRole("button", { name: "Soy Coni" })).toBeVisible()
  await contexto.close()
})
```

- [ ] **Step 2: Run the whole E2E** (builds the app; the new spec runs in the `app` project, signed in as Coni).

Run: `cd INGESTA && pnpm test:e2e`
Expected: every spec PASS, including the 3 of `estilo.spec.ts`. The run rewrites `docs/capturas/*.png` with the new look; do not commit them in this task.

- [ ] **Step 3: Full gate.**

Run: `cd INGESTA && pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build`
Expected: all green.

- [ ] **Step 4: Commit the spec only.**

```bash
cd INGESTA && pnpm exec biome check --write tests/e2e/estilo.spec.ts
git add tests/e2e/estilo.spec.ts
git commit -m "$(cat <<'EOF'
Check Geist, the light stone and the expired-link message in the browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 13: Ingesta's visual baselines, after a person looks

**Files:**
- Modify: `INGESTA/docs/capturas/ingesta-autores.png`, `ingesta-ficha.png`, `ingesta-mapa.png`, `ingesta-materiales.png`, `ingesta-semana.png`, `ingesta-subir.png`, `ingesta-temas.png`

- [ ] **Step 1: Show the captures to Federico.** `git -C INGESTA status --short docs/capturas` lists the seven PNGs rewritten by Task 12. For each one save the old version with `git -C INGESTA show HEAD:docs/capturas/<name>.png > <scratchpad>/antes-<name>.png`, look at both with the Read tool, and show Federico the before and after of each screen. **STOP here until Federico says they look right.** If he flags a screen, fix the class in that screen (with a test if the fix is in a base piece), rerun `pnpm test:e2e`, and show him again.
- [ ] **Step 2: Commit the baselines on their own.**

```bash
cd INGESTA && git add docs/capturas/*.png
git commit -m "$(cat <<'EOF'
Regenerate the screen captures with Conidolly's style

Reviewed by Federico before this commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part B: Conidolly (`CONIDOLLY`)

### Task 14: `abrirPuente`, the one place that calls `generateLink`

**Files:**
- Create: `CONIDOLLY/lib/sesion/puente.ts`
- Test: `CONIDOLLY/tests/unit/puente.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/puente.test.ts` (jsdom: `DOMParser` reads the page without running its script):

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AdminDelPuente, abrirPuente, TEXTO_FALLO_DEL_PUENTE } from "@/lib/sesion/puente"

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
const CORREO = "coni@estudio.test"

function adminQueDa(hashedToken: string): AdminDelPuente & { generateLink: ReturnType<typeof vi.fn> } {
  return {
    generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: hashedToken } }, error: null })),
  }
}

function leer(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

async function paginaPara(urlDeIngesta: string, token = TOKEN): Promise<{ html: string; doc: Document }> {
  const puente = await abrirPuente({ admin: adminQueDa(token), correo: CORREO, urlDeIngesta })
  if (puente.tipo !== "formulario") throw new Error("Se esperaba la página del puente")
  return { html: puente.html, doc: leer(puente.html) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("abrirPuente", () => {
  it("mints a magic link for Coni's own address and nobody else's", async () => {
    const admin = adminQueDa(TOKEN)

    await abrirPuente({ admin, correo: CORREO, urlDeIngesta: "https://ingesta.example" })

    expect(admin.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: CORREO })
  })

  it("puts the token only in the body of a POST form to Ingesta's bridge, never in its address", async () => {
    const { html, doc } = await paginaPara("https://ingesta.example")

    const formulario = doc.querySelector("form")
    expect(formulario?.getAttribute("method")).toBe("post")
    expect(formulario?.getAttribute("action")).toBe("https://ingesta.example/ingreso/puente")
    const campo = doc.querySelector('input[name="token_hash"]')
    expect(campo?.getAttribute("type")).toBe("hidden")
    expect(campo?.getAttribute("value")).toBe(TOKEN)
    expect(html.split(TOKEN)).toHaveLength(2)
  })

  it.each(["https://ingesta.example/", "https://ingesta.example/otra/ruta"])(
    "aims at the bridge whatever path INGESTA_URL carries (%s)",
    async (url) => {
      const { doc } = await paginaPara(url)
      expect(doc.querySelector("form")?.getAttribute("action")).toBe("https://ingesta.example/ingreso/puente")
    },
  )

  it("submits itself, and offers a button for a browser without JavaScript", async () => {
    const { doc } = await paginaPara("https://ingesta.example")

    expect(doc.querySelector('button[type="submit"]')?.textContent).toBe("Abrir la Biblioteca")
    expect(doc.querySelector("script")?.textContent).toContain('getElementById("puente").submit()')
    expect(doc.documentElement.getAttribute("lang")).toBe("es-CL")
  })

  it("escapes the token so it can never close its attribute", async () => {
    const raro = '"><script>alert(1)</script>'
    const { doc } = await paginaPara("https://ingesta.example", raro)

    expect(doc.querySelectorAll("script")).toHaveLength(1)
    expect(doc.querySelector('input[name="token_hash"]')?.getAttribute("value")).toBe(raro)
  })

  it.each([undefined, "", "no es una url", "ftp://ingesta.example"])(
    "fails without minting a link when INGESTA_URL is %j",
    async (urlDeIngesta) => {
      const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
      const admin = adminQueDa(TOKEN)

      expect(await abrirPuente({ admin, correo: CORREO, urlDeIngesta })).toEqual({ tipo: "fallo" })
      expect(admin.generateLink).not.toHaveBeenCalled()
      expect(registro).toHaveBeenCalledTimes(1)
    },
  )

  it("fails without minting a link when the session carries no address", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin = adminQueDa(TOKEN)

    expect(await abrirPuente({ admin, correo: null, urlDeIngesta: "https://ingesta.example" })).toEqual({
      tipo: "fallo",
    })
    expect(admin.generateLink).not.toHaveBeenCalled()
  })

  it("maps a generateLink error to the plain failure, logging the cause for WAV", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin: AdminDelPuente = {
      generateLink: vi.fn(async () => ({
        data: { properties: null },
        error: { message: "User not found", status: 404, code: "user_not_found" },
      })),
    }

    expect(await abrirPuente({ admin, correo: CORREO, urlDeIngesta: "https://ingesta.example" })).toEqual({
      tipo: "fallo",
    })
    expect(registro).toHaveBeenCalledWith("No pude generar el enlace de la Biblioteca", {
      status: 404,
      code: "user_not_found",
      mensaje: "User not found",
    })
  })

  it("says the failure in plain Spanish", () => {
    expect(TEXTO_FALLO_DEL_PUENTE).toBe("No pude abrir la Biblioteca. Vuelve a intentarlo en un momento.")
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/puente.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/sesion/puente"`.

- [ ] **Step 3: Minimal implementation.** Create `lib/sesion/puente.ts`:

```ts
import type { AuthError } from "@supabase/supabase-js"

type RespuestaDelEnlace = {
  data: { properties: { hashed_token: string } | null }
  error: Pick<AuthError, "message" | "status" | "code"> | null
}

/** The one call of the Auth admin API the bridge needs; a test passes a fake. */
export interface AdminDelPuente {
  generateLink(args: { type: "magiclink"; email: string }): PromiseLike<RespuestaDelEnlace>
}

export interface DepsDelPuente {
  admin: AdminDelPuente
  /** Coni's address, from her own session: the link only ever signs in the person who asked for it. */
  correo: string | null
  urlDeIngesta: string | undefined
}

export type Puente = { tipo: "formulario"; html: string } | { tipo: "fallo" }

export const RUTA_DE_FALLO_DEL_PUENTE = "/biblioteca-no-abrio"
export const TEXTO_FALLO_DEL_PUENTE = "No pude abrir la Biblioteca. Vuelve a intentarlo en un momento."
const RUTA_DEL_PUENTE_EN_INGESTA = "/ingreso/puente"

function destinoDelPuente(urlDeIngesta: string | undefined): string | null {
  if (!urlDeIngesta || !URL.canParse(urlDeIngesta)) return null
  const base = new URL(urlDeIngesta)
  if (base.protocol !== "https:" && base.protocol !== "http:") return null
  return new URL(RUTA_DEL_PUENTE_EN_INGESTA, base).toString()
}

const escapar = (texto: string) =>
  texto.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** A form that posts the token to Ingesta and submits itself; the button is for a browser without JavaScript. */
function paginaDelPuente(accion: string, token: string): string {
  return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex">
<title>Abriendo la Biblioteca</title>
</head>
<body>
<form id="puente" method="post" action="${escapar(accion)}">
<input type="hidden" name="token_hash" value="${escapar(token)}">
<p>Abriendo la Biblioteca…</p>
<button type="submit">Abrir la Biblioteca</button>
</form>
<script>document.getElementById("puente").submit()</script>
</body>
</html>`
}

/**
 * The Biblioteca tab (change 29a, spec 2026-11-02-biblioteca-misma-sesion-design.md): a one-time login link for Coni,
 * minted with the service role (`generateLink` sends no email, B11) and carried to Ingesta in a POST body, so the token
 * never reaches a URL, a log line or a referrer. The only function that calls `generateLink`.
 */
export async function abrirPuente(deps: DepsDelPuente): Promise<Puente> {
  const accion = destinoDelPuente(deps.urlDeIngesta)
  if (!accion) {
    console.error("Falta INGESTA_URL o no es una dirección http(s): la Biblioteca no se puede abrir.")
    return { tipo: "fallo" }
  }
  if (!deps.correo) {
    console.error("La sesión de Coni no trae su correo: la Biblioteca no se puede abrir.")
    return { tipo: "fallo" }
  }
  const { data, error } = await deps.admin.generateLink({ type: "magiclink", email: deps.correo })
  if (error || !data.properties) {
    console.error("No pude generar el enlace de la Biblioteca", {
      status: error?.status,
      code: error?.code,
      mensaje: error?.message,
    })
    return { tipo: "fallo" }
  }
  return { tipo: "formulario", html: paginaDelPuente(accion, data.properties.hashed_token) }
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/puente.test.ts && pnpm type`
Expected: PASS (13 tests); `tsc` clean.

- [ ] **Step 5: Commit.**

```bash
cd CONIDOLLY && pnpm exec biome check --write lib/sesion/puente.ts tests/unit/puente.test.ts
git add lib/sesion/puente.ts tests/unit/puente.test.ts
git commit -m "$(cat <<'EOF'
Add abrirPuente: Coni's one-time Biblioteca link in a self-posting form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 15: the route `GET /ir-a-biblioteca` and `INGESTA_URL`

**Files:**
- Create: `CONIDOLLY/app/ir-a-biblioteca/route.ts`
- Modify: `CONIDOLLY/lib/sesion/coni.ts`, `CONIDOLLY/lib/sesion/rutas.ts`, `CONIDOLLY/.env.example`
- Test: `CONIDOLLY/tests/unit/ir-a-biblioteca.test.ts` (new)

- [ ] **Step 1: Write the failing test.** Create `tests/unit/ir-a-biblioteca.test.ts` (mirrors `tests/unit/rutas-linkedin.test.ts`):

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const leerSesion = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
vi.mock("@/lib/sesion/coni", () => ({ leerSesion }))
vi.mock("@/lib/acciones/servidor", () => ({ clienteDeServicio: () => ({ auth: { admin: { generateLink } } }) }))

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
const CONI = { estado: "coni", db: {}, userId: "c0000000-0000-4000-8000-000000000001", correo: "coni@estudio.test" }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  leerSesion.mockReset()
  generateLink.mockReset()
})

describe("/ir-a-biblioteca", () => {
  it("sends someone without a session to sign in, without minting anything", async () => {
    leerSesion.mockResolvedValue({ estado: "sin_sesion" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/ingreso")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("refuses anyone who is not Coni, the maintainer included: back to the app, no link", async () => {
    leerSesion.mockResolvedValue({ estado: "otra_persona" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("answers Coni the page that posts her token to Ingesta, never cached and never referred", async () => {
    vi.stubEnv("INGESTA_URL", "https://ingesta.example")
    leerSesion.mockResolvedValue(CONI)
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: TOKEN } }, error: null })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(respuesta.headers.get("referrer-policy")).toBe("no-referrer")
    expect(respuesta.headers.get("location")).toBeNull()
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "coni@estudio.test" })
    const html = await respuesta.text()
    expect(html).toContain('action="https://ingesta.example/ingreso/puente"')
    expect(html).toContain(`value="${TOKEN}"`)
  })

  it("sends Coni to the plain failure page when INGESTA_URL is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    leerSesion.mockResolvedValue(CONI)
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/biblioteca-no-abrio")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("sends Coni to the failure page when the link cannot be made", async () => {
    vi.stubEnv("INGESTA_URL", "https://ingesta.example")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    leerSesion.mockResolvedValue(CONI)
    generateLink.mockResolvedValue({ data: { properties: null }, error: { message: "boom", status: 500 } })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    expect((await GET()).headers.get("location")).toBe("/biblioteca-no-abrio")
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/ir-a-biblioteca.test.ts`
Expected: FAIL, `Failed to resolve import "@/app/ir-a-biblioteca/route"`.

- [ ] **Step 3: Minimal implementation.**

In `lib/sesion/rutas.ts` add after `RUTA_DE_INGRESO`:

```ts
/** The Biblioteca tab: a route handler that leaves the app for Ingesta (change 29a). */
export const RUTA_DE_LA_BIBLIOTECA = "/ir-a-biblioteca"
```

In `lib/sesion/coni.ts` carry the address in the `coni` state:

```ts
export type SesionLeida =
  | { estado: "coni"; db: Awaited<ReturnType<typeof createClient>>; userId: string; correo: string | null }
  | { estado: "sin_sesion" }
  | { estado: "otra_persona" }
```

and

```ts
  return esConi
    ? { estado: "coni", db, userId: data.user.id, correo: data.user.email ?? null }
    : { estado: "otra_persona" }
```

Create `app/ir-a-biblioteca/route.ts` (outside `(app)`: it renders no shell):

```ts
import { clienteDeServicio } from "@/lib/acciones/servidor"
import { leerSesion } from "@/lib/sesion/coni"
import { abrirPuente, RUTA_DE_FALLO_DEL_PUENTE } from "@/lib/sesion/puente"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

export const dynamic = "force-dynamic"

// The Biblioteca tab (change 29a). The service role is used here only, behind Coni's own session, to mint a link that
// signs in Coni herself (lib/sesion/puente.ts).
export async function GET() {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") return irA(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return irA("/")

  const puente = await abrirPuente({
    admin: clienteDeServicio().auth.admin,
    correo: sesion.correo,
    urlDeIngesta: process.env.INGESTA_URL,
  })
  if (puente.tipo === "fallo") return irA(RUTA_DE_FALLO_DEL_PUENTE)
  return new Response(puente.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  })
}
```

Append to `.env.example`:

```
# Ingesta's address (the Biblioteca tab posts Coni's one-time sign-in there). Vercel production and preview:
# https://conidolly-ingesta.vercel.app. Without it the tab opens the "No pude abrir la Biblioteca" page.
INGESTA_URL=
```

- [ ] **Step 4: Run it and see it pass, with the types.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/ir-a-biblioteca.test.ts && pnpm type`
Expected: PASS (5 tests); `tsc` clean (`clienteDeServicio().auth.admin` satisfies `AdminDelPuente`). If `tsc` flags a literal `SesionLeida` built somewhere without `correo`, add `correo` there.

- [ ] **Step 5: Commit.**

```bash
cd CONIDOLLY && pnpm exec biome check --write app/ir-a-biblioteca/route.ts lib/sesion/coni.ts lib/sesion/rutas.ts tests/unit/ir-a-biblioteca.test.ts
git add app/ir-a-biblioteca/route.ts lib/sesion/coni.ts lib/sesion/rutas.ts tests/unit/ir-a-biblioteca.test.ts .env.example
git commit -m "$(cat <<'EOF'
Add /ir-a-biblioteca: Coni's session goes to Ingesta through a self-posting form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 16: the failure page

**Files:**
- Create: `CONIDOLLY/app/(app)/biblioteca-no-abrio/page.tsx`
- Test: `CONIDOLLY/tests/unit/biblioteca-no-abrio.test.tsx` (new)

- [ ] **Step 1: Write the failing test.** Create `tests/unit/biblioteca-no-abrio.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import BibliotecaNoAbrio from "@/app/(app)/biblioteca-no-abrio/page"

describe("the page when the Biblioteca does not open", () => {
  it("says so in plain Spanish and offers to try again or go to Inicio", () => {
    render(<BibliotecaNoAbrio />)

    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeInTheDocument()
    expect(document.body.textContent).toContain("No pude abrir la Biblioteca.")
    expect(document.body.textContent).toContain("Vuelve a intentarlo en un momento.")
    expect(screen.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", "/ir-a-biblioteca")
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })
})
```

- [ ] **Step 2: Run it and see it fail.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/biblioteca-no-abrio.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/biblioteca-no-abrio/page"`.

- [ ] **Step 3: Minimal implementation.** Create `app/(app)/biblioteca-no-abrio/page.tsx` (the `(app)` layout already gates it to Coni):

```tsx
import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { RUTA_DE_LA_BIBLIOTECA } from "@/lib/sesion/rutas"

// Where /ir-a-biblioteca sends Coni when it cannot mint her link; the cause is already in the server log.
export default function BibliotecaNoAbrio() {
  return (
    <div className="grid gap-6 pt-6">
      <h1 className="text-pantalla">Biblioteca</h1>
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">No pude abrir la Biblioteca.</strong>}
        tituloEnTinta
        detalle="Vuelve a intentarlo en un momento."
      />
      <div className="grid gap-2">
        {/* A plain link: a Next <Link> would prefetch the route handler and mint a link on every render. */}
        <a href={RUTA_DE_LA_BIBLIOTECA} className={clasesDeBoton({ variante: "primario" })}>
          Volver a intentar
        </a>
        <Link href="/" className={clasesDeBoton({ variante: "callado" })}>
          Ir a Inicio
        </Link>
      </div>
    </div>
  )
}
```

The two sentences of `TEXTO_FALLO_DEL_PUENTE` are split between the title and the detail on purpose (the error block's shape); the unit test checks both.

- [ ] **Step 4: Run it and see it pass.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/biblioteca-no-abrio.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd CONIDOLLY && pnpm exec biome check --write "app/(app)/biblioteca-no-abrio/page.tsx" tests/unit/biblioteca-no-abrio.test.tsx
git add "app/(app)/biblioteca-no-abrio/page.tsx" tests/unit/biblioteca-no-abrio.test.tsx
git commit -m "$(cat <<'EOF'
Add the plain page for when the Biblioteca does not open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 17: the 4th tab, and the bar's baselines

**Files:**
- Modify: `CONIDOLLY/components/nav-inferior.tsx`, `CONIDOLLY/tests/unit/nav-inferior.test.tsx`, `CONIDOLLY/tests/e2e/letra-grande.spec.ts`
- Modify (own commit): `CONIDOLLY/tests/e2e/visual.spec.ts-snapshots/*.png`

- [ ] **Step 1: Write the failing test.** In `tests/unit/nav-inferior.test.tsx` replace the first test with:

```tsx
  it("has the four tabs of the design, the Biblioteca last", () => {
    render(<NavInferior />)

    const enlaces = screen.getAllByRole("link").map((enlace) => enlace.textContent)

    expect(enlaces).toEqual(["Inicio", "Métricas", "Ajustes", "Biblioteca"])
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveClass("grid-cols-4")
  })

  it("leaves the app for the Biblioteca and never marks it current", () => {
    usePathname.mockReturnValue("/ir-a-biblioteca")
    render(<NavInferior />)

    const biblioteca = screen.getByRole("link", { name: "Biblioteca" })
    expect(biblioteca).toHaveAttribute("href", "/ir-a-biblioteca")
    expect(biblioteca).not.toHaveAttribute("aria-current")
    expect(biblioteca).toHaveClass("text-apagado", "min-h-nav")
  })
```

In `tests/e2e/letra-grande.spec.ts` change the first test's title to `"at large text the nav sits after the content in one compact row of four tabs that keep their labels, 44 px or more"`, both `["Inicio", "Métricas", "Ajustes"]` lists to `["Inicio", "Métricas", "Ajustes", "Biblioteca"]`, and the comment `the three tabs share a top` to `the four tabs share a top`.

- [ ] **Step 2: Run the unit test and see it fail.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/nav-inferior.test.tsx`
Expected: FAIL, `expected [ 'Inicio', 'Métricas', 'Ajustes' ] to deeply equal [ ..., 'Biblioteca' ]`.

- [ ] **Step 3: Minimal implementation.** Replace `components/nav-inferior.tsx` with:

```tsx
"use client"

import { Books, ChartBar, GearSix, House } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ICONO } from "@/components/ui/icono"
import { RUTA_DE_LA_BIBLIOTECA } from "@/lib/sesion/rutas"
import { cn } from "@/lib/utils"

// `sale`: the tab leaves the app (the Biblioteca lives in Ingesta until stage 2, #17). It is a plain link: a Next
// <Link> would prefetch the route handler and mint a sign-in link on every render of this bar.
const PESTANAS = [
  { href: "/", etiqueta: "Inicio", icono: House, sale: false },
  { href: "/metricas", etiqueta: "Métricas", icono: ChartBar, sale: false },
  { href: "/ajustes", etiqueta: "Ajustes", icono: GearSix, sale: false },
  { href: RUTA_DE_LA_BIBLIOTECA, etiqueta: "Biblioteca", icono: Books, sale: true },
] as const

// Ideas and Calendario hang from Inicio: they have no tab of their own, so Inicio stays current on them.
const RUTAS_QUE_CUELGAN_DE_INICIO = ["/ideas", "/calendario"]

function estaActiva(ruta: string, pestana: (typeof PESTANAS)[number]): boolean {
  if (pestana.sale) return false
  if (pestana.href === "/") {
    return ruta === "/" || RUTAS_QUE_CUELGAN_DE_INICIO.some((raiz) => ruta === raiz || ruta.startsWith(`${raiz}/`))
  }
  return ruta === pestana.href || ruta.startsWith(`${pestana.href}/`)
}

// On the screens that sign something, the sign bar takes the bottom of the screen.
const RUTAS_DE_DETALLE = ["/guion/", "/video/"]

/** Decision 4: a raised bar on piedra; the current tab is a sunken honda pill, "where you are", not an action. */
export function NavInferior() {
  const ruta = usePathname()
  if (RUTAS_DE_DETALLE.some((prefijo) => ruta.startsWith(prefijo))) return null

  return (
    <nav
      aria-label="Secciones"
      className="nav-inferior sticky bottom-0 z-10 grid grid-cols-4 gap-2 rounded-t-panel bg-piedra px-[14px] pt-2 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-relieve-fijo md:top-0 md:bottom-auto md:rounded-t-none md:rounded-b-panel md:pb-2"
    >
      {PESTANAS.map((pestana) => {
        const activa = estaActiva(ruta, pestana)
        const Icono = pestana.icono
        const clases = cn(
          "grid min-h-nav content-center justify-items-center gap-0.5 rounded-control py-2 text-meta transition-shadow duration-[var(--dur-corta)] ease-salida",
          activa ? "bg-piedra-honda font-semibold text-tinta shadow-hundido" : "font-medium text-apagado",
        )
        const contenido = (
          <>
            <Icono aria-hidden="true" size={ICONO.grande} />
            <span className="nav-etiqueta">{pestana.etiqueta}</span>
          </>
        )
        return pestana.sale ? (
          <a key={pestana.href} href={pestana.href} className={clases}>
            {contenido}
          </a>
        ) : (
          <Link key={pestana.href} href={pestana.href} aria-current={activa ? "page" : undefined} className={clases}>
            {contenido}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run the unit tests, then the large-text E2E at 390 px.**

Run: `cd CONIDOLLY && pnpm exec vitest run tests/unit/nav-inferior.test.tsx && pnpm test:e2e tests/e2e/letra-grande.spec.ts`
Expected: unit PASS (9 tests); E2E PASS, including "no screen scrolls sideways at large text on a 390 px phone". If the large-text nav test fails because "Biblioteca" wraps or the row overflows, add to `app/globals.css`, right after the `html[data-letra="grande"] .nav-inferior a` rule:

```css
/* Four tabs at large text: a little less gutter so "Biblioteca" keeps one line at 375 px. */
html[data-letra="grande"] .nav-inferior {
  gap: var(--e-1);
  padding-inline: var(--e-2);
}
```

and run the E2E again until it passes.

- [ ] **Step 5: Check the bar at 375 px and on the desktop top bar by eye.** With `pnpm dev` running and signed in as Coni (local), open `/` at 375 x 812 and at 1024 x 768 (Browser pane `resize_window`), screenshot both and confirm: four tabs on one row, labels whole, Biblioteca never highlighted, the desktop bar at the top with four equal columns. Reset the viewport to desktop afterwards.

- [ ] **Step 6: Commit the code.**

```bash
cd CONIDOLLY && pnpm exec biome check --write components/nav-inferior.tsx tests/unit/nav-inferior.test.tsx tests/e2e/letra-grande.spec.ts app/globals.css
head -1 components/nav-inferior.tsx   # "use client"
git add components/nav-inferior.tsx tests/unit/nav-inferior.test.tsx tests/e2e/letra-grande.spec.ts app/globals.css
git commit -m "$(cat <<'EOF'
Add the Biblioteca as the fourth tab of the bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Regenerate the visual baselines after a person looks.**

Run: `cd CONIDOLLY && pnpm test:e2e tests/e2e/visual.spec.ts`
Expected: FAIL on every screen with the bar (the bar now has four tabs). Open the diffs in `test-results/` (`*-diff.png`) and show Federico the bar before and after on Inicio, Métricas and Ajustes. **STOP until Federico says they look right.** Then:

```bash
cd CONIDOLLY && pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots && pnpm test:e2e tests/e2e/visual.spec.ts
git add tests/e2e/visual.spec.ts-snapshots
git commit -m "$(cat <<'EOF'
Regenerate the visual baselines for the four-tab bar

Reviewed by Federico before this commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: the second run PASS.

### Task 18: integration test, `generateLink` sends no email (B11)

**Files:**
- Create: `CONIDOLLY/tests/integration/puente-biblioteca.test.ts`

- [ ] **Step 1: Write the test.** Create `tests/integration/puente-biblioteca.test.ts`:

```ts
import { http, passthrough } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { abrirPuente } from "@/lib/sesion/puente"
import { servidor } from "../msw"
import { clienteDeServicio } from "./servicio"
import { clienteAnonimoDePrueba } from "./sesion-coni"

const CORREO_DE_CONI = "coni@estudio.test"
// The local mail catcher of the stack (supabase/config.toml); never a real mailbox.
const BUZON = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424"

beforeEach(() => {
  // MSW refuses unknown hosts in tests: the local mail catcher is let through like the local Supabase.
  servidor.use(http.all(`${BUZON}/*`, () => passthrough()))
})

async function correosPara(correo: string): Promise<number> {
  const respuesta = await fetch(`${BUZON}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)
  if (!respuesta.ok) throw new Error(`No pude leer el buzón local: ${respuesta.status}`)
  return z.object({ messages_count: z.number() }).parse(await respuesta.json()).messages_count
}

async function tokenDelPuente(): Promise<string> {
  const puente = await abrirPuente({
    admin: clienteDeServicio().auth.admin,
    correo: CORREO_DE_CONI,
    urlDeIngesta: "http://localhost:3300",
  })
  if (puente.tipo !== "formulario") throw new Error("El puente falló contra el Supabase local")
  const token = /name="token_hash" value="([^"]+)"/.exec(puente.html)?.[1]
  if (!token) throw new Error("La página del puente no trae el token")
  return token
}

describe("the Biblioteca bridge against the local Supabase (B11)", () => {
  it("mints Coni's token without sending her an email", async () => {
    const antes = await correosPara(CORREO_DE_CONI)

    await tokenDelPuente()
    // Give the mail catcher the time a real send would take to land.
    await new Promise((resolver) => setTimeout(resolver, 1500))

    expect(await correosPara(CORREO_DE_CONI)).toBe(antes)
  })

  it("opens Coni's session once with verifyOtp type email, and refuses the same token again", async () => {
    const token = await tokenDelPuente()

    const primera = await clienteAnonimoDePrueba().auth.verifyOtp({ token_hash: token, type: "email" })
    expect(primera.error).toBeNull()
    expect(primera.data.user?.email).toBe(CORREO_DE_CONI)

    const segunda = await clienteAnonimoDePrueba().auth.verifyOtp({ token_hash: token, type: "email" })
    expect(segunda.error?.status).toBe(403)
    expect(segunda.error?.code).toBe("otp_expired")
  })
})
```

- [ ] **Step 2: Run it.** The code exists (Task 14), so this pins the external behaviour and passes on the first run.

Run: `cd CONIDOLLY && pnpm test:db tests/integration/puente-biblioteca.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Prove the email check can fail.** Temporarily add, at the start of the first test after `antes`, `await clienteAnonimoDePrueba().auth.signInWithOtp({ email: CORREO_DE_CONI, options: { shouldCreateUser: false } })`; run the same command; expect FAIL (`expected N+1 to be N`). Remove the line and run again: PASS.

- [ ] **Step 4: Commit.**

```bash
cd CONIDOLLY && pnpm exec biome check --write tests/integration/puente-biblioteca.test.ts
git add tests/integration/puente-biblioteca.test.ts
git commit -m "$(cat <<'EOF'
Pin that the Biblioteca link sends no email and opens Coni's session once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 19: E2E with both apps, and axe

**Files:**
- Modify: `CONIDOLLY/tests/e2e/entorno.ts`, `CONIDOLLY/tests/e2e/ayudas.ts`, `CONIDOLLY/playwright.config.ts`, `CONIDOLLY/package.json`
- Create: `CONIDOLLY/playwright.biblioteca.config.ts`, `CONIDOLLY/tests/e2e-biblioteca/biblioteca.spec.ts`

- [ ] **Step 1: Shared pieces.** In `tests/e2e/entorno.ts` append:

```ts
/**
 * Ingesta for the two-app run (playwright.biblioteca.config.ts). `localhost`, not 127.0.0.1: both apps name the
 * session cookie after the same local Supabase (`sb-127-auth-token`) and cookies ignore ports, so only a different host
 * gives each app its own jar, as the two vercel.app domains have in production.
 */
export const PUERTO_DE_INGESTA = Number(process.env.E2E_PUERTO_INGESTA ?? 3300)
export const URL_DE_INGESTA = `http://localhost:${PUERTO_DE_INGESTA}`
```

In `tests/e2e/ayudas.ts` let `entrarComo` sign in on another app without touching the cookies of this one:

```ts
/** Signs a seed user in through the real Auth API and gives the browser the cookies the app at `url` would have set. */
export async function entrarComo(context: BrowserContext, correo: string, url: string = URL_DE_LA_APP): Promise<void> {
```

and replace its last two lines with:

```ts
  await context.clearCookies({ domain: new URL(url).hostname })
  await context.addCookies([...galletas].map(([name, value]) => ({ name, value, url })))
```

In `playwright.config.ts` export the phone (add `export` before `const iphone`), import `URL_DE_INGESTA` from `./tests/e2e/entorno`, and add to the `env` of the Next server entry (the one whose `url` is `${URL_DE_LA_APP}/ingreso`):

```ts
        // The Biblioteca tab posts there; only playwright.biblioteca.config.ts starts an Ingesta to receive it.
        INGESTA_URL: URL_DE_INGESTA,
```

In `package.json` add to `scripts`:

```json
    "test:e2e:biblioteca": "playwright test --config playwright.biblioteca.config.ts",
```

Create `playwright.biblioteca.config.ts`:

```ts
import { join } from "node:path"
import { defineConfig } from "@playwright/test"
import base, { iphone } from "./playwright.config"
import {
  CLAVE_ANONIMA,
  CORREO_DE_CONI,
  CORREO_DEL_MANTENEDOR,
  PUERTO_DE_INGESTA,
  SUPABASE_URL,
  URL_DE_INGESTA,
  URL_DE_LA_APP,
} from "./tests/e2e/entorno"

// Conidolly's Biblioteca tab end to end: this app and an Ingesta checkout with the bridge, both against the local stack.
const DIRECTORIO_DE_INGESTA = process.env.E2E_INGESTA_DIR
if (!DIRECTORIO_DE_INGESTA) {
  throw new Error("Falta E2E_INGESTA_DIR: la ruta de un checkout de conidolly-ingesta con el puente (pnpm install hecho).")
}

export default defineConfig({
  ...base,
  testDir: "./tests/e2e-biblioteca",
  projects: [{ name: "biblioteca", use: iphone }],
  webServer: [
    ...[base.webServer ?? []].flat(),
    {
      command: `pnpm exec next build && node node_modules/next/dist/bin/next start -p ${PUERTO_DE_INGESTA}`,
      cwd: DIRECTORIO_DE_INGESTA,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      url: `${URL_DE_INGESTA}/ingreso`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: CLAVE_ANONIMA,
        CORREO_CONI: CORREO_DE_CONI,
        CORREO_WAV: CORREO_DEL_MANTENEDOR,
        CONIDOLLY_URL: URL_DE_LA_APP,
        // Nothing real is reachable from this run: Ingesta writes the runs it would start to a file.
        DISPARO_DE_PRUEBA: "1",
        DISPARO_DE_PRUEBA_ARCHIVO: join(process.cwd(), "test-results", "disparos-ingesta.jsonl"),
      },
    },
  ],
})
```

- [ ] **Step 2: Write the spec.** Create `tests/e2e-biblioteca/biblioteca.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"
import { entrarComo } from "../e2e/ayudas"
import { CORREO_DE_CONI, CORREO_DEL_MANTENEDOR, URL_DE_INGESTA, URL_DE_LA_APP } from "../e2e/entorno"

async function sinViolaciones(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(violations).toEqual([])
}

test("Coni taps Biblioteca and lands on Ingesta's Materiales signed in, replacing WAV's session there", async ({
  context,
  page,
}) => {
  // A shared computer: WAV left its Ingesta session open.
  await entrarComo(context, CORREO_DEL_MANTENEDOR, URL_DE_INGESTA)
  await entrarComo(context, CORREO_DE_CONI)
  const direcciones: string[] = []
  page.on("request", (pedido) => direcciones.push(pedido.url()))

  await page.goto("/")
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Biblioteca" }).click()

  await page.waitForURL(`${URL_DE_INGESTA}/`)
  await expect(page.getByRole("heading", { name: "Material de Coni" })).toBeVisible()
  // Only Coni sees the way back, and only WAV sees Datos: this is Coni's session, not WAV's.
  await expect(page.getByRole("link", { name: "Volver a Conidolly" })).toHaveAttribute("href", URL_DE_LA_APP)
  await expect(page.getByRole("link", { name: "Datos" })).toHaveCount(0)
  // The token travelled in a POST body: no address of the trip carries it.
  expect(direcciones.filter((direccion) => /token_hash|[0-9a-f]{56}/.test(direccion))).toEqual([])

  // Back in Conidolly, her session there is untouched.
  await page.getByRole("link", { name: "Volver a Conidolly" }).click()
  await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Inicio" })).toBeVisible()
})

test("a used or invalid token lands on Ingesta's sign-in with the message, which passes axe", async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await contexto.newPage()

  const respuesta = await page.request.post(`${URL_DE_INGESTA}/ingreso/puente`, {
    form: { token_hash: "0".repeat(56) },
    maxRedirects: 0,
  })
  expect(respuesta.status()).toBe(303)
  expect(respuesta.headers().location).toBe("/ingreso?puente=vencido")

  await page.goto(`${URL_DE_INGESTA}/ingreso?puente=vencido`)
  await expect(page.getByRole("status")).toHaveText(
    "El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez.",
  )
  await sinViolaciones(page)
  await contexto.close()
})

test("the failure page says what happened, offers the way forward and passes axe", async ({ context, page }) => {
  await entrarComo(context, CORREO_DE_CONI)

  await page.goto("/biblioteca-no-abrio")

  await expect(page.getByText("No pude abrir la Biblioteca.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", "/ir-a-biblioteca")
  await sinViolaciones(page)
})
```

- [ ] **Step 3: Run it.**

Run: `cd CONIDOLLY && E2E_INGESTA_DIR=/Users/fede/Projects/conidolly-ingesta/.worktrees/biblioteca-sesion pnpm test:e2e:biblioteca`
Expected: PASS (3 tests). It builds both apps (about 5 minutes). If the first test stops at `/ingreso?puente=vencido` on Ingesta, the token type or the cookie writing broke: check Task 4 first.

- [ ] **Step 4: Make sure the usual run did not change.**

Run: `cd CONIDOLLY && pnpm test:e2e`
Expected: PASS as before (the new folder is outside `tests/e2e`; the app server now has `INGESTA_URL`, unused by those specs).

- [ ] **Step 5: Commit.**

```bash
cd CONIDOLLY && pnpm exec biome check --write tests/e2e/entorno.ts tests/e2e/ayudas.ts playwright.config.ts playwright.biblioteca.config.ts tests/e2e-biblioteca/biblioteca.spec.ts package.json
git add tests/e2e/entorno.ts tests/e2e/ayudas.ts playwright.config.ts playwright.biblioteca.config.ts tests/e2e-biblioteca/biblioteca.spec.ts package.json
git commit -m "$(cat <<'EOF'
Add the two-app E2E of the Biblioteca tab, with axe on both messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 20: Conidolly's full gate

**Files:** none new.

- [ ] **Step 1: Run every check.**

Run: `cd CONIDOLLY && pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build && pnpm test:e2e && E2E_INGESTA_DIR=/Users/fede/Projects/conidolly-ingesta/.worktrees/biblioteca-sesion pnpm test:e2e:biblioteca`
Expected: all green.

- [ ] **Step 2: Grep the new code for the banned patterns.**

Run: `cd CONIDOLLY && git diff origin/main --name-only -- '*.ts' '*.tsx' | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|—|#[0-9a-fA-F]{6}\b|console\.[a-z]+\((html|token|puente)" ; cd /Users/fede/Projects/conidolly-ingesta/.worktrees/biblioteca-sesion && git diff origin/main --name-only -- '*.ts' '*.tsx' | xargs grep -nE "as any|@ts-expect-error|[a-zA-Z)\]]!\.|—|console\.[a-z]+\((leido|token|formulario|html)"`
Expected: no output (the only hex is in `globals.css` and `lib/diseno/marca.ts`, outside these globs or excluded by the tokens test). If something prints, fix it in the task it belongs to and rerun Step 1.

- [ ] **Step 3: Nothing to commit** unless Step 2 led to a fix (commit it with its task's message style).

### Task 21: review both branches

**Files:** none new.

- [ ] **Step 1: Request code review** of `feat/biblioteca-sesion` in both repos with superpowers:requesting-code-review, pointing the reviewer at the spec, this plan and these risks: the service role in a user route (`lib/sesion/puente.ts`, `app/ir-a-biblioteca/route.ts`), the token never in a URL, log or referrer, the cookie expiry in `app/ingreso/puente/route.ts`, and the rename map (P6).
- [ ] **Step 2: Address findings** test-first, one commit per finding, rerun Task 12 Step 3 and Task 20 Step 1.

---

# Part C: Release

### Task 22: ship Ingesta, then Conidolly

Standing release authorization (Federico, 01-11-2026) covers estudio-coni. Ingesta's `CLAUDE.md` still says "Nada de GitHub, Vercel ni Supabase alojado sin pedirlo": **ask Federico for the OK to push and deploy Ingesta before Step 2.** No migration, no Trigger deploy.

- [ ] **Step 1: Board, start.** Move issue #13 to **En Curso** (if it is not already):

```bash
ITEM=$(gh project item-list 1 --owner WAV-WaAreVision --format json --limit 200 | python3 -c "import json,sys; print(next(i['id'] for i in json.load(sys.stdin)['items'] if i.get('content',{}).get('number')==13 and i['content'].get('repository','').endswith('estudio-coni')))")
gh project item-edit --project-id PVT_kwDOEFiqEs4Bps25 --id "$ITEM" --field-id PVTSSF_lADOEFiqEs4Bps25zhoHPq4 --single-select-option-id 47fc9ee4
```

- [ ] **Step 2: Ingesta PR.**

```bash
cd INGESTA && git push -u origin feat/biblioteca-sesion
gh pr create -R WAV-WaAreVision/conidolly-ingesta --base main --head feat/biblioteca-sesion \
  --title "Bridge from Conidolly and Conidolly's style (change 29a)" --body "$(cat <<'BODY'
Part of WAV-WaAreVision/estudio-coni#13 (change 29a, stage 1).

- POST /ingreso/puente: verifies the one-time token Conidolly's Biblioteca tab posts (verifyOtp token_hash, type email), expires the previous session cookies, 303 to /; a used or expired token goes to /ingreso?puente=vencido with a plain message.
- decidirRuta lets the bridge through with or without a session.
- "Volver a Conidolly" for Coni only (new env var CONIDOLLY_URL).
- Conidolly's tokens, Geist and Soft UI on the button, fields, code boxes, main navigation and material card; every class renamed to Conidolly's names (rename map in the plan).
- Captures in docs/capturas regenerated after review.

Tests: unit, integration against the local Supabase (token works once), E2E. Conidolly's two-app E2E covers the whole trip.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
gh pr checks --watch -R WAV-WaAreVision/conidolly-ingesta
```

Expected: CI green (unit, lint, type, build). Then move #13 to **Para Revisar** (`--single-select-option-id df73e18b`, same command as Step 1).

- [ ] **Step 3: Ingesta env var and manual deploy.** After the PR is approved and merged:

```bash
cd /Users/fede/Projects/conidolly-ingesta && git checkout main && git pull --ff-only
printf 'https://conidolly.vercel.app' | vercel env add CONIDOLLY_URL production
printf 'https://conidolly.vercel.app' | vercel env add CONIDOLLY_URL preview
vercel deploy --prod --yes
```

(`CONIDOLLY_URL` is a public address, not a secret.) Verify it is served:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST -d token_hash=0 https://conidolly-ingesta.vercel.app/ingreso/puente
curl -s "https://conidolly-ingesta.vercel.app/ingreso?puente=vencido&v=$(date +%s)" | grep -c "El enlace ya se usó o venció"
curl -s "https://conidolly-ingesta.vercel.app/ingreso?v=$(date +%s)" | grep -c "geist"
```

Expected: `303 https://conidolly-ingesta.vercel.app/ingreso?puente=vencido`, then `1`, then a count of 1 or more. Wait 45 s and retry once if the alias still serves the old build.

- [ ] **Step 4: Conidolly env var, PR and merge.**

```bash
cd /Users/fede/Projects/estudio-coni
printf 'https://conidolly-ingesta.vercel.app' | vercel env add INGESTA_URL production
printf 'https://conidolly-ingesta.vercel.app' | vercel env add INGESTA_URL preview
cd CONIDOLLY && git push -u origin feat/biblioteca-sesion
gh pr create --base main --head feat/biblioteca-sesion \
  --title "Biblioteca tab with Coni's session (change 29a)" --body "$(cat <<'BODY'
Closes #13 (change 29a, stage 1). Ingesta side: WAV-WaAreVision/conidolly-ingesta (merged and deployed first).

- Fourth tab "Biblioteca" (plain link to /ir-a-biblioteca, never current).
- /ir-a-biblioteca: Coni only; generateLink magiclink with the service role (sends no email, pinned by an integration test); a self-posting form carries the hashed token to Ingesta's /ingreso/puente; no-store and no-referrer; the token never in a URL or a log.
- /biblioteca-no-abrio: plain failure page.
- New env var INGESTA_URL (set in Vercel production and preview).
- Visual baselines of the bar regenerated after review.

No migration, no Trigger deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
gh pr checks --watch
```

Expected: CI green. After the reviews approve: `gh pr merge --merge` (Vercel publishes `main` on its own).

- [ ] **Step 5: Verify in production.**

```bash
sleep 45
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://conidolly.vercel.app/ir-a-biblioteca?v=$(date +%s)"
```

Expected: `307 https://conidolly.vercel.app/ingreso` (no session: the usual sign-in redirect). Then ask Federico to sign in to Conidolly with the account that is Coni's today (TRASPASO: `federico@wearevision.cl` is Coni's account for testing), tap Biblioteca once and confirm he lands on Ingesta's Materiales with "Volver a Conidolly". Coni tries it once and reports.

- [ ] **Step 6: Board, done.** Move #13 to **Listo** (`--single-select-option-id 98236657`, same command as Step 1) and re-read the item to confirm it stayed there.

- [ ] **Step 7: Update `docs/TRASPASO.md`** on `main` of estudio-coni: in "Producción", the Ingesta row adds "Variable `CONIDOLLY_URL`"; in "Lo que está hecho" add one entry, in Spanish of Chile without em dashes:

```markdown
- **Biblioteca con la misma sesión y el mismo estilo** (cambio 29a del pedido de Coni, etapa 1; spec `2026-11-02-biblioteca-misma-sesion-design.md`, plan `2026-11-02-biblioteca-misma-sesion.md`, PR de Ingesta y PR de Conidolly, tablero #13, en producción desde el <fecha>): cuarta pestaña «Biblioteca» en Conidolly (`/ir-a-biblioteca`, enlace simple, nunca actual); para Coni genera un enlace de un solo uso con `generateLink` (no manda correo) y un formulario lo lleva por POST a `/ingreso/puente` de Ingesta, que borra la sesión anterior del navegador y entra con `verifyOtp` tipo `email`; si el enlace ya se usó o venció, `/ingreso?puente=vencido` lo dice y deja entrar con el código. Variables nuevas: `INGESTA_URL` (Conidolly) y `CONIDOLLY_URL` (Ingesta, «Volver a Conidolly» solo para Coni). Ingesta tomó los tokens de Conidolly (fuente: `app/globals.css` de estudio-coni, mantener en sincronía hasta la etapa 2), Geist y Soft UI en botón, campos, casillas, navegación y tarjeta. Si falla: `/biblioteca-no-abrio`, y la causa queda en el log de Vercel sin el token.
```

```bash
cd /Users/fede/Projects/estudio-coni && git checkout main && git pull --ff-only
git add docs/TRASPASO.md
git commit -m "$(cat <<'EOF'
Record the Biblioteca bridge in the handover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Push only with Federico's OK (a docs-only commit on `main` publishes nothing new but still deploys).

---

## Self-review against the spec

| Spec section | Where |
|---|---|
| Decisions: approach A, 4th tab now, tokens and base pieces | Tasks 2-3, 14-15 (A); 17 (tab); 7-11 (style) |
| 1. `PESTANAS` 4th entry, Phosphor `Books`, 4 columns, never current, 375 px and desktop check, baselines | Task 17 (Steps 3, 5, 7) |
| 1. `app/ir-a-biblioteca/route.ts` GET, outside `(app)`, Coni only, redirect others to `/`, sign-in for no session | Task 15 |
| 1. generateLink magiclink with Coni's email from her session, no email | Tasks 14, 15 (P2), 18 |
| 1. HTML form, hidden field, self-submit, "Abrir la Biblioteca" fallback, `no-store`, `no-referrer`, token never in URL/log/error | Tasks 14, 15, 19 |
| 1. Failure page copy, "Volver a intentar" and Inicio, cause to the log without token | Tasks 14, 16 (P1) |
| 1. `INGESTA_URL` in Vercel and `.env.example` | Task 15, Task 22 Step 4 |
| 1. `lib/sesion/puente.ts` with injected deps, unit-tested | Task 14 |
| 2. `app/ingreso/puente/route.ts` POST only, GET to `/ingreso`, Zod bounded, `verifyOtp` with the server client, 303 to `/` | Tasks 2, 3 |
| 2. B11 type fixed by the integration test | Facts B11, Tasks 4, 18 |
| 2. Sign out first, then verify (and the cookies the POST cannot see) | Tasks 2, 3 |
| 2. `decidirRuta` and `proxy.ts` let the POST through | Task 1 |
| 2. `?puente=vencido` message, code sign-in still there | Tasks 5, 12, 19 |
| 2. `leerSesion` decides access afterwards | unchanged `(app)/layout.tsx`; Task 4 (`es_coni`), Task 19 |
| 2. "Volver a Conidolly" only for `coni`, `CONIDOLLY_URL` | Tasks 6, 11, 22 Step 3 |
| 2. `Referrer-Policy: no-referrer`, no logging of the body | Task 3 |
| 3. Conidolly tokens, rename map, ok/aviso AA in the stone family, pillar hues stay | Task 7 (P6) |
| 3. Geist, theme colour and `COLOR_DE_FONDO` from piedra, light only | Task 8, Task 12 |
| 3. Button, fields, code boxes, main navigation, material card surface, same props | Tasks 9, 10, 11 |
| 3. No hex outside `globals.css`; no new colours but ok and aviso | Task 7 (`tokens.test.ts`) |
| 3. Header comment names Conidolly's `app/globals.css` | Task 7 Step 5, test in Step 2 |
| 4. Every listed test | Conidolly unit: 14, 15, 16, 17; integration: 18; Ingesta unit: 1, 2, 3, 5, 6; integration: 4; E2E + axe: 19; Ingesta baselines own commit after a look: 13 |
| 5. Two PRs, Ingesta first with manual deploy, env vars before each deploy, no migration or Trigger, verification | Task 22 |
| Board #13 and TRASPASO | Task 22 Steps 1, 2, 6, 7 |
