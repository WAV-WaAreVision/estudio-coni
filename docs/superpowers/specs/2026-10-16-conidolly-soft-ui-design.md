# Conidolly: the app moves from Calma suiza to Soft UI v6 (design)

Status: draft for Federico's review, 2026-10-16. Visual source of truth: the approved mockups in
`~/Projects/conidolly-rediseno/soft-ui/v6/` (14 screens, `soft.css`, renders at default text and at 200 %). Phase 2 of
`docs/superpowers/plans/2026-10-16-impeccable-metodologia.md`. Visual migration only: no state, action, server logic,
database or Trigger.dev change. Where v6 draws behaviour the app does not have, this document says how the screen renders
with today's behaviour and lists the new behaviour in "Follow-up spec (logic)" at the end.

## Problem

The code still runs Calma suiza (warm stone, hairlines, 12 px radius, raspberry on every highlight). `docs/DESIGN.md`
already describes the target (gris neutro, relief = touch, magenta fresa for errors, raspberry only signs) and its header
says the migration needs mockups, a spec and a plan. The mockups exist (v6). The critiques name what the migration must
fix in the real app (`.impeccable/critique/2026-10-16T19-25-30Z__app.md`, 27/40; audit 15/20):

- raspberry reused as error, warning, "Falta", "Pedir cambios", "Regrabar" and focus ring: the signature loses its meaning;
- iOS text size never reaches the installed PWA (no `-apple-system-body`);
- gate 1 is a 2,700 px screen where the avatar, a signing requirement, sits at the end;
- the sign bar covers half of the video at gate 2.

Goal: the app looks and reads like v6, keeps every behaviour it has today, and reaches the phase 2 target (critique
>= 34/40 on the real app, 0 P0/P1, audit without critical or high findings).

## Facts from the code (verified 2026-10-16 on `main`, bfc29ee)

- Tokens: `app/globals.css` defines Calma suiza (`--fondo #f7f6f3`, `--superficie`, `--tinta #1d1b18`, `--linea`,
  `--pista`, `--exito #2e6a44`, `--error` and `--aviso` as `var(--firma)`), one `@theme inline` mapping, a dark block
  under `:root[data-theme="dark"]` (inactive), two radii (`--r-12`, `--r-circulo`) and two shadows (`--sombra-barra`,
  `--sombra-flotante`). The focus ring is `--anillo-foco: 0 0 0 2px var(--fondo), 0 0 0 4px var(--firma)`.
  `app/tema-cerrado.css` resets Tailwind's colours, radii, shadows and text sizes; spacing is not reset (Tailwind's
  default `--spacing: 0.25rem`).
- Type: rem sizes (`--t-cuerpo 1.125rem`, `--t-meta 0.9375rem` ...) on a 16 px root; `html` has no
  `-apple-system-body` (audit P1).
- `lib/utils.ts` `cn` is a bare `twMerge`. Checked with node: `twMerge("text-meta font-medium text-tinta")` returns
  `"font-medium text-tinta"`. Every `cn` that mixes a custom size (`text-meta`, `text-cuerpo`) with a colour drops the
  size today (for example the figure line of `components/ui/medidor.tsx`). A latent bug, fixed in decision 2.
- Components: `components/ui/` has `boton.tsx` + `clases-de-boton.ts` (variants `primario`, `linea`, `callado`,
  `destructiva`; press is `scale(0.98)`), `casilla.tsx` (round 24 px box), `chip.tsx` (in `components/`),
  `interruptor.tsx`, `filas.tsx` (navigation, value, switch and radio rows), `pestanas.tsx` (underlined tabs),
  `linea-de-estado.tsx` (icon + text, no box, in the state's ink), `marca-revision.tsx` (a finding as a status line plus
  the checkbox "Lo revisé y está bien"), `aviso.tsx` (fixed toast, 8 s, optional "Deshacer"), `barra-de-firma.tsx`
  (fixed bar, `--barra-max: 176px` of padding on the screen), `confirmacion-en-linea.tsx`, `costo.tsx`, `medidor.tsx`,
  `punto-trabajando.tsx`, `wordmark.tsx`.
- The signature control (`components/deslizar-para-aprobar.tsx`): drag to 96 % approves on release; keyboard End
  approves, arrows move in 4 % steps and stop at 92 %; a visible "Aprobar" button beside it approves with one tap (WCAG
  2.5.7, required by `docs/PRODUCT.md` and `docs/DESIGN.md`). v6 draws no "Aprobar" button.
- Navigation (`components/nav-inferior.tsx`): sticky bottom, hidden on `/guion/` and `/video/`, moves to the top at `md`.
  The app layout (`app/(app)/layout.tsx`) is one 560 px column with `pb-[var(--final-pagina)]` (96 px).
