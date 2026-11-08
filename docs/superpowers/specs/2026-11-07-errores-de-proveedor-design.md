# Provider errors: pause, tell WAV, resume on its own · and a real «Avisar a Federico»

Approved by Federico on 2026-11-07 (the idea on 2026-10-27, after the incident below).

## Why

On 2026-10-17 ElevenLabs answered HTTP 401 `payment_issue` (an unpaid invoice) to every voice. The code treats any
ElevenLabs 4xx as a bad key (`RechazoDeElevenlabs extends FallaDeConfiguracion`, `lib/proveedores/elevenlabs.ts:44`),
the piece ended with «No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz.» (`TEXTO_SIN_VOZ`,
`lib/produccion/voz.ts:52`) and the button stayed: a dead end for Coni, silent for WAV for 10 days. «Avisar a
Federico» exists only as text (`app/(app)/guion/[id]/textos.ts:26-35`); there is no button behind it.

## Decisions

1. **Which errors pause.** Payment, quota or key failures of the providers that cost money:

   | Provider | Pauses on |
   |---|---|
   | ElevenLabs | 401 `payment_issue`, `quota_exceeded`, `insufficient_credits`, 401 invalid key |
   | HeyGen | 402 (today `TEXTO_SIN_CREDITOS`), 401 |
   | Claude (Anthropic) | 401, 403, 400 with «credit balance is too low» |
   | Voyage | 401, 402, 403 |

   Each is classified from the status and the body's code, in the provider's client, into a new
   `PausaDeProveedor extends Falla` carrying `proveedor` (`elevenlabs | heygen | claude | voyage`) and `motivo`
   (`pago | cuota | llave`). `decisionDeReintento` (`lib/produccion/reintentos.ts`) skips retries for it. Every
   other error keeps today's path. LinkedIn and Instagram tokens are unchanged (Coni reconnects in Ajustes).
2. **The pause is stored.** New table `pausas_de_proveedor`: `id`, `proveedor`, `motivo`, `detalle` (technical, ≤400
   chars, for WAV), `desde`, `cerrada_en`. At most one open pause per provider (partial unique index on `proveedor`
   where `cerrada_en is null`). RLS: Coni and the maintainer read; only `service_role` writes, through a
   security-definer function `abrir_pausa_de_proveedor(proveedor, motivo, detalle)` that returns whether it opened a
   new pause (an open one is kept as it is).
3. **Opening a pause** (one helper, `abrirPausa`, used by every task that catches a `PausaDeProveedor`):
   - WAV gets one email per pause (`aWav`, only when the pause is new): provider, reason, detail, what to fix.
   - The piece or material gets its provider's text, a fixed constant the screens recognise:
     voice «Tu voz está en pausa. Ya le avisamos a WAV.»; video «Tu video está en pausa. Ya le avisamos a WAV.»;
     Claude «Las ideas y los guiones están en pausa. Ya le avisamos a WAV.»; Voyage «La Biblioteca está en pausa. Ya
     le avisamos a WAV.». `avisarFalla` (`lib/produccion/fallas.ts`) keeps a pause text over later failures, as it
     keeps `TEXTO_LIMITE` today.
   - Coni gets no push for a pause beyond the text on the piece: WAV owns the fix.
4. **While a pause is open**, every button that would call that provider is disabled with the same text and no retry
   («Preparar mi voz», «Grabar», «Reintentar» on a video or carousel that needs HeyGen, «Proponer ahora», Biblioteca
   «Reintentar» and upload processing). The server actions refuse too (the screen can be stale). The Sunday engine
   run with Claude paused is skipped, writes nothing, and WAV's pause email already covers it.
5. **Closing a pause.** `mantenimiento-frecuente` (every 10 minutes) gets a step `pausas`: for each open pause it asks
   its provider one minimal question with the key in the Vault: ElevenLabs subscription status, HeyGen remaining
   quota (both free), a one-token Claude message and a one-word Voyage embedding (under US$ 0.0001 each). A good
   answer closes the pause (`cerrada_en`), and Coni gets one notice, keyed `pausa:<id>`: «Ya puedes preparar tu voz
   de nuevo.» (voice), «Ya puedes grabar tus videos de nuevo.» (HeyGen), «Las ideas y los guiones funcionan de
   nuevo.» (Claude), «La Biblioteca funciona de nuevo.» (Voyage). Nothing is redone on its own: she asks again. A
   failed check leaves the pause open and writes nothing. The exact free endpoint per provider is verified against
   the provider's v3/current docs in the plan (HeyGen v3 only).
6. **«Avisar a Federico», for real** (part 2). Where a failure needs WAV and is not a pause (a `FallaDeConfiguracion`:
   a key typed wrong in Ajustes, a rejected request), the text becomes a button. The action `avisarAFederico` (Coni
   only) emails WAV through `aWav` with the piece or material, its title, the stored explanation and a link to it, and
   the screen says «Le avisé a Federico.». The email is keyed by the entity and the explanation, so repeated taps on
   the same failure send one email. Where a pause is shown there is no button: WAV already knows.

## Amendments (approved by Federico on 2026-11-07, with the part 1 plan)

These override the decisions above where they differ.

- **A1. WAV's email is marked.** `pausas_de_proveedor` adds `avisada_en`. `abrir_pausa_de_proveedor` returns
  `(pausa_id, nueva, avisar)`, where `avisar` means WAV has not been emailed yet; `marcar_pausa_avisada(id)` sets it
  after the email. A failed email is sent again by the next caller instead of being lost.
- **A2. Claude 402.** Claude also pauses on 402 `billing_error` (`pago`), listed in the current docs.
- **A3. Voyage codes.** Voyage keeps 401, 402, 403 (403 is `llave`; its docs list no 402, kept as harmless).
- **A4. HeyGen failed render.** A render that fails later with `insufficient_credit` is the same `heygen`/`cuota`
  pause as a 402 on create.
