# Traspaso de sesión (2026-10-01)

Nota para retomar el trabajo del Estudio de Coni en una sesión nueva. Leer entera antes de tocar nada.

## Qué es esto

- **`~/Projects/estudio-coni`**: la plataforma (Next.js 16, Supabase, Trigger.dev v4), rama `main`.
  Coni del Rosario aprueba y publica los reels de su avatar IA con dos puertas humanas.
- **`~/Projects/coni-heygen`**: el repo original con el diseño (`docs/designs/plataforma-coni.md`,
  `PRODUCT.md`, `DESIGN.md`), el banco de ideas y `coni.py`. Rama `contenido/banco-ideas` (sin push).
- Planes y sus "Execution notes" (decisiones y pendientes heredados): `estudio-coni/docs/superpowers/plans/`.
- Modo de trabajo acordado con Federico: rápido, un implementador por plan (Sonnet), revisión con
  cavecrew + verificación propia, merge local a `main` con `--no-ff`, sin push ni cuentas en la nube.

## Estado en `main` (integrado y verde)

| Plan | Contenido | Merge |
|---|---|---|
| 1 | Dominio: port de coni.py, máquina de estados, puertas | `05e8e1b` |
| 2 | Base: RLS, triggers de puertas, auditoría, tope de gasto, Vault | `c82a22c` |
| 3a | producir-pieza: guion con Claude, revisión, voz ElevenLabs | `06ffa27` |
| 3b | grabar-pieza: HeyGen v3, subtítulos ffmpeg + Montserrat, R2 | `94cfb9f` |
| 4 | publicar-pendientes (Instagram, etiqueta IA), avisos, mantenimiento | `91eacab` |
| 5a | App: ingreso por código, Inicio, Guion, Video, E2E | `22d1f86` |
| 5b | Plan escrito (dos frentes) | `4b2c9d5` |

Último estado verde en `main`: 853 unit, 302 integración, 15 E2E, build OK.

## En curso: Plan 5b en dos worktrees (agentes en segundo plano al momento del clear)

Plan: `docs/superpowers/plans/2026-10-01-app-resto.md`.

**Frente A** · `~/Projects/estudio-coni-a` · rama `feat/app-ajustes-ideas` · migraciones 1300-1399 · usa el
stack Supabase `estudio-coni` (puertos 54420-54429).
- Hecho: `f91b087` editar texto como Coni, `90dca2d` mantenimiento relanza runs no arrancados,
  `1220e0c` importador del banco, `a1ebf95` pantalla Banco de ideas.
- En curso al momento del clear (sin commit): Ajustes + "Conectar Instagram" (OAuth) en
  `supabase/migrations/20261001001303_ajustes_y_instagram.sql`, `tests/integration/ajustes.test.ts`,
  `tests/unit/instagram-oauth.test.ts`.
- Falta: commit de Ajustes y las "Track A notes" en el plan.

**Frente B** · `~/Projects/estudio-coni-b` · rama `feat/app-metricas-l` · **TERMINADO**, árbol limpio,
HEAD `9c2f207`, `supabase/config.toml` restaurado y su stack detenido.
- Commits: `700adfd` overrides de puertos para worktrees, `120b2de` métricas diarias, `d93c83f` consultas,
  `9bfe7e9` `/l` con conteo sin IP, `c24adb8` Métricas, `5bcf792` Calendario, `db5cd03` notas, `9c2f207`
  arreglos tras revisión (vista `metricas_ultimas`, `olvidar_visitas_clic`).
- Verde: 981 unit, 347 integración, 32 E2E, build OK. Capturas en el scratchpad de la sesión anterior
  (`.../scratchpad/capturas/metricas-*.png`, `calendario-*.png`, `l-publica.png`); regenerarlas si hacen falta.
- Para producción: definir `SAL_DE_CLICS` en Vercel y llenar `ajustes.enlaces` (los 4 links vienen con url
  null; no hay editor en Ajustes). `profile_links_taps` no mide el link de la bio: los toques salen de `/l`.
- Conflictos esperados con A: `lib/supabase/database.types.ts` (regenerar), final del archivo del plan
  (dejar ambas notas), `app/(app)/page.tsx` (Inicio: "Ver calendario" + bloque de consultas de B).
- Pendiente conocido: `/l/ir` sin límite de tasa.

## Cómo retomar

1. Mirar si los agentes terminaron: `git -C ~/Projects/estudio-coni-a status --short` y lo mismo en `-b`.
   Si quedaron cambios sin commit y nadie trabaja ahí, revisarlos, terminarlos o commitearlos.
2. En `-b`: `git checkout -- supabase/config.toml` si sigue modificado; `supabase stop` del stack
   `estudio-coni-b` (desde el worktree `-b` con su config, antes de restaurarla) para liberar memoria.
3. En cada worktree: `pnpm lint`, `pnpm type`, `pnpm test:run`, `pnpm test:db` (A contra 544xx; B contra
   su stack o, tras restaurar, contra 544xx con `supabase db reset`), `pnpm build`, `pnpm test:e2e` con
   `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
4. Revisión rápida (cavecrew-reviewer) de cada rama, verificando cada hallazgo antes de actuar.
5. Merge en `main`: primero A, después B (migraciones no chocan por rango). Si hay conflicto, suele ser
   en `lib/supabase/database.types.ts` (regenerar con `pnpm db:types` tras `supabase db reset`), en
   `components/nav-inferior.tsx`, en `app/(app)/page.tsx` (Inicio enlaza a ideas y calendario) o en
   `.env.example`. Después: `supabase db reset` en el stack 544xx y correr todo de nuevo.
6. Borrar worktrees y ramas: `git worktree remove ../estudio-coni-a` (y `-b`), `git branch -d ...`.
7. Mostrarle a Federico capturas 390x844 de Ajustes, Banco, Métricas, Calendario y `/l`.

## Después del Plan 5b

- **Plan 6 restante:** T18 (modelo de costos actualizado en coni-heygen), resumen diario 08:30 y push en
  la PWA (T13), hoja de instalación, tabla de notificaciones.
- **Despliegue (requiere OK de Federico, cuentas de WAV):** repo privado en GitHub, proyecto Supabase,
  Trigger.dev, bucket R2, Resend con dominio de Coni, Vercel Pro, app de Meta. Ver los pendientes de
  "hosted setup" en las Execution notes del Plan 5a (plantilla de correo con `{{ .Token }}`, variables).
- **Probar de verdad antes de lanzar:** evals de Claude (`pnpm test:eval` con `RUN_EVALS=1`, cuesta plata),
  callback de HeyGen vía token de Trigger, ffmpeg y fuente en el contenedor, etiqueta de IA leída de
  vuelta en un post real, iPhone real (VoiceOver, autocompletar código, video inline).

## Reglas que no se negocian

Dos puertas humanas; solo Coni aprueba; nunca publicar fuera de la hora aprobada ni sin verificar;
llaves fuera del repo; HeyGen solo v3; textos para Coni en español de Chile sin rayas largas;
TDD; nada de `as any`, `@ts-expect-error`, aserciones no nulas ni catch silenciosos; Biome solo en
modo seguro; repos privados; commit y push solo cuando Federico lo pide.
