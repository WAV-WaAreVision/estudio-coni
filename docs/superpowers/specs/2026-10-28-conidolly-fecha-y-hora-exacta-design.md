# Conidolly: exact date and time at gate 2

Date: 2026-10-28. Status: approved by Federico in brainstorming (design and the 15-minute minimum).

## Goal

At gate 2 of a reel or a carousel, Coni can pick any day and time to publish, not only the free slots of her schedule.
The schedule slots stay the default. It is also the quickest way to test the first automatic LinkedIn carousel (part 3)
a few minutes ahead.

## Context verified on 2026-10-28

- Gate 2 offers 4 times from `fechasDePuerta2` (`app/(app)/fechas-de-puerta-2.ts`): the piece's live Repartir proposal
  first, then free slots of `ajustes` (days and hour) at least 1 hour ahead (`proponerFechas`, `lib/dominio/fechas.ts`).
- Reel gate 2: `app/(app)/video/[id]/pantalla-video.tsx`, section "Dónde y cuándo". Carousel gate 2:
  `app/(app)/guion/[id]/puerta-2-carrusel.tsx`, section "Cuándo sale". Both render `datos.fechas` as radio options and
  keep the chosen ISO in state.
- The server does not restrict the time to the offered slots: `aprobarVideo` and `aprobarCarrusel`
  (`lib/acciones/piezas.ts`) only check that no other `programado` piece has exactly that instant
  (`exigirHorarioLibre`), and `fechaDePublicacion` (`lib/dominio/estados.ts`) only that it is after the approval.
- `publicar-pendientes` runs every 5 minutes (`trigger/publicar-pendientes.ts`), so a piece goes out at the first tick
  at or after its time. LinkedIn's approved half hour (`puertas.ts`) is unchanged.
- The schedule hour in Ajustes can have any minute, so the 5-minute step below applies only to the new picker.
- `instanteLocal(fecha, zona)` already turns a Chile wall clock into a UTC instant, across daylight saving changes.

## Design

### F1. The option

Under the schedule slots, one more radio option: "Otra fecha y hora". Choosing it shows a day field and a time field
(native `<input type="date">` and `<input type="time" step="300">`), labelled "Día" and "Hora", with the suffix
"hora de Chile". The schedule slots remain first and the first one stays selected by default. Same component in both
gates (one shared component, used by the reel and the carousel screens).

- The day starts empty, the time starts at the schedule hour (rounded down to 5 minutes).
- While the day or the time is missing or invalid, nothing is chosen: the slide shows the existing "falta" line and the
  status under the fields says what is missing: "Elige el día." / "Elige la hora."
- Valid pick: the summary at the top of the section shows its long label ("miércoles 28 de octubre · 10:15") like a
  slot, and the consequence line uses its short label.

### F2. Rules for the picked time

Pure function in `lib/dominio/fechas.ts`, `horaElegida({ dia, hora, zona, ahora })`, returning either the UTC ISO or a
reason:

- day and time readable (`AAAA-MM-DD`, `HH:MM`), else "Elige el día." / "Elige la hora.";
- minutes a multiple of 5, else "Elige una hora en bloques de 5 minutos." (the publisher runs every 5 minutes, so a
  10:07 would really go out at 10:10);
- at least 15 minutes after `ahora`, else "Elige una hora con al menos 15 minutos de anticipación.";
- within the 400 days `proponerFechas` already looks at, else "Elige una fecha dentro del próximo año.".

The screen runs it on every change (with the client clock) to show the reason under the fields. The server runs the
15-minute rule only (the schedule hour may have any minute): a new `exigirAnticipacion(publicarEn, ahora)` in
`lib/acciones/piezas.ts`, called by `aprobarVideo` and `aprobarCarrusel` next to `exigirHorarioLibre`, throws
`Falla("Elige una hora con al menos 15 minutos de anticipación.")`. Schedule slots are offered at least 1 hour ahead, so
they pass unless the screen sat open past them, which is the right refusal.

### F3. What follows the pick

- The carousel's LinkedIn line (`lineaDeLinkedin`) reads the picked ISO, as it does a slot, including the "vence antes
  de esa fecha" case. The reel gate has no such line today and gets none.
- A clash with another scheduled piece at exactly that instant keeps the current error ("Ese horario ya lo tiene otra
  pieza. Elige otro." / "otro reel").
- "Cambiar fecha" on a scheduled piece returns to gate 2 as today, with the picker available.

### F4. What does not change

Database, migrations, the publisher, Ritmo, Repartir and the Agenda. The Agenda still lists schedule slots as free or
taken; a piece at a time outside the schedule shows on its day like any other.

Copy rules: tú, Chile, no em dashes, no jargon.

## Tests (test first)

- Unit, `horaElegida`: valid pick returns the UTC instant (summer and winter offset); missing day; missing time; minute
  not a multiple of 5; less than 15 minutes ahead; exactly 15 minutes ahead passes; past; beyond 400 days.
- Unit, actions: `aprobarVideo` and `aprobarCarrusel` refuse a time 10 minutes ahead and accept one 20 minutes ahead
  that is not a schedule slot.
- Component: choosing "Otra fecha y hora" shows the fields; invalid input shows the reason and keeps the slide locked;
  a valid pick updates the summary and, on a carousel, the LinkedIn line.
- E2E: schedule a carousel and a reel at a picked time; the scheduled screen shows that time.
- Visual: the section with the picker open (fixed date in the capture, as the gate 2 baselines do).

## Rollout

Vercel only (no migration, no Trigger change), from a clean `git archive` of main. Then the part 3 smoke: Coni or
Federico schedules a carousel 15 to 20 minutes ahead and Claude watches `publicar-pendientes` in Trigger.dev.
