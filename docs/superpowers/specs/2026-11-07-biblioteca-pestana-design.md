# Biblioteca in Conidolly, batch 7: the tab opens the Biblioteca

Issue WAV-WaAreVision/estudio-coni#17 · Pedido 29b · batch 7 of 7 (closes stage 2's screens). Batch frame:
`2026-11-02-biblioteca-materiales-design.md`. Approved by Federico on 2026-11-07.

## Decisions

1. **The tab.** «Biblioteca» in `components/nav-inferior.tsx` becomes a normal tab to `/biblioteca` (a Next `<Link>`,
   `sale: false`). It is current on `/biblioteca` and every route under it (Materiales, Autores, Temas, Semana, Subir,
   a material, an author, a topic, drafts). `RUTA_DE_LA_BIBLIOTECA` becomes `/biblioteca`.
2. **Old links.** `/ir-a-biblioteca` (old links, the iPhone home-screen icon, history) answers a redirect to
   `/biblioteca` with the same session rules as today: no session goes to `/ingreso`, someone who is not Coni goes to
   `/`. It no longer signs anyone in to Ingesta.
3. **The bridge goes away.** Nothing in Conidolly leads to Ingesta any more: `lib/sesion/puente.ts`, the page
   `app/(app)/biblioteca-no-abrio/`, the service-role use in `app/ir-a-biblioteca/route.ts` and their tests are removed.
   The `INGESTA_URL` variable is no longer read (it can be removed from Vercel after the release; not part of this PR).
   WAV keeps entering Ingesta directly until stage 3.
4. **Ideas with an empty bank.** «Mientras, sube material en Conidolly Ingesta.» / «Abrir Conidolly Ingesta» become
   «Mientras, sube material a tu Biblioteca.» / «Subir material», a link to `/biblioteca/subir`. `URL_DE_INGESTA` and
   `NEXT_PUBLIC_URL_INGESTA` stop being read there.
5. **Datos personales stays where it is**, in Conidolly's Ajustes (`/ajustes/datos-personales`, read and «Lo revisé»).
   The note to WAV that points to Ingesta for corrections is unchanged: WAV still corrects the register there.
6. **No migration, no Trigger change, no Ingesta change.**

## Testing

- Units: the tab's href and current state on each Biblioteca route and not elsewhere; the empty bank's text and link;
  the old route's three answers (no session, not Coni, Coni) as redirects.
- E2E phone and desktop: tapping «Biblioteca» lands on `/biblioteca` with the tab current, and stays current in Autores,
  Temas, Semana and a material; `/ir-a-biblioteca` lands on `/biblioteca`; the empty bank offers «Subir material».
  Visual baselines of the bottom bar retaken after Federico sees the captures.

## Release

PR «Part of #17», CI green, review, merge; Vercel deploys `main`. Afterwards Federico walks the Biblioteca on his phone
with Coni's account, and #17 can close once stage 2 is confirmed in use.
