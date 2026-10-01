-- The newest reading of every reel. The Métricas screen needs only that one, and asking the table for all the daily
-- rows would hit PostgREST's row cap (1000) after a few months and silently drop the newest ones.
-- security_invoker: the view is read with the caller's rights, so row level security of `metricas_reel` still decides.
create view public.metricas_reel_ultima with (security_invoker = true) as
  select distinct on (pieza_id) pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio
  from public.metricas_reel
  order by pieza_id, dia desc;

revoke all on public.metricas_reel_ultima from anon;
grant select on public.metricas_reel_ultima to authenticated, service_role;

-- Forgets the visitors of the click counter from before `p_antes_de` (a day). `registrar_clic` already does it on each
-- click; the daily metrics run calls this too, so the hashes do not outlive their day on a page nobody visits.
create function public.olvidar_visitas_clic(p_antes_de date) returns integer
language plpgsql set search_path = '' as $$
declare
  v_borradas integer;
begin
  delete from public.visitas_clic where dia < p_antes_de;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end $$;

revoke execute on function public.olvidar_visitas_clic(date) from public, anon, authenticated;
grant execute on function public.olvidar_visitas_clic(date) to service_role;
