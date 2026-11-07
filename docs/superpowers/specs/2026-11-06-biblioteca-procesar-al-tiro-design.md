# Biblioteca in Conidolly, batch 6: process at once and say what it costs (4a)

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 6 of 7. Batch frame: `2026-11-02-biblioteca-materiales-design.md`.
Source: Coni's request, point 4a: «procesar de inmediato mostrando el costo y avisando, sin esperar un toque en
"Procesar por ~US$ X", salvo lo que el cambio 8 deja con estimado previo». Approved by Federico on 2026-11-06.

## Today

`procesar-material` reads the source (extraction), estimates what the rest will cost, and when the estimate is above
`UMBRAL_CONFIRMACION_USD` (US$ 1) it stops: it writes `costo_estimado_usd` and a motivo («Este material es largo...
Confírmalo para seguir.») and ends with `esperando_confirmacion`. The Biblioteca shows the state «Espera tu OK» and the
button «Procesar por ~US$ X» (`BotonConfirmarCosto`, `confirmarCosto`), which sets `costo_confirmado_en` and runs again.
In production on 2026-11-06, 0 of 7 materials are waiting.

## Decisions

1. **No cost gate.** The task never stops for the cost. Runaway spend is held by what Coni already decided (A-answers of
   2026-11-01): the spend alarm and the hard limit at twice the month's cap. A material that reaches the hard limit stops
   with its motivo, as today (`detenidoPorLimite`).
2. **The estimate is written for every material**, whatever its size, right after the extraction and before the paid
   steps: `costo_estimado_usd = estimarCostoRestante(partes, rol)`, without a motivo and without freeing the claim. The
   run goes on.
3. **The notice.** While a material is `procesando` and not marked with a motivo:
   - with `costo_estimado_usd`: «Lo estoy procesando. Costará cerca de US$ 0,40.» (two decimals, es-CL);
   - without it yet (before the extraction ends): «Lo estoy procesando.», as today.
   It is shown on the material page and in the desktop side panel. The list keeps the state «Procesando» with its icon.
4. **What goes away in Conidolly:** `BotonConfirmarCosto`, `confirmarCosto` / `confirmarCostoAccion`, the «Espera tu OK»
   state (`esperaConfirmarCosto` or its equivalent in `lib/dominio/biblioteca/estado.ts`) and every branch that draws it,
   `esperaConfirmacion` and the `esperando_confirmacion` result in `lib/ingesta/procesar.ts`, `UMBRAL_CONFIRMACION_USD`.
   The «Costo estimado» line in «Detalle para WAV» stays, without «(confirmado / sin confirmar)».
5. **No migration.** `costo_confirmado_en` stays in the schema unused by Conidolly: Ingesta still reads and writes it
   until stage 3, and its confirm button simply never shows because no material waits any more. No Ingesta PR.
6. **Retry, reprocess and the deletion stop** keep working: they no longer read `costo_confirmado_en`; any reset of it
   they do today is removed.
7. **Out of scope:** folders and batches with a prior estimate (change 8, not built), showing the real cost after the run.

## Shipping

Order is reversed on purpose: **Trigger first**, then the app.
1. Trigger deploy of `procesar-material` (Federico's OK). From then on no material waits; the app still deployed has
   the old button, which no material needs.
2. Merge the app PR (Vercel deploys `main`): the notice appears and the button is gone.
No migration, no Ingesta change.

## Testing

- **Task (integration, `procesar-*.test.ts`)**: a material whose estimate is above US$ 1 runs to `listo` without a stop
  and with `costo_estimado_usd` written; a small one also gets its estimate; the hard limit still stops the run with its
  motivo; a marked material still stops (batch 4).
- **Domain and screens (units)**: the notice with and without an estimate; no «Espera tu OK» state and no «Procesar
  por» button anywhere (a word test like `biblioteca-palabras.test.ts`).
- **E2E**: the scenes stop seeding a material waiting for its cost; a processing material shows «Costará cerca de US$
  X» on its page (phone) and in the side panel (desktop); visual baselines retaken after Federico sees the captures.
