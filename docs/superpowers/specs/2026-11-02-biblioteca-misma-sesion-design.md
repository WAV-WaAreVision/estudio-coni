# Biblioteca with the same style and the same session (change 29, stage 1)

Issue WAV-WaAreVision/estudio-coni#13 · Pedido 29a · phase 1 · size S–M. Approved by Federico on 2026-11-02.
Sources: `docs/pedido-coni-2026-10-31/fichas.md` (change 29), `pedido-original.md` (Cambio 29), `decisiones.md` (A6, A14, B11).

## Goal

Coni opens the Biblioteca (today the separate Ingesta app, `conidolly-ingesta.vercel.app`) from a tab in Conidolly, without
typing a code, and it looks like the same app. WAV keeps entering Ingesta with its code (A6: WAV never enters Conidolly).
Stage 2 (#17) later moves the screens into Conidolly; nothing here is built only to be thrown away there.

## Decisions

- **Session bridge: one-time Supabase login link (approach A).** Rejected: our own signed token (more hand-rolled crypto and
  another shared secret, no gain) and serving Ingesta under `conidolly.vercel.app/biblioteca` as a Next multi-zone (needs a
  `basePath` across Ingesta, puts WAV's session on Conidolly's domain against A6, complicates the move to Cloudflare in 2b).
- **Entry: a 4th tab "Biblioteca" now**, in its final place. In stage 2 only its destination changes.
- **Style depth: tokens and base pieces.** Ingesta takes Conidolly's tokens, Geist and the Soft UI relief on its shared
  pieces; screens keep their layout (stage 2 rebuilds them).

## 1. Conidolly: the tab and `/ir-a-biblioteca`

- `components/nav-inferior.tsx`: `PESTANAS` gets a 4th entry `{ href: "/ir-a-biblioteca", etiqueta: "Biblioteca", icono: Books }`
  (Phosphor), grid goes to 4 columns. It is never the current tab in stage 1 (Coni leaves the app). Check the bar at 375 px and
  the desktop top bar; the visual baselines of the bar change.
- `app/ir-a-biblioteca/route.ts` (GET, dynamic, outside the `(app)` group so it renders no shell):
  1. `exigirConi()` (`lib/sesion/coni.ts`). Anyone else: redirect to `/` (no session: the usual sign-in redirect).
  2. With the service-role client, `auth.admin.generateLink({ type: "magiclink", email: <Coni's email from her session> })`.
     It must not send an email (B11, verified in a local integration test that checks the local Inbucket/Mailpit stays empty).
  3. Answer an HTML page that holds `token_hash` in a hidden field of a form that POSTs to
     `${INGESTA_URL}/ingreso/puente` and submits itself on load, with a visible "Abrir la Biblioteca" button as the
     no-JavaScript fallback. Headers: `Cache-Control: no-store`, `Referrer-Policy: strict-origin` (not `no-referrer`: with
     it the browser sends `Origin: null` on the cross-site POST and Ingesta's Origin check could never pass; the token is in
     the body, so `strict-origin` leaks nothing).
  The token never appears in a URL, a log line or an error message.
- Failure (generateLink error, missing `INGESTA_URL`): a page in plain Spanish, "No pude abrir la Biblioteca. Vuelve a
  intentarlo en un momento.", with a "Volver a intentar" link to `/ir-a-biblioteca` and one to Inicio; the cause goes to the
  server log without the token.
- New env var `INGESTA_URL` (Vercel prod and preview; `.env.example`). The service-role key already exists in Vercel.
- The single function that calls `generateLink` lives in `lib/sesion/puente.ts` with injected dependencies (client, email,
  Ingesta URL) so it is unit-tested without Supabase.

## 2. Ingesta: `/ingreso/puente`

- `app/ingreso/puente/route.ts`, POST only (GET answers 405 or redirects to `/ingreso`). Reads `token_hash` from the form body,
  validates it with Zod (non-empty, bounded length), calls `auth.verifyOtp({ token_hash, type })` with the server client that
  writes the session cookies, then 303 to `/`. The exact `type` for an admin magiclink token (`"magiclink"` vs `"email"`) is
  fixed by the local integration test (B11), not by memory.
- The bridge replaces whatever session the browser had (for example WAV's on a shared computer): sign out first, then verify.
- `lib/sesion/rutas.ts` `decidirRuta`: `/ingreso/puente` is reachable with or without a session (today any `/ingreso/*` with
  a session goes to Inicio, which would skip the swap). `proxy.ts` must let the POST through.
- Invalid, expired or reused token: 303 to `/ingreso?puente=vencido`, where the sign-in form shows "El enlace ya se usó o
  venció. Vuelve a Conidolly y toca Biblioteca otra vez." Coni can still sign in with her code.
- After the swap the normal `leerSesion` decides access: only rows in `miembros` (Coni or WAV) get in.
- A "Volver a Conidolly" link, shown only when the role is `coni`, in Ingesta's main navigation, to `CONIDOLLY_URL`
  (new env var, Vercel and `.env.example`).
- `Referrer-Policy: no-referrer` on the bridge response. No logging of the body.
- **Origin check (added after the review of tasks 1-6):** the POST is accepted only when its `Origin` equals the origin of
  `CONIDOLLY_URL`; otherwise 303 to `/ingreso` without touching cookies or Auth, so a forged POST from another site cannot
  sign WAV or Coni out. Bodies over 2 KB or with another content type are refused the same way before parsing, and an
  exception from Auth ends on the expired-link page instead of a 500. `CONIDOLLY_URL` is used only when it parses as an
  `https:` URL (`http:` outside production), and its origin is the link's href.

## 3. Ingesta: style

- `app/globals.css`: replace the raspberry/serif palette with Conidolly's tokens (piedra, piedra-alta, piedra-honda, luz,
  tinta, apagado, campo, hilo, error, firma, sobre-firma, relief shadows, radii, motion, the type scale). Ingesta's current
  semantic names (`fondo`, `superficie`, `hundido`, `linea`, `acento*`, `ok-*`, `aviso-*`, `error-*`, text sizes `display`,
  `title`, `label`, `body`, `meta`, `nav`) are renamed in components to the Conidolly name that means the same, so stage 2 can
  copy markup without translating. Where Ingesta has a state Conidolly lacks (ok, aviso), it keeps one token each, defined in
  Conidolly's stone family and contrast-checked (AA) on piedra. Pillar hues (`data-pilar`) stay.
- `app/layout.tsx`: Geist (`geist/font/sans`) instead of Young Serif and Hanken Grotesk; theme colour and `COLOR_DE_FONDO`
  from piedra; always light.
- Base pieces to Soft UI: `components/ui/boton.tsx` and `clases-de-boton.ts`, `components/campo.tsx`,
  `components/casillas-codigo.tsx`, `components/navegacion-principal.tsx`, and the material card's surface. Same props, new
  classes only.
- No hex outside `globals.css`; no new colours that Conidolly does not have except the two state tokens above.
- The header comment of Ingesta's `globals.css` (it cites a `docs/DESIGN.md` that does not exist in that repo) names
  Conidolly's `app/globals.css` as the source of the tokens, to be kept in sync until stage 2.

## 4. Tests (TDD, failing test first)

- Conidolly unit: `lib/sesion/puente.ts` builds the page with the token only inside the form body, never in the action URL;
  refuses when not Coni; maps a generateLink error to the plain failure page; `nav-inferior` renders 4 tabs.
- Conidolly integration (local Supabase): generateLink for Coni returns a token and sends no email.
- Ingesta unit: the bridge route validates the body, rejects GET, signs out before verifying, redirects to `/` on success and to
  `/ingreso?puente=vencido` on failure; `decidirRuta` lets `/ingreso/puente` through with and without a session; "Volver a
  Conidolly" only for Coni.
- Ingesta integration: a token from generateLink, POSTed to the bridge, yields Coni's session; the same token a second time fails.
- E2E (Conidolly, local, both apps running): Coni taps Biblioteca and lands on Ingesta's Materiales signed in; axe on the
  failure page and on Ingesta's sign-in with the `vencido` message. Ingesta's visual baselines are regenerated in their own
  commit after a look by a person.

## 5. Release

- Two PRs: conidolly-ingesta (bridge + style) first, deployed by hand to Vercel as today; then estudio-coni (tab + route).
  Env vars `INGESTA_URL` (Conidolly) and `CONIDOLLY_URL` (Ingesta) set in Vercel before each deploy.
- No migration, no Trigger deploy. Standing release authorization applies (issue, CI green, reviews).
- After release: Federico's account cannot test the Coni-only path; the check is the E2E locally plus a look at
  `/ir-a-biblioteca` answering a redirect to sign-in without a session. Coni tries it once and reports.
- On a Conidolly preview deployment the Biblioteca tab ends on Ingesta's `/ingreso`: the preview's origin is not
  `CONIDOLLY_URL`, so Ingesta's origin check refuses the POST. Expected; the bridge is only checked end to end in
  production and in the local E2E.

## Risks

- **Service role in a user-facing route.** Contained to one function, behind `exigirConi`, with its test. The link it mints
  only ever signs in Coni herself.
- **Token exposure.** Travels in a POST body over HTTPS (Conidolly refuses a non-https `INGESTA_URL` in production and
  never copies its user or password into the form), single use, short expiry (Supabase OTP expiry), never in URLs, logs or
  referrers.
- **GET with an effect.** Any top-level cross-site navigation to `/ir-a-biblioteca` (a link on another site, a typed
  address) carries Conidolly's `SameSite=Lax` cookies, so it mints a link and signs Coni into her own Ingesta session in
  that browser, replacing whatever session it had there and invalidating any older link. No escalation: it only ever
  signs in Coni, in a browser where she is already signed in to Conidolly. Accepted.
- **Supabase API drift** (`verifyOtp` type for admin links): pinned by the integration test.
- **Visual regressions in Ingesta** while WAV uses it daily: tokens map one to one, base pieces keep their props, E2E and
  visual tests run before the deploy.

## Out of scope

Moving screens into Conidolly, the 14 UX fixes, delete with "Deshacer", WAV access, turning Ingesta off (stages 2 and 3, #17).
