-- The network Temas opened on last (spec 2026-11-04, part 15b, section 2). Null until Coni first opens Temas, which then
-- shows LinkedIn. She writes it like every other setting, through the policy "coni edita ajustes" (`recordarRed` in
-- lib/acciones/biblioteca.ts); WAV's session updates no row. Only a column is added: no existing row changes.
alter table public.ajustes
  add column ultima_red text constraint ultima_red_valida check (ultima_red in ('linkedin', 'instagram'));
