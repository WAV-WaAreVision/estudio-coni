alter table public.piezas add column puerta1_formula smallint check (puerta1_formula in (1, 2));

comment on column public.piezas.puerta1_formula is
  'Which hashPuerta1 formula signed gate 1: 1 = script + voice (+ avatar), 2 = script + text + avatar. Null on a signed piece = formula 1, approved before 2026-10-02.';
