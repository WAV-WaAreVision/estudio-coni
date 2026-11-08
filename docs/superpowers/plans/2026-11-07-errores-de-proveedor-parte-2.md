# Provider errors part 2: a real «Avisar a Federico» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Where a failure needs WAV and is not a pause, Coni taps «Avisar a Federico», WAV gets one email per failure, and the screen says «Le avisé a Federico.».

**Architecture:** A new table `avisos_a_federico` keyed by a stable `clave` (entity, id, hash of the explanation), written only through security-definer functions with the claim pattern of `pausas_de_proveedor` (claim, send, mark; a failed send lets go). A server action reads the piece or material itself, refuses when it no longer fails, emails WAV through `Notificador.aWav`, and the four screens render a small client button that turns into the success line. Spec: `docs/superpowers/specs/2026-11-07-errores-de-proveedor-design.md`, decision 6 and amendment A11 (wins where they differ).

**Tech Stack:** Next.js 16 App Router (server actions), Supabase (RLS, security-definer plpgsql), Vitest (unit; integration against local Supabase at 127.0.0.1:54422), Playwright (projects `app` and `escritorio`), Biome.

**Repo rules that bite:** TDD strict (failing test first, then code); stage files explicitly (`git add <path>`); never `biome check --unsafe`; keep `"use client"` on line 1 of client files; never `supabase db reset` (apply the new migration locally with `pnpm exec supabase migration up` or psql); no em dashes in copy or comments; Coni's copy is Chilean Spanish with tú. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261108000100_avisos_a_federico.sql` (new) | table, RLS, `reclamar_aviso_a_federico`, `marcar_aviso_a_federico_enviado`, `soltar_aviso_a_federico` |
| `lib/supabase/database.types.ts` | regenerated types (only the new table and functions change) |
| `lib/dominio/avisar-a-federico.ts` (new) | `claveDeAviso`, copy constants, `asuntoDeAviso`, `cuerpoDeAviso`, `fallaParaFederico` (does this piece or material need WAV now?) |
| `lib/acciones/avisar-a-federico.ts` (new) | `avisarAFederico(deps, entrada)` and `yaAvisado(db, clave)` |
| `app/(app)/acciones-avisar.ts` (new, `"use server"`) | the server action wrapper with Coni's session, service client and `avisosReales()` |
| `components/avisar-a-federico.tsx` (new, `"use client"`) | the button and its states |
| `app/(app)/guion/[id]/textos.ts`, `voz-para-firmar.tsx`, `pantalla-guion.tsx`, `page.tsx` | the three piece places |
| `app/(app)/biblioteca/materiales/[id]/page.tsx` | the material place |
| tests: `tests/integration/avisos-a-federico.test.ts`, `tests/integration/avisar-a-federico.test.ts`, `tests/unit/avisar-a-federico.test.ts`, `tests/unit/boton-avisar-a-federico.test.tsx`, `tests/e2e/avisar-a-federico.spec.ts`, `tests/e2e/avisar-a-federico.escritorio.ts` | |

---

## Lote 1: data and action

### Task 1: the table and its functions

**Files:** Create `supabase/migrations/20261108000100_avisos_a_federico.sql`; Test `tests/integration/avisos-a-federico.test.ts`; Modify `lib/supabase/database.types.ts`.

- [ ] **Step 1: failing integration test.** Follow `tests/integration/pausas-esquema.test.ts` and `abrir-pausa.test.ts` (same helpers for a service client, a Coni client and an outsider). Cases:
  - `reclamar_aviso_a_federico('pieza:<uuid>:abc', 'pieza', <uuid>)` as service_role answers `true` the first time, `false` the second (claimed, not stale), and `false` after `marcar_aviso_a_federico_enviado` (sent).
  - after `soltar_aviso_a_federico` the next claim answers `true` again.
  - a claim older than 5 minutes (update `reclamado_en` by hand in the test) is handed on: `true`.
  - Coni reads the rows (select), cannot insert, update or delete; an outsider reads nothing; `authenticated` cannot execute the three functions.