- **A5. Claude closes script retries and «Pedir cambios».** While Claude is paused, «Reintentar» of a script (reel
  and carousel) and «Pedir cambios» on the guion are disabled, and their server actions refuse. Choosing ideas stays
  enabled.
- **A6. Voyage pauses are WAV-only.** A Voyage pause opens its row, emails WAV once and closes on its own through the
  maintenance check, but disables nothing for Coni, writes no pause text on materials, shows no Inicio line and sends Coni no closing notice:
  embeddings stay deferred to maintenance as today. The Biblioteca text («La Biblioteca está en pausa. Ya le avisamos
  a WAV.») and its disabled «Reintentar» and upload come only from a Claude pause; a material that meets a pause while
  processing (Claude, or ElevenLabs while transcribing) is marked with that text.
- **A7. Voyage key.** The Voyage key is the Trigger.dev variable `VOYAGE_API_KEY`, not a Vault secret; its check
  reads it from there.
- **A8. Maintenance with Claude paused.** The frequent `temas` job and the nightly `fusiones` are skipped while Claude
  is paused, and a pause met inside them opens the pause instead of failing the run.
- **A9. ElevenLabs closing check.** The pause closes when the subscription `status` is active (not `past_due`,
  `incomplete` or `free_disabled`) and, for a `cuota` pause, characters remain. Open invoices are not required to be
  zero.
- **A10. Inicio «Atención» lines.** While a pause of ElevenLabs, HeyGen or Claude is open, Inicio's attention block
  shows one line for it with the concrete reason, and the line leaves when the pause closes. The texts:

  | | `pago` | `cuota` | `llave` |
  |---|---|---|---|
  | ElevenLabs | «La voz está en pausa: la cuenta de ElevenLabs tiene un pago pendiente. WAV ya lo está resolviendo.» | «La voz está en pausa: la cuenta de ElevenLabs se quedó sin saldo. WAV ya lo está resolviendo.» | «La voz está en pausa: la clave de ElevenLabs dejó de funcionar. WAV ya lo está resolviendo.» |
  | HeyGen | «Los videos están en pausa: la cuenta de HeyGen tiene un pago pendiente. WAV ya lo está resolviendo.» | «Los videos están en pausa: la cuenta de HeyGen se quedó sin créditos. WAV ya lo está resolviendo.» | «Los videos están en pausa: la clave de HeyGen dejó de funcionar. WAV ya lo está resolviendo.» |
  | Claude | «Las ideas y los guiones están en pausa: la cuenta de Claude tiene un pago pendiente. WAV ya lo está resolviendo.» | «Las ideas y los guiones están en pausa: la cuenta de Claude se quedó sin saldo. WAV ya lo está resolviendo.» | «Las ideas y los guiones están en pausa: la clave de Claude dejó de funcionar. WAV ya lo está resolviendo.» |

- **A11. Part 2: where the button goes and how one email is kept** (approved by Federico on 2026-11-07). The button
  replaces «Avísale a Federico» in four places: a voice that failed on a refused ElevenLabs key (gate 1), «Grabar la
  voz de nuevo» that failed on the same, a signed video stopped with an explanation («El video está detenido»), and a
  ready Biblioteca material whose ficha cannot be read. One email per failure needs a record: a new table
  `avisos_a_federico` (`clave` unique: entity, its id and a hash of the explanation; `enviado_en`, `reclamado_en`) written
  only through security-definer functions, with the claim pattern of the pauses (claim, send, mark; a failed send lets
  go). The action reads the piece or material itself (never trusts the screen's text), refuses when it no longer fails,
  and the screen shows «Le avisé a Federico.» once a row is sent. The release becomes: migration (adds only), then the
  app. No Trigger change. Amended after review: the `clave` also carries an occurrence marker, so the same text coming
  back after a fix is told again: for a piece its attempt (`piezas.intento`, which every retry moves on), for a material
  a fingerprint of its stored `fichas` row (its run id is cleared when a run ends and `fichas` has no timestamp).

## Release

- **Part 1 (decisions 1-5):** migration (adds only: the table, its index, RLS, the function), Trigger deploy (the tasks
  and the new maintenance step, with Federico's OK), then the app. Trigger first: a task that opens a pause writes a
  text the old app shows as a plain failure, which is acceptable for the minutes in between.
- **Part 2 (decision 6):** app only.

## Testing

- **Units:** each client's classification (the 2026-10-17 body `{"detail":{"status":"payment_issue",...}}` is a
  `pago` pause; a 500 is not; a content-policy error is not); `decisionDeReintento` skips a pause; the screens show the
  pause text with no retry button and the disabled actions; the button's states («Avisar a Federico» → «Le avisé a
  Federico.»).
- **Integration (local Supabase):** `abrir_pausa_de_proveedor` opens once and keeps an open pause; RLS (Coni reads,
  cannot write); the maintenance step closes a pause on a good check and leaves it on a bad one, with one notice;
  `avisarAFederico` sends one email per failure and refuses a non-Coni session; a voice task hitting a payment error
  opens the pause, emails WAV once for two pieces, and writes the pause text.
- **Amendments:** the Inicio line of each pause appears while it is open and leaves when it closes (A10); a Voyage
  pause disables nothing (A6); «Pedir cambios» refuses while Claude is paused (A5).
- **E2E phone and desktop:** a paused voice shows the text and no active «Preparar mi voz»; after the pause closes the
  button is back; «Avisar a Federico» on a configuration failure; visual baselines after Federico sees the captures.

## Out of scope

LinkedIn and Instagram tokens; redoing failed work automatically after a pause; a WAV dashboard of pauses; balance
alerts before a provider fails.
