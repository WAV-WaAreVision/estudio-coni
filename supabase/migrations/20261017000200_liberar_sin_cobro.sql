-- Spec 2026-10-17, decision 14 (amendment A3 of its plan): a released voice reservation says "no se cobró" only when
-- the release proved it (ElevenLabs refused the request with a 4xx). The sweeper also releases voice reservations,
-- but after an unknown outcome, to free the cap; those stay sin_cobro = false.
alter table public.gastos add column sin_cobro boolean not null default false;
comment on column public.gastos.sin_cobro is
  'True when the provider refused the request, so nothing was billed. Set only through liberar_gasto(p_clave, true).';

drop function public.liberar_gasto(text);

create function public.liberar_gasto(p_clave text, p_sin_cobro boolean default false) returns public.gastos
language sql set search_path = '' as $$
  update public.gastos set estado = 'liberado', sin_cobro = p_sin_cobro
  where clave = p_clave and estado = 'reservado'
  returning *
$$;

revoke execute on function public.liberar_gasto(text, boolean) from public, anon, authenticated;
grant execute on function public.liberar_gasto(text, boolean) to service_role;