- [ ] **Step 2:** run `pnpm exec vitest run tests/integration/avisos-a-federico.test.ts`; expect FAIL (missing function).
- [ ] **Step 3: the migration.**

```sql
-- «Avisar a Federico» (spec 2026-11-07, decision 6 and amendment A11): one email to WAV per failure, however many taps.
create table public.avisos_a_federico (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (length(clave) between 1 and 200),
  tipo text not null check (tipo in ('pieza', 'material')),
  entidad_id uuid not null,
  creado_en timestamptz not null default now(),
  reclamado_en timestamptz,
  enviado_en timestamptz
);

alter table public.avisos_a_federico enable row level security;
create policy "coni y wav leen avisos a federico" on public.avisos_a_federico for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
revoke all on public.avisos_a_federico from anon, authenticated;
grant select on public.avisos_a_federico to authenticated;

-- Claims the email: true for the one caller that must send it now. A sent row never claims again; a claim whose
-- caller died is handed on after five minutes (as the pauses do).
create function public.reclamar_aviso_a_federico(p_clave text, p_tipo text, p_entidad_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_avisar boolean;
begin
  insert into public.avisos_a_federico (clave, tipo, entidad_id)
  values (p_clave, p_tipo, p_entidad_id)
  on conflict (clave) do nothing;
  update public.avisos_a_federico
     set reclamado_en = now()
   where clave = p_clave
     and enviado_en is null
     and (reclamado_en is null or reclamado_en < now() - interval '5 minutes')
  returning true into v_avisar;
  return coalesce(v_avisar, false);
end;
$$;

create function public.marcar_aviso_a_federico_enviado(p_clave text) returns void
language sql security definer set search_path = '' as $$
  update public.avisos_a_federico set enviado_en = now() where clave = p_clave;
$$;

create function public.soltar_aviso_a_federico(p_clave text) returns void
language sql security definer set search_path = '' as $$
  update public.avisos_a_federico set reclamado_en = null where clave = p_clave and enviado_en is null;
$$;

revoke execute on function public.reclamar_aviso_a_federico(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.marcar_aviso_a_federico_enviado(text) from public, anon, authenticated;
revoke execute on function public.soltar_aviso_a_federico(text) from public, anon, authenticated;
grant execute on function public.reclamar_aviso_a_federico(text, text, uuid) to service_role;
grant execute on function public.marcar_aviso_a_federico_enviado(text) to service_role;
grant execute on function public.soltar_aviso_a_federico(text) to service_role;
```

  Check `20261107000100_pausas_de_proveedor.sql` for anything else the repo adds to every table (an audit trigger, a comment convention) and mirror it.
- [ ] **Step 4:** apply locally (`pnpm exec supabase migration up` from the worktree; never `db reset`), regenerate types the way the repo does (`grep -n "gen types" package.json docs/TRASPASO.md`), run the test; expect PASS.
- [ ] **Step 5:** commit `Add avisos_a_federico to email WAV once per failure`.

### Task 2: the domain module

**Files:** Create `lib/dominio/avisar-a-federico.ts`; Test `tests/unit/avisar-a-federico.test.ts`.

