alter table public.piezas add column puerta1_formula smallint check (puerta1_formula in (1, 2));

-- Pieces already signed used formula 1. The version bump satisfies the optimistic lock in proteger_pieza().
update public.piezas set puerta1_formula = 1, version = version + 1 where puerta1_hash is not null;

comment on column public.piezas.puerta1_formula is
  'Which hashPuerta1 formula signed gate 1: 1 = script + voice (+ avatar), 2 = script + text + avatar.';
