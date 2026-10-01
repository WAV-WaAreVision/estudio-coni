-- Trigger functions are never called directly; keep them off the RPC surface (anon included).
revoke execute on function public.proteger_pieza(), public.registrar_evento(), public.solo_agregar()
  from public, anon, authenticated, service_role;

-- Who logged an intervention comes from the session, never from the caller.
drop policy "wav registra intervenciones" on public.intervenciones;
create policy "wav registra intervenciones" on public.intervenciones for insert to authenticated
  with check (public.es_mantenedor() and registrada_por = auth.uid());