- Gate 1 (`app/(app)/guion/[id]/pantalla-guion.tsx`): header with "Si lo apruebas hoy, sale el" and the date in
  `text-firma`; `VozParaFirmar` (player, "Grabar la voz de nuevo" with cost and ElevenLabs balance line, or "Falta
  preparar tu voz." with "Preparar mi voz"); the editor always open (`EditorDeGuion`: script and caption boxes); the
  LinkedIn text read only; the avatar photo grid (`ElegirAvatar`, preselects `avatarGuardado` when offered, otherwise
  nothing); "Revisión" with one `MarcaRevision` per finding; "Pedir cambios" with an in-line confirmation; the bar with
  `motivoParaFirmar` (one reason, the most useful first) and `lineaDeFirma` ("Al firmar grabo el video: ~52 s, US$ 3,48.
  Tienes 8 s para deshacer.", `lib/dominio/saldos.ts`). Copy lives in `app/(app)/guion/[id]/textos.ts`.
- After the signature (`app/(app)/guion/[id]/page.tsx`, `en_render` / `subtitulando`): `EstadoSencillo` with "Estoy
  grabando tu video." / "Te aviso cuando esté listo." and, while the window lasts, `DeshacerFirma`: a toast "Firmaste.
  Grabo el video en N s." with "Deshacer" (N computed once from the server clock, version kept from the first render).
  An undo reopens gate 1 with the toast "Listo, no grabé nada. Puedes seguir revisando.".
- Failures today: `error_produccion` shows "No se pudo terminar el video" + `explicacion` + the voice to listen to + the
  HeyGen balance line + "Reintentar" and "Descartar esta pieza" (`app/(app)/estado-de-pieza.tsx`). `guion_en_proceso`
  with a reason shows "No pude escribir el guion" + "Reintentar" / "Descartar". A failed voice lands in
  `guion_por_aprobar` with `explicacion = TEXTO_SIN_VOZ` ("No pude preparar tu voz. Vuelve a intentarlo con Preparar mi
  voz.", `lib/produccion/voz.ts`), `TEXTO_TOPE`, or a `Falla` message (`lib/produccion/grabar-voz.ts`).
- Whether a failed render was charged is not known to the screen: `fallar()` in `lib/produccion/grabar.ts` releases the
  reservation, "a no-op when the spend was already confirmed (the video was delivered and paid)". A failure after
  delivery (subtitles, checks) was paid.
- An expired LinkedIn connection does not fail a piece: it moves to `para_subir_a_mano` (`lib/publicacion/linkedin.ts`,
  `pasarLinkedinAMano`). The expiry warning reaches Coni as an unread notice "Tu conexión con LinkedIn necesita atención"
  (`lib/avisos/tipos.ts`, `lib/mantenimiento/token-linkedin.ts`), listed in Inicio's "Avisos".
- Inicio view model (`lib/inicio/modelo.ts`, pure, only consumer `app/(app)/page.tsx`): `firma` includes
  `grabando_voz` (meta "Preparando la voz"); `camino` rows that are `ocupada` have no `href`; `avisos` of type `error`
  come from `error_produccion`, `guion_en_proceso` with a reason, `error_publicacion`, `guion_por_aprobar` with a reason
  and `video_por_aprobar` with a reason, each with titulo = piece title, texto = `explicacion` and the action "Revisar"
  (or "Elegir otra fecha"); type `ok` for a recent publication or manual upload. The page also renders "Por subir",
  `AvisosSinLeer`, "En camino" + "Ver calendario", `IdeasSemana` (inline idea picking) and `ConsultaNueva`.
- Review data (`lib/dominio/revision.ts`): `Hallazgo { regla, tipo: "bloquea" | "advierte", mensaje, frase?, campo? }`.
  There is no suggested replacement and no source page per finding.
- Gate 2 (`app/(app)/video/[id]/pantalla-video.tsx`): full-height video; "Lo viste completo" / "Míralo completo para
  aprobar"; "Ver zonas de Instagram"; the rest appears only after the video was watched ("Antes de aprobar" checkbox
  "Revisé labios, nombre, subtítulos y cortes", destinations, Instagram caption, LinkedIn text, review, date with
  "Cambiar" and a radio list); "Regrabar" with in-line confirmation; label "Desliza para aprobar video y fecha".
- Cuentas (`app/(app)/ajustes/cuentas/page.tsx`, `cuentas-conectadas.tsx`, `lib/ajustes/presentar.ts`): title "Cuentas
  conectadas"; per account name, state (text + icon in its ink) and `detalle`; key forms for HeyGen, ElevenLabs and
  Claude; LinkedIn "Renovar LinkedIn" / "Desconectar" with the confirmation "¿Desconectar LinkedIn? Tus videos dejarán
  de salir solos ahí y te quedarán para subir a mano."; a separate "Saldos" section (`saldos.tsx`).
- Brand literals: `lib/diseno/marca.ts` (`COLOR_DE_FONDO #f7f6f3`, `COLOR_DE_FONDO_OSCURO`, `COLOR_DE_TINTA #1d1b18`,
  `COLOR_DE_FIRMA #a8285a`, `COLOR_SOBRE_FIRMA #fcfbf9`), read by `app/layout.tsx` (theme-color), `app/manifest.ts`,
  `app/icon.tsx`, `app/apple-icon.tsx` and `app/l/page.tsx`; `tests/unit/marca.test.ts` checks them against
  `globals.css`. `COLOR_SOBRE_FIRMA` has no consumer besides the test.
- `/l` (`app/l/page.tsx`): raspberry surface edge to edge (`data-superficie="marca"`), luz text, hairline rows, its own
  focus colour.
- Guard tests: `tests/unit/diseno-reglas.test.ts` pins the Calma suiza values, the dark block, "every highlight in the
  raspberry family" and the files allowed to use `firma`. `tests/e2e/accesibilidad.spec.ts` asserts the page
  background `rgb(247, 246, 243)`. `tests/e2e/visual.spec.ts` keeps 18 baselines in
  `tests/e2e/visual.spec.ts-snapshots/`.
- No Content-Security-Policy is set (an inline script in the root layout is allowed). `public/sw.js` has no fetch
  handler (no stale CSS after a deploy).

## Decisions

### 1. Scope rule

Allowed: `app/globals.css`, `components/**`, the JSX of `app/**` screens, client-only UI state (open/closed, armed),
copy, and the pure presentation helpers that only shape what a screen shows: `lib/inicio/modelo.ts`, `lineaDeFirma`
in `lib/dominio/saldos.ts`, `lib/ajustes/presentar.ts`, `lib/diseno/*`, `app/(app)/guion/[id]/textos.ts`. Not allowed:
`lib/dominio/estados.ts`, actions (`lib/acciones/**`, `app/**/acciones.ts`), `lib/produccion/**`, `lib/publicacion/**`,
data readers, migrations, `trigger/**`. A screen never gains a new database read (rejected for that reason: the "Sigue
esperando tu firma" card after signing, decision 10).

### 2. Tokens (`app/globals.css`)

One `:root`, light only. Values are v6's `soft.css`, renamed to the `DESIGN.md` vocabulary:

| Token | Value | Role |
|---|---|---|
| `--piedra` | `#ebebea` | page and every raised surface |
| `--piedra-alta` | `#f4f4f3` | reading panels, flat groups |
| `--piedra-honda` | `#dcdcdb` | sunken (tracks, fields, segmented), status pills, warning and error blocks, disabled |
| `--luz` | `#fbfbfa` | light side of the relief; text on tinta, firma and video |
| `--tinta` | `#262626` | all text, primary fill, checked boxes, progress, focus ring |
| `--apagado` | `#5a5a59` | meta, help, disabled labels |
| `--campo` | `#727271` | empty checkbox and radio rings, high-contrast outlines |
| `--hilo` | `var(--piedra-honda)` | 1 px dividers between rows (decorative) |
| `--error` | `#b5137a` | magenta fresa: error titles and the destructive confirm, always after an icon |
| `--firma` | `#a8285a` | raspberry: the thumb, its trail, the wordmark dot, `/l` |
| `--sobre-firma` | `var(--luz)` | arrow on the thumb, text on `/l` |
| `--firma-rastro` | `rgb(168 40 90 / 0.14)` | trail while dragging or armed |
| `--video` | `#3a3836` | video frame before it loads |
| `--velo-video` | `rgb(38 38 38 / 0.78)` | badges and controls over the video |

Shadows are tokens (v6 values; the dark side is neutral `rgb(60 60 60)`, not DESIGN.md's warm `rgb(70 64 52)`):
`--relieve` (`-6px -6px 14px rgb(251 251 250 / .9), 6px 6px 14px rgb(60 60 60 / .18)`), `--relieve-alto` (10 / 24 px,
.22), `--relieve-fijo` (nav: `0 -4px 14px rgb(60 60 60 / .10), inset 0 1px 0 rgb(251 251 250 / .9)`),
`--relieve-alto-fijo` (sign bar: `0 -8px 24px rgb(60 60 60 / .16), inset 0 1px 0 ...`), `--hundido`
(`inset 4px 4px 10px rgb(60 60 60 / .18), inset -4px -4px 10px rgb(251 251 250 / .9)`), `--relieve-pulgar` (thumb),
`--relieve-perilla` (rail knob), `--hundido-marcado` (checked box: `inset 2px 2px 5px rgb(60 60 60 / .18)`).
v6 leftovers are normalised: the working dot's green halo (`rgb(31 138 90 / .16)`) becomes `rgb(38 38 38 / .16)`, and
the warm video veil (`rgb(42 41 37 / .78)`) becomes `--velo-video`.

Radii: `--r-control: 999px` (everything touchable), `--r-panel: 24px`, `--r-bloque: 18px`, `--r-barra: 28px`,
`--r-toast: 22px`, `--r-casilla: 9px`, `--r-video: 22px`. Spacing stays in px on the 4/8 grid (`--e-1` ... `--e-16`,
`--margen: 20px`); every target, min-height and icon size is in rem (decision 3). Motion tokens stay
(`--dur-corta 150ms`, `--dur-media 200ms`, `--dur-larga 220ms`, `--curva-salida`, `--curva-vuelta`), zeroed under
reduced motion.

`@theme inline` maps them: `--color-piedra`, `--color-piedra-alta`, `--color-piedra-honda`, `--color-luz`,
`--color-tinta`, `--color-apagado`, `--color-campo`, `--color-hilo`, `--color-error`, `--color-firma`,
`--color-sobre-firma`, `--color-firma-rastro`, `--color-video`, `--color-velo-video`; `--shadow-relieve`,
`--shadow-relieve-alto`, `--shadow-relieve-fijo`, `--shadow-relieve-alto-fijo`, `--shadow-hundido`,
`--shadow-relieve-pulgar`, `--shadow-relieve-perilla`, `--shadow-hundido-marcado`; `--radius-control`,
`--radius-panel`, `--radius-bloque`, `--radius-barra`, `--radius-toast`, `--radius-casilla`; the text sizes of
decision 3; and `--spacing: 4px`, so `p-5` stays 20 px when the root grows with iOS text size (v6: paddings in px,
targets in rem). `tema-cerrado.css` is unchanged.

Removed: `--fondo`, `--superficie`, `--linea`, `--pista`, `--principal`, `--sobre-principal`, `--sobre-tinta`,
`--exito`, `--aviso`, `--sombra-barra`, `--sombra-flotante`, `--anillo-foco`, `--barra-max`, `--alto-fila*`. Success
and warning are no colours any more: they are tinta with an icon on a honda pill (The No Yellow Rule; v6 `.estado.ok`).
During the migration the old names live as aliases of the new values (step 1 of "Migration order") and are deleted at
the end; the guard test then bans them.

Dark mode: the block is removed, not kept inactive. Its values belong to Calma suiza and nothing would keep them in
step with the gris neutro palette; `COLOR_DE_FONDO_OSCURO` goes with it. The app stays light (`color-scheme: light`,
no `prefers-color-scheme`).

`cn` gets `extendTailwindMerge` with the custom font sizes (`pantalla`, `pieza`, `guion`, `boton`, `cuerpo`, `meta`,
`insignia`, `marca`), shadows and radii, so `cn("text-meta", "text-apagado")` keeps both. Unit test in
`tests/unit/utils.test.ts`.

### 3. Type scale and iOS text size

v6 renders on the iOS body size (17 px by default) and sets every size in rem, so the system text size scales text and
targets together:

```css
html { font-size: 106.25%; -webkit-text-size-adjust: 100%; }
@media (hover: none) and (pointer: coarse) {
  @supports (font: -apple-system-body) { html { font: -apple-system-body; } }
}
```

The media guard is ours, not v6's: on macOS Safari `-apple-system-body` resolves to the desktop body size (smaller than
17 px) and would shrink Federico's view. iPhone and iPad with touch get Dynamic Type; everything else gets 17 px.
`body` sets family, size and line height again (the shorthand also sets a system family).

| Token | Size | Line | Weight | Use (v6 class) |
|---|---|---|---|---|
| `--t-pantalla` | 2rem | 1.125 | 600, -0.022em | screen title (`h1`) |
| `--t-pieza` | 1.5rem | 1.167 | 600, -0.014em | piece title, idea hook, "Grabo tu video en 8 s" |
| `--t-guion` | 1.18rem | 1.6 | 400 | the script (`.guion`); the LinkedIn text uses 1.125rem / 1.55 |
| `--t-boton` | 1.125rem | 1.333 | 600 | labels of 3.25rem buttons and the working line |
| `--t-cuerpo` | 1rem | 1.333 | 400; rows 600 | body, row titles, small buttons, toast, track label |
| `--t-meta` | 0.9375rem | 1.333 | 500; labels 600 | meta, section labels, pills, help, figures (`tabular-nums`) |
| `--t-insignia` | 0.8125rem | 1.3 | 600 | badges on the video ("Avatar IA", "faltan 0:24") |
| `--t-marca` | 2.75rem | 1.09 | 600 | only the name on `/l` |

This resolves a conflict: `DESIGN.md` gives `cuerpo` 1.125rem on a 16 px root; v6 sets body at 1rem on a 17 px root
(the iOS body) and keeps 1.125rem for the large button. v6 wins; `DESIGN.md` is updated (see "Docs").

Icons scale with text: Phosphor icons get `width/height` in `em` (v6: 16 -> 1em, 20 -> 1.2em, 24 -> 1.45em), through
a size prop helper in `components/ui/icono.ts` rather than per-file numbers.

### 4. The grammar: relief means touch

Three levels only: sunken (`--hundido`), raised (`--relieve`) and high (`--relieve-alto`, one per screen). Anything you
touch is raised; anything that receives input is sunken; anything you only read is flat. Press swaps relief for
sunken in 150 ms (`--curva-salida`), no scale (The Press Sinks Rule); instant under reduced motion. The relief is never
the only signal: shape, text or icon identifies every control (The Relief Is Not A Boundary Rule).

| Component (file) | Rest | Pressed / selected | Disabled | Size |
|---|---|---|---|---|
| Primary button (`clases-de-boton.ts` `primario`) | tinta fill, luz label 600, `--relieve` | `--hundido` on tinta | honda, flat, apagado label, reason line under it | min-h 3.25rem, pill, label left, icon right |
| Secondary button (`secundario`, was `linea`) | piedra raised, tinta label | `--hundido` | as primary | 3.25rem, or `chico` 2.75rem with 1rem label |
| Quiet action (`callado`) | underlined text 1rem 600, no surface (v6 `.enlace-callado`, here in tinta) | opacity .7 | apagado, no underline | 2.75rem target |
| Destructive confirm (`destructiva`) | piedra raised, `--error` label; only inside a confirmation | `--hundido` | as secondary | 2.75rem |
| Back link (`components/ui/volver.tsx`, new) | piedra raised pill, chevron + label 1rem 600 | `--hundido` | n/a | 2.75rem |
| Chip (`components/chip.tsx`) | piedra raised pill, meta 600 | tinta fill, luz label, check icon | honda flat | 2.75rem |
| Segmented (`pestanas.tsx`) | track honda sunken pill; options flat apagado 500 | active option piedra raised, tinta 600 | n/a | options 2.75rem |
| Checkbox (`casilla.tsx`) | 1.65rem box, radius 9 px, honda sunken, 2 px `campo` ring | tinta fill, luz check, `--hundido-marcado` | honda flat, label apagado | row min-h 3.25rem, whole row is the target |
| Radio / choice (`filas.tsx` `FilaConCheck` -> `Eleccion`) | 1.65rem round, honda sunken, `campo` ring; row text 600 | tinta fill with a .6rem luz dot; the other rows turn apagado 500 | as checkbox | row min-h 2.75rem, focus ring around the row |
| Switch (`interruptor.tsx`) | track honda sunken + `campo` ring, thumb piedra raised | track tinta, thumb luz | honda flat | 3.25 x 2rem |
| Field (`.campo` in globals, `casillas-codigo.tsx`) | honda sunken; input pill 3.25rem, padding 0 20 px; textarea radius 24 px, grows (`field-sizing: content`) | focus ring | honda flat, apagado | error: 2 px `--error` outline and an error block under it |
| Sign track + thumb (decision 5) | track honda sunken 3.5rem, label 1rem 600 tinta; thumb 3rem `--firma` with `--relieve-pulgar`, luz arrow | trail `--firma-rastro`; signed: trail `--firma`, label luz | label apagado; thumb piedra flat with 2 px `campo` inset ring, apagado arrow | track focus ring 3 px tinta, offset 3 px |
| Rail (voice and video progress, `.avance`) | track .625rem honda sunken, tinta fill (`--p`), knob 1.25rem piedra `--relieve-perilla` | n/a | fill apagado | input target 2.75rem; on the video: luz fill over `--velo-video` |
| Play (`reproductor-voz.tsx`) | 3.5rem piedra raised circle, tinta icon (play, pause, replay when finished) | `--hundido` | flat, apagado | 3.5rem |
| Toast (`aviso.tsx`) | tinta, luz 1rem 600, `--relieve-alto`, radius 22 px | action: luz pill, tinta label, no shadow, 2.75rem | n/a | see decision 6 for placement |
| Status pill (`components/ui/estado.tsx`, new) | flat, min-h 2rem, icon + meta 600. `ok`: honda + check; `aviso`: honda + warning; `error`: honda, `--error` text + warning circle; `neutro`: piedra-alta, no icon | never pressed | n/a | never a shadow: a state that looks like a button is wrong |
| Warning / error block (`components/ui/bloque.tsx`, new) | flat honda, radius 18 px, padding 12 x 14 px, warning icon, meta tinta; `error`: title `--error` 600 after the icon, detail tinta; `grande` (failures with an action): radius 24 px, padding 18 px, title 1rem 600, optional piece title, one primary action | n/a | n/a | magenta text only inside a honda block after an icon, or on the destructive confirm |
| Reading panel (`components/ui/panel.tsx`, new) | piedra-alta, radius 24 px, padding 20 px, flat | n/a | n/a | never nested |
| Group (`components/ui/grupo.tsx`, new) | rows that open something: piedra raised, radius 24 px, padding 0 18 px, rows divided by 1 px `hilo`; `plano` (rows that do not open): piedra-alta, flat | row press: background honda for 150 ms | n/a | rows min-h 4.5rem (`baja` 3.75rem) |
| Card (Inicio's first signature) | piedra, `--relieve-alto`, radius 24 px, padding 20 px; one per screen | n/a | n/a | holds one primary |
| Disclosure (`components/ui/mas-opciones.tsx`, new; native `<details>`) | raised row piedra, summary min-h 3.75rem with title + one meta line, chevron rotates 90 deg open; content under a `hilo` divider | summary `--hundido` | n/a | open by default when it holds something missing (decision 9) |
| Danger disclosure (Cuentas) | neutral summary row (tinta 600, chevron); open: honda confirmation block with icon text and "Sí, desconectar" + "Cancelar" | n/a | n/a | the destructive word only on the confirm button |
| Bottom nav (`nav-inferior.tsx`) | piedra, `--relieve-fijo`, radius 24 px top; tabs icon + meta label, apagado 500 | active tab: honda sunken pill, tinta 600 (sunken because it is "where you are", not an action) | n/a | tab min-h 3.5rem; at `md` it moves to the top as today |
| Section header (`components/seccion.tsx`) | no rule any more: label meta 600 tinta left, figure meta 500 apagado right, margin-top 32 px | n/a | n/a | v6 `.sech` |
| Piece row (`components/fila-pieza.tsx`) | inside a group: pillar meta apagado, title 1rem 600, state meta tinta (with the working dot), chevron apagado when it opens | group row press | n/a | min-h 4.5rem |
| Working dot (`punto-trabajando.tsx`) | .625rem tinta with a 5 px tinta 16 % halo, pulse | n/a | still under reduced motion | `chico` .5rem |
| Meter (`medidor.tsx`) | track .625rem honda sunken, tinta fill; from 80 % the figure line adds a warning icon (no colour change) | n/a | n/a | figure in words, as today |

`LineaDeEstado` keeps its API and renders through the new parts, so most callers do not change: `exito` -> status pill
`ok`; `neutro` and `fecha` -> a flat line (icon + text, v6 `.linea`); `aviso` -> block; `error` -> error block with
`role="alert"` (or none when `anunciada`). `MarcaRevision` renders the review panel of decision 9.

### 5. One sign control, with a single-pointer path

v6 removes the "Aprobar" button (critique v3, P1: two controls for one irreversible act; the button read as a way to
skip the friction). WCAG 2.5.7 still requires a way to sign without dragging. Decision: **the track itself is the
single-pointer alternative, by tap to arm and tap to sign.** No second visible control.

- Drag: unchanged. Pointer captured on the thumb, signs on release at >= 96 %, springs back otherwise
  (`lib/diseno/deslizador.ts`). A pointer that moves more than 8 px is a drag or a scroll (`touch-pan-y` on the track),
  never a tap.
- Tap (pointer down and up within 8 px, anywhere on the track or thumb): **arms** the control. The thumb travels to
  the end (220 ms, instant under reduced motion), the trail fills with `--firma-rastro`, the label becomes "Toca otra
  vez para firmar" and `aria-valuetext` says the same. A second tap on the track between 400 ms and 4 s after the first
  signs. Under 400 ms it is ignored (an accidental double tap, or a VoiceOver double tap delivered as two events); after
  4 s the control disarms and the thumb returns. A disabled control never arms.
- Keyboard (`role="slider"`, `tabIndex 0`): Enter, Space and End sign (a key press is already a deliberate act).
  ArrowUp and ArrowRight arm, then sign on the second press; ArrowDown, ArrowLeft, Home and Escape disarm. The 4 % arrow
  steps go away.
- VoiceOver: a double tap is a click, so "double tap, then double tap again" signs; swipe up (increment) arms and signs
  like the arrows where WebKit maps it to arrow keys. Hidden hint (`aria-describedby`): "Enter o Espacio firman. También
  puedes tocar dos veces: la primera prepara la firma.". Checked on Coni's iPhone with VoiceOver before merge (Testing).
- While the action travels the thumb stays at the end, the trail is solid `--firma` and the label reads "Firmado"; a
  refused signature returns it to rest, as today.
- The label is "Desliza para firmar" on both gates. What the signature does goes in the consequence line under the
  track, linked with `aria-describedby` (decisions 9 and 11).

Why not the alternatives: a visually subtle "¿No puedes deslizar? Toca aquí" link puts a fourth idea in the bar at the
moment of most tension (critique v3, cognitive load) and is the second control v6 removed; a single tap would make the
signature cheaper than today's button. Two deliberate taps with a visible intermediate state keep the signature an act
and satisfy 2.5.7 (single pointer, no path) and 2.5.2 (signing happens on the up event).

### 6. Large text

At large sizes the fixed bars would cover half of the screen. v6 switches the layout with `html.t200`; the app sets the
same switch from the real sizes:

- An inline script in `app/layout.tsx` `<head>` (runs before first paint) sets `data-letra="grande"` on `<html>` when
  `innerWidth / rootFontSizePx < 18` (fewer than 18 rem across), and re-evaluates on `resize`, `pageshow` and
  `visibilitychange` (iOS applies a new text size when the app comes back). The predicate lives in
  `lib/diseno/letra.ts` (`esLetraGrande(anchoPx, raizPx)`) and is unit-tested; the script inlines the same arithmetic.
  At 390 px this switches from 21.7 px root up (xxxLarge and the accessibility sizes); at 375 px from 20.8 px (xxLarge).
- Why not a container query: `container-type` on an ancestor can make it the containing block of fixed descendants
  (the toast), and a container cannot style the toast once it is portalled out. A root attribute styles everything,
  exactly as v6's mock class does.
- Bars are `position: sticky; bottom: 0`, the last child of the screen (no more `--barra-max` padding; `main` drops its
  96 px end padding with `main:has([data-barra])`). Sticky behaves like fixed while the page scrolls and sits in the flow
  at the end.

| Rule | Default and large-but-under-threshold | `data-letra="grande"` |
|---|---|---|
| Sign bar | sticky bottom, radius 28 px top, `--relieve-alto-fijo` | `position: static` at the end of the page, radius 28 px all round, `--relieve`, margin-top 24 px |
| Track | 3.5rem, thumb 3rem, label starts at 4rem | min-h 3rem, thumb 2.25rem, label from 2.85rem, label wraps balanced |
| Bottom nav | sticky, icon + label | static after the content, one row of three icons at 1.2rem, labels visually hidden (still the accessible name), targets 2.75rem |
| Screen title | 2rem | capped at 1.5rem |
| Meta rows, piece header, date row | one line | wrap |
| Status pills | one line | icon top-aligned, radius 20 px, text wraps |
| Voice player | play + time on top, rail below | same (never collapses) |
| Gate 2 video | 9.5rem x 16.9rem, centred | full width, 9:16 |
| Video controls | icon + time on top, rail below | same, badges at .75rem |
| Toast | see below | fixed at 16 px + safe area, wraps, action on its own row aligned right |

Toast placement (a deviation from v6, which puts the toast in the flow at 200 %: a toast at the end of a long page is
never seen, Nielsen 1): on screens with a bottom nav it sits fixed above it (`bottom: calc(var(--alto-nav) + 12px)`,
`--alto-nav` = 3.5rem + 32 px + safe area); on screens with a sign bar it sits fixed at the top (safe area + 12 px), so
the bar is never covered and its variable height does not matter; at large text it sits at the bottom (nothing is
pinned there). It is portalled to `<body>`.

iOS's Large Content Viewer does not apply to web content; the hidden labels serve VoiceOver only. The three icons
(house, chart, gear) are the conventional ones.

### 7. Accessibility

Contrast (recomputed for this document with the WCAG formula; every pair the screens use):

| Text / mark | On | Ratio | Where |
|---|---|---|---|
| tinta `#262626` | piedra `#ebebea` | 12.69 | body, titles, secondary buttons |
| tinta | piedra-alta `#f4f4f3` | 13.75 | reading panels, review, flat groups |
| tinta | piedra-honda `#dcdcdb` | 11.03 | pills, blocks, active tab, chips, mark |
| apagado `#5a5a59` | piedra / alta / honda | 5.79 / 6.27 / 5.03 | meta, help, disabled labels |
| luz `#fbfbfa` | tinta | 14.62 | primary, selected chip, toast, checked box |
| error `#b5137a` | piedra / alta / honda | 5.27 / 5.71 / 4.58 | destructive confirm, error titles in blocks |
| luz | firma `#a8285a` | 6.51 | thumb arrow, "Firmado", `/l` text |
| luz | video `#3a3836` | 11.27 | badges and controls over the video |
| campo `#727271` (non-text) | piedra / alta / honda | 4.04 / 4.38 / 3.51 | rings, high-contrast outlines (1.4.11 >= 3) |
| firma (non-text) | honda / piedra | 4.91 / 5.65 | thumb against its track |
| honda | piedra | 1.15 | track against page: decorative; the track is identified by its thumb and label |

- Focus: `:focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px }` everywhere (tinta, never raspberry);
  3 px / 3 px on the sign track; luz on tinta surfaces (toast action) and on `/l`. Rows that wrap a hidden input show
  the ring on the row (`:has(input:focus-visible)`).
- `prefers-contrast: more`: every raised control, every sunken track or field, pills, panels and blocks add
  `outline: 2px solid var(--campo); outline-offset: -2px`; apagado text becomes tinta (v6 list).
- `forced-colors: active`: shadows vanish, so raised and sunken controls get `border: 1px solid CanvasText`.
- `prefers-reduced-motion`: durations go to 0 (tokens), the working dot and skeletons stop pulsing, the thumb and the
  disclosure chevron move instantly; every state change stays.
- Status semantics stay as today: `output` for polite states, `role="alert"` only for errors, the toast mounts empty and
  fills (announced), the after-sign block is `role="status"` and moves focus to "Deshacer".
- Targets: 2.75rem minimum everywhere, in rem so they grow with the text (the status pill's touchable word, if one ever
  appears, gets a 44 px hit area as in v6).
- Titles per route (WCAG 2.4.2, audit P2) are not part of this spec (follow-up list).

### 8. Inicio (`app/(app)/page.tsx`, `lib/inicio/modelo.ts`)

v6 screens 1 and 8. Structure, top to bottom:

1. "Hola, Coni" (meta 600) and the week (meta apagado), one row that wraps.
2. Title and one line under it (modelo):
   - With error notices: "Una cosa necesita tu atención" / "N cosas necesitan tu atención", and "Después, una espera tu
     firma." / "Después, N esperan tu firma." when there is something to sign.
   - Otherwise: "Esta semana está al día" (0), "Una espera tu firma" (1), "N esperan tu firma"; the line joins
     "K en preparación" (pieces in `grabando_voz`) and "unos M min" (3 min per signable piece) with " · ".
   - The count now excludes `grabando_voz` (critique v3, P2: it cannot be signed yet).
3. Attention (only with error notices): the first, by order `error_publicacion`, `error_produccion`,
   `guion_por_aprobar` with a reason, `guion_en_proceso` with a reason, `video_por_aprobar` with a reason, renders as a
   large error block: cause title (modelo `causa`: "No pude publicar.", "No pude terminar el video.", "Tu guion
   necesita atención.", "No pude escribir el guion.", "Elige otra fecha."), the piece title, `explicacion`, and today's
   action as the screen's one primary ("Revisar" or "Elegir otra fecha"). The rest render as rows in a raised group,
   each with its cause in a honda inline pill with the warning icon (v6 `.fila .m.av`). "Reconectar y publicar" and "No
   se cobró" are follow-ups (c, d).
4. `ok` notices (recent publication or manual upload): a flat block with the check icon and its link as a quiet action.
5. "Por subir" (unchanged content) as a raised group of piece rows.
6. "Necesita tu firma": the first signable piece as the card (meta "Video · 58 s" / "Guion · 52 s" and pillar; the
   title; one instruction line, "Mira el video, revisa el texto y elige la fecha." or "Escucha tu voz y revisa el
   guion."; "Revisar y firmar" as the primary, or as a secondary when the attention block holds the primary); the rest as
   a raised group; then "En preparación, aún no se firma" with the `grabando_voz` pieces in a flat group (meta
   "Preparando la voz" with the working dot). Empty: today's two lines; the "Elegir ideas ahora" link goes, the row in
   "Tu semana" is the way in.
7. "Avisos" (`AvisosSinLeer`, unchanged behaviour) as a raised group. The LinkedIn expiry notice keeps arriving here;
   the pill under the title is follow-up (f).
8. "En camino" as a raised group. Rows that are being worked on become links to the piece's screen (`/guion/<id>`,
   which shows the work in progress and the undo window), so the group is all touchable as in v6.
9. "Tu semana", a raised group: "Elegir ideas de la semana" (meta "N nuevas") as a disclosure row that expands today's
   `IdeasSemana` in place (same component, same action); "Ver calendario" (link, moved from "En camino"); "Consultas" as
   a disclosure row that expands `ConsultaNueva`.

The modelo changes are presentation only (grouping, counts, copy, `causa`, `instruccion`, links): no database read
changes and no other consumer exists.

### 9. Gate 1 (`app/(app)/guion/[id]/pantalla-guion.tsx`, `voz-para-firmar.tsx`, `textos.ts`)

v6 screens 2, 2b, 3, 7 and 9. Structure:

1. Back "Inicio" (raised pill); meta row (pillar left; "[formato · ]52 s" right); title (`--t-pieza`).
2. Date line (calendar icon, flat): "Si lo firmas hoy, sale el **jueves 22 de octubre · 09:00**", date in tinta 600.
   The raspberry on this date goes: it commits nothing yet, and v6 keeps raspberry to the thumb.
3. When there is a voice and an `explicacion` (a phrase HeyGen refused): a warning block with that text.
4. "1. Escucha tu voz":
   - voice ready: the player in two rows (play and "0:18 / 0:52" in meta 600 tinta on top, the rail below); after the
     full listen, the `ok` pill "La escuchaste completa" (was "Ya la escuchaste"); the play's name becomes "Escuchar de
     nuevo" once finished. The pre-listen hint "Escucha cómo suena antes de grabar" goes (the bar says what is missing).
   - `grabando_voz` (screen 3): the working line "Estoy preparando tu voz. Tarda unos segundos." (`output`).
   - no voice: a large block with "Preparar mi voz" as primary (cost on its right in meta apagado, v6 `.btn .precio`;
     a `bloqueoVoz` reason, balance or cap, as a line under it with the button disabled). With an `explicacion`
     (screen 7) it is an error block: title "No pude preparar tu voz." and, as detail, the rest of `explicacion` when it
     starts with that sentence (`TEXTO_SIN_VOZ`), else the whole `explicacion`. Without one: a neutral block "Falta
     preparar tu voz.". "No se cobró nada" is not shown (nothing tells the screen; follow-up d).
5. "2. Revisa el guion", with a figure on the right: "1 frase marcada" / "N frases marcadas" (unconfirmed warnings
   that all quote a phrase), "N por revisar" (otherwise), "Revisado" (all confirmed), nothing without findings.
   - The tone-mark help (`AYUDA_DE_MARCAS`, today's text) above the panel when the script has marks.
   - The script in a reading panel (`GuionEnLectura`): tone marks as honda chips; each finding's `frase`, at its first
     occurrence in the shown text, wrapped in `<mark>` (honda, 2 px tinta underline) linked to its review panel, with
     the flag icon after it. A phrase that crosses a tone mark is not highlighted; its panel quotes it as today.
   - One review panel per finding (`MarcaRevision`, flat piedra-alta, radius 24 px; v6 also draws a 4 px tinta rule on
     its left, see Open questions). A warning: icon + "Revisa la frase marcada" (or "Revisa este punto" without a
     phrase), the `mensaje`, the quoted phrase when not highlighted, and **today's checkbox "Lo revisé y está bien"**;
     once ticked the title reads "Frase revisada" / "Revisado". v6's two radio choices, the one-tap fix and "Ver en la
     fuente · pág. 5" need data the finding does not carry (follow-up b). A blocking finding: an error block "Hay que
     corregirlo", the `mensaje`, "Sin esto no puedes firmar." and a quiet "Editar el guion" that opens the disclosure.
     Without findings: today's meta line "Claude revisó el guion y no encontró observaciones. Tú decides.".
   - "Editar el guion": a disclosure whose summary is a full-width small secondary button. Inside: today's
     `EditorDeGuion` (script and caption fields, length hint, marks list, "Volver a la versión de Claude", save), then
     "Grabar la voz de nuevo" (secondary small, cost on the right, its reason line when blocked), then "Pedir cambios"
     (secondary) with the note "Escribo un guion nuevo y este se descarta." and today's in-line confirmation on tap.
     `<details>` keeps the editor mounted, so a draft survives closing it. Open by default when a blocking finding
     exists. In `grabando_voz` it holds only the disabled "Pedir cambios" with "Puedes pedir cambios cuando tu voz esté
     lista." (screen 3) and the caption read only.
6. "Más opciones" (disclosure): summary meta "Avatar: Consulta" (the chosen look's name). Inside: the looks as choice
   rows (2.25rem round photo, name, radio), and, when the piece has one, the LinkedIn text read only with the note that
   it is reviewed at gate 2 (`TextoLinkedinEnLectura`). When no look is chosen the summary reads "Avatar: falta
   elegirlo" and the disclosure renders open. v6's "El de siempre" needs a default look (follow-up j). No looks at all:
   today's `TEXTO_SIN_AVATARES` as a warning block in the bar (it blocks).
7. Sign bar, top to bottom:
   - an action error (`aprobacion` / `cambios`) as an error block;
   - a blocking reason as a block: `bloqueoVideo` (HeyGen balance or the month's cap, today's texts), no looks. v6 screen
     9's queue ("No puedo grabar todavía ... Queda en fila hasta que haya saldo") is follow-up (a): today the track is
     disabled and the block shows `bloqueoVideo`;
   - otherwise what is missing, one line with the info icon: "**Falta:** " + the items joined with " · ", in this
     order: "guardar tus cambios", "preparar tu voz" / "que termine tu voz" / "escuchar tu voz", "corregir el guion",
     "revisar 1 frase" / "revisar N frases" / "revisar N avisos", "elegir el avatar". This replaces the single reason
     of `motivoParaFirmar` (a pure function, renamed `faltaParaFirmar`, unit-tested);
   - the track "Desliza para firmar" (decision 5);
   - the consequence line, centred meta apagado, from `lineaDeFirma`: "Graba el video · US$ 3,48 · 8 s para deshacer"
     (without a cost: "Graba el video · 8 s para deshacer").
8. The undo toast after "Deshacer" ("Listo, no grabé nada. Puedes seguir revisando.") keeps its text, with the toast
   style and placement of decision 6.

### 10. After the signature (`app/(app)/guion/[id]/page.tsx`, `deshacer-firma.tsx`)

v6 screens 4 and 4b. The undo moves from a toast into the page, same action and same rules (version from the first
render, `quedanMs` from the server clock, `?deshecho=1` after an undo):

- During the window: a `role="status"` block: the `ok` pill "Firmaste", "Grabo tu video en N s" (`--t-pieza`; N from
  `quedanMs`, computed once, no ticking number for screen readers), "Si te arrepientes, deshazlo ahora. No se cobra
  nada." (true: HeyGen is not called before the window closes, and the voice was already paid before signing), and
  "Deshacer" (secondary small, focused on mount, "Deshaciendo…" while it travels). A refused undo shows its error block
  in place.
- When the window ends (a client timer of `quedanMs`) or on a later visit: the pill "Firmaste" stays, then the working
  line "Estoy grabando tu video." (`--t-pieza`) and "Unos 5 min. Te aviso cuando esté listo." (the estimate Inicio
  already shows).
- Under it, "Volver a Inicio" (secondary). v6's "Sigue esperando tu firma" card would add the Inicio read to a page
  that refreshes every 4 s; it is follow-up (g).
- `explicacion` set while recording ("El video está detenido"): a large error block with that title and detail.

### 11. Gate 2 (`app/(app)/video/[id]/pantalla-video.tsx`)

v6 screens 5 and 5b. Everything is visible before the video ends (today it appears after); the signature still waits
for the full watch.

1. Back "Inicio"; the video at 9.5rem x 16.9rem centred (full width at large text), radius 22 px, `--relieve`;
   badges stacked top left: "Avatar IA" and, while it plays and until it is complete, "faltan 0:24" (computed in the
   player from duration and time); controls in two rows (icon + time, rail below).
2. Meta row and title. After the full watch, the `ok` pill "Lo viste completo"; before it, nothing (today's "Míralo
   completo para aprobar" goes, the bar says it).
3. The checkbox "Revisé labios, nombre, subtítulos y cortes", right under the title, mandatory as today (Federico
   confirmed); it can be ticked at any time.
4. The first-time message (`MensajeDePrimeraVez`) as a reading panel; an `explicacion` as a warning block.
5. "Texto para LinkedIn" (when LinkedIn is a destination): the text in a reading panel at 1.125rem with its source line,
   "Editar el texto" as a small secondary, its findings as review panels.
6. "Dónde y cuándo": the date in 600 ("martes 20 de octubre, 09:00"), under it the destinations and the zone ("LinkedIn
   · hora de Chile", "LinkedIn e Instagram · hora de Chile"), "Cambiar" (small secondary, `aria-expanded`) opening the
   date choices as radio rows. This line is what keeps every signed destination visible when the checkboxes fold.
7. "Más opciones" (summary meta: the destinations that can be added and "regrabar video"): `ElegirDestinos` (today's
   two checkboxes and their help lines), the Instagram caption (`TextoDeInstagram`) and "Ver zonas de Instagram" when
   Instagram is chosen, "Regrabar video" (small secondary, `costoDeRegrabar` on its right) with the note "Se vuelve a
   grabar con tu avatar y este video se descarta." and today's in-line confirmation. When Instagram is chosen the
   caption is shown outside the disclosure too, as its own section "Así sale en Instagram", because it is published.
   The script and caption findings, when there are any, render as review panels in a "Revisión" section above "Dónde y
   cuándo".
8. Sign bar: when something is missing, "**Falta:** " + items: "terminar el video", "marcar lo que revisaste",
   "guardar el texto para LinkedIn", "guardar o cancelar la edición del texto", "corregir el texto", "revisar N
   frases"; a missing slot is a block ("No hay un horario libre. Avísale a Federico.", today's text). When nothing is
   missing, the summary line with check icons: "Video visto" and "Texto". Then the track and the consequence "Sale el
   martes 20, 09:00" (date of the chosen slot, short form; `page.tsx` adds the short label to each proposed date
   with `etiquetaDeFecha`, no new read). v6's "puedes cancelar hasta el lunes 19" has no rule behind
   it today (follow-up i).

### 12. Cuentas (`app/(app)/ajustes/cuentas/page.tsx`, `cuentas-conectadas.tsx`, `saldos.tsx`)

v6 screens 6 and 6b.

- Back "Ajustes"; title "Cuentas" (was "Cuentas conectadas"); line "Conectadas a Conidolly: lo que la app necesita para
  escribir, grabar y publicar.". The callback notice and the "todo bien" status as blocks.
- One flat group (piedra-alta); each account: the name at 1.25rem 600, its state as a status pill (`ok` "Conectada";
  `aviso` "Vence en 10 días" / "Falta"; `error` "Desconectada" / "No aceptó la llave"; `neutro` "A mano" / "Sin
  revisar"), `detalle` in meta ("Publica como Coni del Rosario"), then its actions:
  - LinkedIn connected: "Renovar LinkedIn" as primary when its state is `aviso` or `error`, else secondary small; then
    the danger disclosure "Desconectar LinkedIn". Open, a honda block with the warning icon and **today's text** ("Tus
    videos dejarán de salir solos ahí y te quedarán para subir a mano.", without the question form), "Sí,
    desconectar" (destructive confirm) and "Cancelar". v6's "lo programado no sale hasta que la conectes de nuevo"
    contradicts today's behaviour and is not used. Not connected: "Conectar LinkedIn".
  - Instagram: "Conectar Instagram" / "Renovar Instagram" (secondary small).
  - HeyGen, ElevenLabs, Claude: "Agregar la llave de X" / "Cambiar la llave de X" as a quiet action; the key form with a
    sunken field.
- "Saldos" stays its own section, today's lines in a reading panel. v6's per-account "Te alcanza para unos 14 videos",
  "se renueva el 12 de noviembre" and the Claude meter are follow-up (h).

### 13. Failure states

- `error_produccion` (v6 8b): a large error block "No pude terminar el video." (was "No se pudo terminar el video"; it
  also covers failures after recording, so not "grabar"), detail `explicacion` (or the generic text), primary
  "Reintentar"; under the block "Descartar esta pieza" as a quiet action with its confirmation; the voice to listen to
  and the HeyGen balance line stay below. "No se cobró", "Tu guion y tu voz siguen aprobados. Reintentar graba con el
  mismo avatar." and "Si vuelve a fallar, le aviso a Federico." are not shown: the screen cannot know the first, and the
  others are promises nobody checked (follow-up d).
- `guion_en_proceso` with a reason: the same block, "No pude escribir el guion" + reason + "Reintentar" / "Descartar".
- Voice failure: decision 9, step 4. Inicio: decision 8, step 3.
- `error_publicacion`, `para_subir_a_mano`, `programado`, `publicado`: their screens keep their content; their lines
  become pills and blocks through `LineaDeEstado`.

### 14. Screens without a v6 mockup

Ajustes, Ideas (bank and search), Calendario (mes, agenda, ritmo), Métricas, Ingreso, Por subir, Subir a mano, Programado
and Publicado get the tokens and the components of decision 4 and keep their structure: sections lose their rule,
lists become groups, cards become reading panels or the one high card (the idea card), fields sink, tabs become the
segmented control. No copy changes there. The month view at large text (audit P1) is not fixed here (follow-up l).

### 15. Brand literals (`lib/diseno/marca.ts`)

`COLOR_DE_FONDO = "#ebebea"` (theme-color, manifest background and theme), `COLOR_DE_TINTA = "#262626"` (icon
background), `COLOR_DE_FIRMA = "#a8285a"` (unchanged), `COLOR_DE_LUZ = "#fbfbfa"` replaces `COLOR_SOBRE_FIRMA` and is the
letter of the home-screen icon (today the letter uses `COLOR_DE_FONDO`, which would turn grey); `COLOR_DE_FONDO_OSCURO`
is deleted. `tests/unit/marca.test.ts` asserts `--piedra`, `--tinta`, `--firma` and `--luz` in `globals.css` and the
light-only viewport. iOS keeps the old home-screen icon until the app is added again; nothing breaks.

### 16. `/l`

Keeps the raspberry surface: it is the brand register (`docs/PRODUCT.md` exception), the colour is the same value as
the signature and the logo, and the page signs nothing for Coni inside the app. It does not adopt the relief (a light
halo on raspberry reads as pink fog). Changes: token renames, luz text and focus, the rem scale (17 px root), rows
keep their luz hairlines. theme-color stays `COLOR_DE_FIRMA`.

### 17. Copy

All copy is es-CL, tú, no em dashes. Strings that already exist keep their source. New UI copy:

| # | Where | Text | Replaces |
|---|---|---|---|
| 1 | Inicio title | "Una espera tu firma" / "N esperan tu firma" | "Una cosa espera tu firma" / "N cosas esperan tu firma" |
| 2 | Inicio line | "K en preparación" | (none) |
| 3 | Inicio title, failures | "Una cosa necesita tu atención" / "N cosas necesitan tu atención" | (none) |
| 4 | Inicio line, failures | "Después, una espera tu firma." / "Después, N esperan tu firma." | (none) |
| 5 | Inicio causes | "No pude publicar.", "Tu guion necesita atención.", "Elige otra fecha." | (none) |
| 6 | Inicio card | "Revisar y firmar" | (none) |
| 7 | Inicio card | "Mira el video, revisa el texto y elige la fecha." | (none) |
| 8 | Inicio card (script) | "Escucha tu voz y revisa el guion." | (none) |
| 9 | Inicio | "En preparación, aún no se firma" | (none) |
| 10 | Inicio | "Tu semana" | (none) |
| 11 | Inicio | "Elegir ideas de la semana" with "N nuevas" | (none) |
| 12 | Gate 1 date | "Si lo firmas hoy, sale el" | "Si lo apruebas hoy, sale el" |
| 13 | Gate 1 sections | "1. Escucha tu voz", "2. Revisa el guion" | "Voz", "Guion" |
| 14 | Gate 1 player | "La escuchaste completa" | "Ya la escuchaste" |
| 15 | Gate 1 player | "Escuchar de nuevo" (play, finished) | (none) |
| 16 | Gate 1 figure | "1 frase marcada" / "N frases marcadas" / "N por revisar" / "Revisado" | the count |
| 17 | Gate 1 review | "Revisa la frase marcada" / "Revisa este punto" | "Para confirmar:" |
| 18 | Gate 1 review | "Frase revisada" | (none) |
| 19 | Gate 1 review | "Hay que corregirlo" / "Sin esto no puedes firmar." | "Hay que corregirlo:" / "Sin esto no puedes aprobar." |
| 20 | Gate 1 | "Editar el guion" | (none) |
| 21 | Gate 1 | "Escribo un guion nuevo y este se descarta." | (none; the confirmation stays) |
| 22 | Gates 1 and 2 | "Más opciones" | (none) |
| 23 | Gate 1 | "Avatar: {nombre}" / "Avatar: falta elegirlo" | "Elige con qué avatar se graba" |
| 24 | Sign track | "Desliza para firmar" | "Desliza para aprobar y grabar", "Desliza para aprobar video y fecha" |
| 25 | Sign track, armed | "Toca otra vez para firmar" | (none) |
| 26 | Sign track, sent | "Firmado" | "Aprobado" |
| 27 | Sign track, hidden hint | "Enter o Espacio firman. También puedes tocar dos veces: la primera prepara la firma." | (none) |
| 28 | Sign bar | "Falta:" + "guardar tus cambios", "preparar tu voz", "que termine tu voz", "escuchar tu voz", "corregir el guion", "revisar 1 frase" / "revisar N frases" / "revisar N avisos", "elegir el avatar" | the single reasons of `motivoParaFirmar` |
| 29 | Gate 1 consequence | "Graba el video · US$ 3,48 · 8 s para deshacer" | "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer." |
| 30 | After signing | "Firmaste" (pill) and "Grabo tu video en N s" | toast "Firmaste. Grabo el video en N s." |
| 31 | After signing | "Si te arrepientes, deshazlo ahora. No se cobra nada." | (none) |
| 32 | After signing | "Unos 5 min. Te aviso cuando esté listo." | "Te aviso cuando esté listo." |
| 33 | After signing | "Volver a Inicio" | (none) |
| 34 | Gate 2 video | "faltan 0:24" | (none) |
| 35 | Gate 2 | "Dónde y cuándo" | "Dónde se publica", "Fecha de publicación" |
| 36 | Gate 2 | "{destinos} · hora de Chile" | "Hora de Chile · próximo horario libre" |
| 37 | Gate 2 | "Regrabar video" | "Regrabar" |
| 38 | Gate 2 bar | "Falta:" + "terminar el video", "marcar lo que revisaste", "guardar el texto para LinkedIn", "guardar o cancelar la edición del texto", "corregir el texto", "revisar N frases" | "Se activa al terminar de verlo." and the other single reasons |
| 39 | Gate 2 bar | "Video visto", "Texto" | (none) |
| 40 | Gate 2 consequence | "Sale el {fecha corta}" | (none) |
| 41 | Cuentas | "Cuentas" | "Cuentas conectadas" |
| 42 | Cuentas | "Conectadas a Conidolly: lo que la app necesita para escribir, grabar y publicar." | (none) |
| 43 | Cuentas | "Sí, desconectar" / "Cancelar" | "Desconectar" / "Volver" |
| 44 | Failures | "No pude terminar el video." | "No se pudo terminar el video" |

v6 strings checked against the code and found already there (kept): "Hola, Coni", "Necesita tu firma", "En camino",
"Preparando la voz", "Grabando · unos 5 min · te aviso", "Ver calendario", "Estoy preparando tu voz. Tarda unos
segundos.", "Puedes pedir cambios cuando tu voz esté lista.", "Grabar la voz de nuevo", "Pedir cambios", "Preparar mi
voz", "No pude preparar tu voz." (start of `TEXTO_SIN_VOZ`), "Deshacer", "Estoy grabando tu video.", "Avatar IA", "Lo
viste completo", "Revisé labios, nombre, subtítulos y cortes", "Texto para LinkedIn", "Editar el texto", "Lo subes tú
a mano", "Se vuelve a grabar con tu avatar y este video se descarta.", "Renovar LinkedIn", "Desconectar LinkedIn",
"Conectar Instagram", "Conectada", "Vence en N días", "Publica como", "Reintentar", "Lo revisé y está bien".
v6 strings not used because no behaviour or data backs them: see the follow-up list.

## Migration order

One branch (`feat/soft-ui`), batches reviewed one by one, TDD for every pure function and component change, the full
suite after each batch (`hard-won-lessons`: content changes break value tests).

1. **Tokens.** `globals.css` (new tokens, `@theme`, `--spacing: 4px`, type, focus, contrast and forced-colors blocks,
   no dark block; the old names kept as aliases of the new values), `lib/utils.ts` (`extendTailwindMerge`),
   `lib/diseno/marca.ts`, `lib/diseno/letra.ts` + the inline head script, `app/layout.tsx`. Tests first:
   `diseno-reglas` rewritten (gris neutro values, error is not firma, focus ring tinta, no dark block, no
   `prefers-color-scheme`), `marca`, `manifest`, `utils`, `letra`. The app renders with the new palette and the old
   layout.
2. **UI components.** `components/ui/*` and the new `estado`, `bloque`, `panel`, `grupo`, `mas-opciones`, `volver`,
   `icono`; then `seccion`, `fila-pieza`, `chip`, `nav-inferior`, `reproductor-voz`, `reproductor-video`,
   `guion-en-lectura` (marks and highlights), `deslizar-para-aprobar` (decision 5), `barra-de-firma` (sticky), `aviso`
   (portal and placement). Each with its unit test updated first.
3. **Gate 1, after signing and its failure states** (decisions 9, 10, 13).
4. **Gate 2** (decision 11).
5. **Inicio** (decision 8, modelo first).
6. **Cuentas and the screens without mockup** (decisions 12, 14), `/l` (16), icons (15).
7. **Large text and the accessibility pass** (decisions 6, 7), alias removal and the ban on old names, baselines
   regenerated, docs updated.

Then `/impeccable critique` and `audit` on the local app (target >= 34/40, no critical or high), Federico's review of
the captures against v6, and deploy.

## Visual regression

All 18 baselines in `tests/e2e/visual.spec.ts-snapshots/` change and are regenerated in step 7, after reviewing the
diff of each against its v6 counterpart (`pnpm comparar`, VISUAL_SHEET=1): `inicio`, `inicio-vacio`, `guion-con-voz`,
`guion-sin-voz`, `guion-por-aprobar`, `guion-grabando`, `guion-error`, `video-por-aprobar`, `ajustes`,
`ajustes-cuentas`, `ideas`, `calendario-mes`, `calendario-agenda`, `calendario-ritmo`, `metricas`, `ingreso`,
`ingreso-codigo-error`, `l`. New captures, one per v6 state: `guion-escuchada` (2), `guion-sin-escuchar` (2b),
`guion-preparando-voz` (3), `guion-firmado-ventana` (4), `guion-falla-voz` (7), `guion-sin-saldo` (9),
`inicio-con-fallas` (8), `video-sin-terminar` (5b), `cuentas-desconectar` (6b), and large-text variants of `inicio`,
`guion-escuchada`, `video-sin-terminar` and `ajustes-cuentas` (the test sets `html { font-size: 212.5% }`, re-runs the
large-text check and captures). `capturaDe` keeps forcing the bars static; its selector list follows the new
`data-barra` attribute.

## Testing

- Unit (Vitest): `faltaParaFirmar` (gate 1) and its gate 2 counterpart (order, joining, every item); the review figure
  and titles; the first-occurrence highlight of a phrase (found, absent, across a tone mark); `lineaDeFirma` (with and
  without cost); `esLetraGrande` (390/17 false, 390/23 true, 375/21 true); the modelo (titles for 0/1/N, attention
  order and causes, `grabando_voz` out of the count and into "En preparación", links on rows being worked on); the sign
  control (drag signs at 96 %; a tap arms and shows "Toca otra vez para firmar"; a second tap between 400 ms and 4 s
  signs, under 400 ms is ignored, after 4 s disarms; Enter, Space and End sign; ArrowUp arms then signs; Escape
  disarms; disabled never arms; signs once; returns on refusal; no "Aprobar" button); components render their grammar
  (pills have no shadow class, blocks carry the icon, the destructive word only on the confirm button); `cn` keeps
  custom sizes; the guard test (tokens, no old names, no hex, raspberry only in `deslizar-para-aprobar.tsx`,
  `wordmark.tsx`, `app/l/page.tsx` and `globals.css`).
- E2E (Playwright, fake services): sign gate 1 by drag and by two taps; undo inside the window from the in-page
  block; gate 2 signs only after the full watch and the checkbox; Inicio with failures shows one primary; the
  disconnect confirmation in Cuentas; at default size the sign bar's bottom equals the viewport bottom while scrolled
  (sticky works) and the toast never overlaps the bar or the nav (bounding boxes); at large text the bar and the nav are
  static, the nav shows no visible labels, and no route scrolls horizontally (`scrollWidth <= innerWidth`) at 390 px.
  `accesibilidad.spec.ts`: background `rgb(235, 235, 234)`, axe WCAG 2.2 AA on every route plus the new states and the
  large-text variants, and the same with `prefers-contrast: more`.
- Manual on Coni's iPhone (installed PWA) before merge: Dynamic Type at default, xxLarge and AX2; VoiceOver signs gate
  1 (double tap twice; swipe up where it works); daylight readability of raised against flat; macOS Safari keeps 17 px.

## Docs to update in the same branch

- `docs/DESIGN.md`: remove the "Aprobar" button sentence (decision 5), the stale values in "Do's" (#ecebe6, #fbfaf7,
  #2a2925, "Menta"), the warm shadow values, the committed-date raspberry; body at 1rem on the iOS body root; then
  `/impeccable document` to regenerate it from the code, as its header asks.
- `docs/PRODUCT.md`, accessibility: "Aprobar nunca depende solo de un gesto: se firma también con dos toques o con el
  teclado."
- `docs/TRASPASO.md`: the UI line (Soft UI v6, large-text switch, how to regenerate baselines).
- `2026-10-15-conidolly-voz-en-la-puerta-1-design.md`: a status line saying section 6's copy is superseded here.

## Deploy

Vercel only: `vercel deploy --prod --yes` after merge. No migration, no Trigger.dev deploy. Before reporting done,
check the served CSS carries a marker (`--piedra-honda` in the stylesheet) and load `/`, `/guion/<id>` and `/l` on the
alias (Vercel lags 15 to 45 s; Coni's phone may need the app reopened). Rollback: promote the previous deployment; no
data depends on the UI.

## Risks

- **Relief in daylight.** Soft shadows vanish in sunlight. Mitigation: no control depends on relief (shape, text, icon),
  contrast-more outlines, and the manual check on Coni's phone.
- **Changing the signature gesture.** Coni has used the "Aprobar" button; the tap path is new. Mitigation: the first tap
  explains itself on the track; Federico shows it to her once.
- **Sticky instead of fixed.** A sticky bar only sticks inside its parent; a screen that wraps the bar in a short
  element breaks it. Mitigation: the bar is the screen root's last child, and the E2E check of its position.
- **Root font size on non-iOS.** 106.25 % grows every rem by 6 %. Spacing is px (`--spacing: 4px`), so only text and
  targets grow; a forgotten px target becomes 44 px fixed, still valid. Grep for `min-h-11`, `size-12`, `h-14` in step 7.
- **Large-text script.** Runs before paint; if it fails the app is still usable with fixed bars (today's behaviour).
- **Baselines.** 31 captures to review by eye; the masks keep dates out, a month change still moves the calendar.
- **Scope creep.** v6 draws several behaviours; each one is held back to the follow-up list and the guard is the review
  of every batch against decision 1.

## Answered questions (Federico, 2026-10-16)

1. **No side rule on the review panel.** The 4 px tinta rule on the left is dropped (impeccable bans side-stripe
   borders); the review panel uses a full flat background with a 1 px `campo` border instead.
2. **Toast at the top on signing screens.** Confirmed: on screens with a sign bar the toast sits at the top so it never
   covers the bar; elsewhere above the nav.
3. **Key buttons in Cuentas.** "Cambiar la llave de X" moves into a folded "Más opciones" per account (WAV's
   operation, not Coni's).
4. **"Claude (Anthropic)".** Keep today's name.

## Follow-up spec (logic)

Behaviour v6 draws that the app does not have; each needs its own spec because it touches state, actions, data or
Trigger.dev:

- (a) **Sign into a queue when the HeyGen balance is short** (screen 9): today `bloqueoVideo` disables the signature
  with its reason. Needs a queued state, a resume when the balance returns, and the notice to Federico.
- (b) **One-tap fix of a flagged phrase** ("Usar “muchas”", with the voice redone) and **"Ver en la fuente · pág. N"**:
  `Hallazgo` carries no suggested replacement and no source page. Needs review data, an edit-and-revoice action and the
  exclusive choice that replaces the checkbox.
- (c) **"Reconectar y publicar"** from Inicio for an expired LinkedIn connection: today the piece goes to "subir a
  mano" and the renewal lives in Cuentas.
- (d) **Facts on failures**: whether a failed render was charged ("No se cobró"; the spend is released or confirmed in
  `lib/produccion/grabar.ts`), "Tu guion y tu voz siguen aprobados", "Reintentar graba con el mismo avatar", "Si vuelve
  a fallar, le aviso a Federico", "No se cobró nada" for a voice, and per-network publication causes ("No pude publicar
  en LinkedIn."). Today Inicio's failure notices are `error_produccion`, `guion_en_proceso` / `guion_por_aprobar` /
  `video_por_aprobar` with a reason, and `error_publicacion`, all with "Revisar" or "Elegir otra fecha".
- (e) **Desktop dense view for Federico and batch signing**: out of scope here and of v6.
- (f) **LinkedIn expiry pill under Inicio's title** with "Renovar": needs the account state on Inicio.
- (g) **"Sigue esperando tu firma" after signing**: the next piece on the after-sign screen.
- (h) **Balances per account** in Cuentas ("Te alcanza para unos 14 videos", "unos 140 guiones", "se renueva el ...",
  the Claude meter there).
- (i) **"Puedes cancelar hasta ..."** on gate 2: needs the cancellation rule of a scheduled piece.
- (j) **A default look** ("El de siempre") so gate 1 never asks for an avatar.
- (k) **The tone-mark legend only the first time** (v6 screen 3).
- (l) **Calendar month view at large text** (audit P1) and **a title per route** (WCAG 2.4.2, audit P2).

## Self-review

- No TBD or TODO; every v6 element is either specified with today's data or listed as a follow-up.
- Consistency: raspberry appears in decisions 2, 5, 15 and 16 only (thumb, trail, wordmark, `/l`, icon dot); magenta
  only inside honda blocks or on the destructive confirm; the gate 2 checkbox and the gate 1 review checkbox stay; the
  undo keeps its rules from the 2026-10-15 design; every copy change is in the table.
- Size: one plan of seven batches, all inside `globals.css`, components, screens and pure presentation helpers; no
  migration and no task.