- [ ] **Step 1: failing unit tests** for:
  - `claveDeAviso({ tipo: "pieza", id, explicacion })` is `pieza:<id>:<first 16 hex of sha256(explicacion)>`; the same input gives the same key, another explanation another key.
  - `fallaParaFederico` for a piece: returns the explanation when it is a key failure of the voice (`esFallaDeLlave`, from `app/(app)/guion/[id]/textos.ts`; move that regex into this module and re-export it from `textos.ts` so the screens keep importing it), or when the piece is `en_render` or `subtitulando` with an explanation; returns `null` for a pause text (`proveedorDelTextoDePausa` from `lib/dominio/pausas.ts`), for no explanation, and for a failure she can retry herself.
  - for a material: returns `TEXTO_FICHA_ILEGIBLE` («No pude leer la ficha de este material.») when `estado === "listo"` and its ficha does not parse; `null` otherwise. Reuse whatever the material page uses today to read the ficha (find it in `app/(app)/biblioteca/materiales/[id]/page.tsx`); extract it to a shared function if it lives inside the page.
  - `asuntoDeAviso` is `Coni te avisa: «<título>»`; `cuerpoDeAviso` has the kind («Pieza» or «Material»), the title, the explanation and the link `${URL_DE_LA_APP}/guion/<id>` or `${URL_DE_LA_APP}/biblioteca/materiales/<id>` (`URL_DE_LA_APP` from `lib/diseno/marca.ts`).
  - constants: `ETIQUETA_AVISAR = "Avisar a Federico"`, `TEXTO_LE_AVISE = "Le avisé a Federico."`, `TEXTO_YA_NO_FALLA = "Esto ya no está fallando. Vuelve a abrir la pantalla."`.
- [ ] **Step 2:** run, FAIL. **Step 3:** implement. **Step 4:** run, PASS. **Step 5:** commit.

### Task 3: the action

**Files:** Create `lib/acciones/avisar-a-federico.ts`, `app/(app)/acciones-avisar.ts`; Test `tests/integration/avisar-a-federico.test.ts`.

- [ ] **Step 1: failing integration tests** (local Supabase, `notificadorEnMemoria()` from `lib/proveedores/avisos.ts`):
  - a piece in gate 1 with a key failure: two calls send one email (`aWavEnviados.length === 1`), both answer `{ ok: true }`; the email's subject and body come from Task 2.
  - two concurrent calls (`Promise.all`) send one email.
  - an `aWav` that throws: the action answers `{ ok: false, error: ERROR_GENERICO }`, the row is not sent and a second call sends it.
  - a piece whose explanation is a pause text, or has none: `{ ok: false, error: TEXTO_YA_NO_FALLA }` and no email.
  - a ready material whose ficha does not parse: one email; a material with a good ficha: refused.
  - `yaAvisado(db, clave)` is `true` only after the email went out.
  - the server action refuses a session that is not Coni's (follow how `conSesionDeConi` is tested for another action).
- [ ] **Step 2:** run, FAIL.
- [ ] **Step 3: implement.**

```ts
export interface DepsAvisar {
  /** A `service_role` client: the action reads the entity itself and calls the claim functions. */
  db: SupabaseClient<Database>
  /** Resolved on use, like the other actions (a missing Resend key must not break the screen). */
  avisos: () => Notificador
}

export type EntradaAvisar = { tipo: "pieza" | "material"; id: string }

export function avisarAFederico(deps: DepsAvisar, entrada: EntradaAvisar): Promise<Resultado> {
  return aResultado("avisarAFederico", async () => {
    // 1. read the piece (titulo, estado, explicacion) or the material (titulo, estado, ficha) with deps.db
    // 2. const explicacion = fallaParaFederico(...); if null throw new Falla(TEXTO_YA_NO_FALLA)
    // 3. const clave = claveDeAviso({ tipo, id, explicacion })
    // 4. rpc reclamar_aviso_a_federico; if false return {} (already sent or being sent: the screen says it was told)
    // 5. try { await deps.avisos().aWav(asunto, cuerpo); rpc marcar_aviso_a_federico_enviado }
    //    catch (error) { rpc soltar_aviso_a_federico; throw error }
    return {}
  })
}
```

  Every rpc error throws with its message (no silent catch). `yaAvisado(db, clave)` selects `enviado_en` by `clave`. The server action in `app/(app)/acciones-avisar.ts` validates the input with zod (`tipo` enum, `id` uuid), uses `conSesionDeConi` and `clienteDeServicio` from `lib/acciones/servidor.ts` and `avisosReales` lazily, as `app/(app)/ideas/acciones.ts` does.
- [ ] **Step 4:** run, PASS; `pnpm exec tsc --noEmit`; `pnpm exec biome check <files>`.
- [ ] **Step 5:** commit.

## Lote 2: the screens

### Task 4: the button

