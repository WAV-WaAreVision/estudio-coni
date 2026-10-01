-- A spend that belongs to no piece (Claude classifying an idea Coni wrote herself) still counts against the monthly cap.
-- `reservar_gasto` takes the piece as its first argument, so a typed wrapper keeps the null out of the callers.
create function public.reservar_gasto_general(
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now()
) returns public.gastos
language sql set search_path = '' as $$
  select * from public.reservar_gasto(null, p_proveedor, p_paso, p_estimado, p_clave, p_ahora)
$$;

revoke execute on function public.reservar_gasto_general(text, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto_general(text, text, numeric, text, timestamptz) to service_role;
