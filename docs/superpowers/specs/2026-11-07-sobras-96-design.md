# Leftovers of #96: no screen asks Coni to tell Federico by hand · full-width stopped video

Issue #101. Approved by Federico on 2026-11-07. App only: no migration, no Trigger change.

## Why

#96 shipped provider pauses (WAV is emailed on its own) and a real «Avisar a Federico» button for configuration
failures. Four texts still ask Coni to tell Federico by hand, and the stopped-video screen still uses the narrow phone
column on desktop.

## Decisions

1. **Balance too low (voice and video): a real button.**
   - Today `botonesDeGrabacion` (`lib/datos/grabacion.ts`) closes «Preparar mi voz» / the signature when the balance
     check (`alcanceDeVoz`, `alcanceDeVideo`) says the balance does not cover the estimate. No pause opens, so WAV hears
     nothing, and the screen falls back to `TEXTO_SIN_SALDO_VOZ` / `TEXTO_SIN_SALDO_VIDEO`
     (`app/(app)/guion/[id]/textos.ts:26-27`), which end with «Avísale a Federico.».
   - The texts drop that sentence: «No alcanza el saldo para preparar tu voz.» and «No alcanza el saldo para grabar el
     video.». Next to them sits `<AvisarAFederico>` (the part 2 component), so a pause still wins and shows no button.
   - The action takes an optional `motivo: "saldo_voz" | "saldo_video"` with `tipo: "pieza"`. For a motivo it does not
     read the stored explanation: it recomputes the piece's buttons on the server with the same loader as the page and
     refuses with `TEXTO_YA_NO_FALLA` when that block is no longer a balance block (a paused provider, the monthly
     limit or enough balance never send this email).
   - Key: `pieza:<id>:<motivo>:<intento>` (the piece's `intento` is the occurrence), stored with `tipo = 'pieza'`
     through the existing `reclamar_aviso_a_federico`, so claim, Idempotency-Key and «Le avisé a Federico.» work as in
     part 2. The page reads `yaAvisado` with the same key.
   - The email names the provider, the piece and its title, the estimate and the balance line WAV already sees
     (`saldoVoz`, or the HeyGen balance), and a link to the piece.
2. **No avatars yet: text only.** `TEXTO_SIN_AVATARES` (`components/elegir-avatar.tsx:21`) and the `Falla` in
   `lib/acciones/piezas.ts:386` become «Aún no hay avatares. Cuando WAV los agregue, los eliges aquí.» (the text the
   Guion screen already shows). This only happens while WAV sets up the account, so no button.
3. **Key saved without a voice (Ajustes): WAV is emailed on its own.** When saving the ElevenLabs key ends in
   `sin_voz` (`lib/acciones/ajustes.ts`), the action emails WAV through `aWav` («Coni guardó su llave de ElevenLabs y
   falta conectar su voz»), with Idempotency-Key `sin-voz:<fingerprint of the saved key>` so saving the same key again
   sends nothing new for 24 h. No table row (its `tipo` allows only `pieza` and `material`). A failed email is logged
   and does not fail the save. The text becomes «Guardada. WAV va a conectar tu voz.».
4. **Stopped video uses the desktop width.** The `en_render` / `subtitulando` branch with an explanation
   (`app/(app)/guion/[id]/page.tsx`, `VideoDetenido`) renders, from the desktop breakpoint the other wide screens use,
   two columns: left, what happened, «Avisar a Federico» and «Volver a Inicio»; right, the piece's card (title, pillar,
   duration). Phone layout unchanged. Follow the pattern of the screens already widened (Inicio, Guion, Biblioteca);
   no new tokens.

## Testing

- Unit: the two balance texts no longer say «Avísale»; the button shows beside a balance block and not beside a pause
  or the monthly limit; `TEXTO_SIN_AVATARES`; the Ajustes `sin_voz` text; no UI string in `app/`, `components/`, `lib/`
  contains «avísale a Federico» (case-insensitive) outside tests.
- Integration (local Supabase): the action with `motivo` sends one email per piece attempt and refuses when the
  balance covers the estimate or a pause is open; saving a key with no voice calls `aWav` once with the expected
  Idempotency-Key and still saves when the email fails.
- E2E phone and desktop: a balance block shows the button and then «Le avisé a Federico.»; the stopped-video screen
  uses two columns on desktop and one on phone. Visual baselines only after Federico sees the captures.

## Out of scope

The HEYGEN_ / ANTHROPIC_ / PUSH_ override guards in Trigger (own issue); balance alerts before a provider fails.