**Files:** Create `components/avisar-a-federico.tsx`; Test `tests/unit/boton-avisar-a-federico.test.tsx` (follow `tests/unit/avisos-sin-leer.test.tsx` for rendering a client component with a fake action).

- [ ] **Step 1: failing tests:** with `avisado` it renders `LineaDeEstado` success «Le avisé a Federico.» and no button; without it a secondary button «Avisar a Federico» (44 px or more, `clasesDeBoton({ variante: "secundario" })`); a tap calls the action once with `{ tipo, id }`, shows it busy (`aria-busy`, disabled) and then the success line; an answer `{ ok: false, error }` shows the error under the button and leaves it enabled.
- [ ] **Step 2-5:** fail, implement (`useTransition`; `"use client"` on line 1; icon `EnvelopeSimple` from `@phosphor-icons/react` sized `ICONO.medio`), pass, commit.

### Task 5: the four places

**Files:** Modify `app/(app)/guion/[id]/textos.ts`, `voz-para-firmar.tsx`, `pantalla-guion.tsx`, `page.tsx`, `app/(app)/biblioteca/materiales/[id]/page.tsx`; tests next to the existing ones of each screen (`grep -rln "TEXTO_AVISA_A_FEDERICO\|Avísale a Federico" tests`).

- [ ] **Step 1: failing tests**, one per place: the text no longer says «Avísale a Federico»; the button is there with `tipo` and `id`; when `yaAvisado` it shows «Le avisé a Federico.»; a pause still shows no button.
- [ ] **Step 3: copy.** `TEXTO_AVISA_A_FEDERICO` goes; the texts that embedded it say what happened and what comes next:
  - gate 1 voice, key failure, button open: «Cuando Federico lo arregle, puedes intentarlo otra vez.» plus the button; button closed: only the button.
  - «Grabar la voz de nuevo» with a key failure: `TEXTO_NO_PUDE_REHACER_VOZ` plus the button.
  - video stopped: `TEXTO_DETENIDO_EN_SUS_PALABRAS` becomes «No puedo seguir grabando por ahora.» plus the button.
  - material: «No pude leer la ficha de este material.» plus the button.
  The server pages compute `claveDeAviso` and `yaAvisado` (with the service client, after Coni's session) and pass `avisado` down; a client component (`voz-para-firmar.tsx`) gets it as a prop.
- [ ] **Step 4:** unit tests pass; `tsc`; `biome check`; `grep -rn "Avísale a Federico" app components lib` returns only the texts that still need it, if any, and you list them in the report.
- [ ] **Step 5:** commit.

### Task 6: E2E and captures

**Files:** Create `tests/e2e/avisar-a-federico.spec.ts` (phone) and `tests/e2e/avisar-a-federico.escritorio.ts` (desktop, measured like `tests/e2e/pausas.escritorio.ts`).

- [ ] Phone: seed a gate-1 piece whose explanation is an ElevenLabs 401 key failure (find the exact stored text in the voice tests); tap «Avisar a Federico»; see «Le avisé a Federico.»; reload; still the line and no button. A stopped video and a material without a readable ficha: the button is there. How WAV's email is observed in E2E: follow `tests/e2e/pausas*` (if it reads the outgoing mail through `configurarServicios` or a fake, assert one email after two taps; if E2E cannot see it, the integration test of Task 3 covers it and you say so).
- [ ] Desktop: the same three places at 1280 x 900 with no sideways scroll; captures `avisar-voz`, `avisar-video`, `avisar-material` (phone and desktop) with `capturar`.
- [ ] Run the full gate: `pnpm lint`, `pnpm exec tsc --noEmit`, unit, integration, E2E both projects. No visual baselines change without Federico seeing the captures.
- [ ] Commit.

## Release

1. `supabase db push --dry-run --linked` shows only `20261108000100_avisos_a_federico.sql`; push.
2. PR «Part of #96», CI green, merge (Vercel deploys `main`). No Trigger deploy.
3. TRASPASO note by a docs PR; close #96 and set it to Listo.
