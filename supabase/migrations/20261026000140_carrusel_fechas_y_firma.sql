-- Review of part 1, findings 4 and 5.

-- proponer_fechas as of 20261017000400, plus the two carousel states before gate 2 (ORDEN_SIN_FECHA of
-- lib/calendario/propuestas.ts): a signed carousel without a proposal made Repartir fail for every piece.
create or replace function public.proponer_fechas(p_piezas uuid[], p_fechas timestamptz[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_piezas is null or p_fechas is null or cardinality(p_piezas) <> cardinality(p_fechas)
     or cardinality(p_piezas) not between 1 and 200
     or array_position(p_piezas, null) is not null or array_position(p_fechas, null) is not null
     or (select count(distinct p) from unnest(p_piezas) as p) <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'lote_invalido';
  end if;
  -- One writer at a time (A8): two sessions that both read a time as free cannot both store it.
  perform pg_advisory_xact_lock(hashtext('fechas_propuestas'));
  -- for share holds the pieces until this commits: gate 2 cannot sign one between the check and the insert, and a
  -- piece signed while this waited is re-read in its new state and fails the check.
  select count(*) into v_n
    from (select p.id from public.piezas p
           where p.id = any (p_piezas)
             and p.estado in ('guion_en_proceso', 'guion_por_aprobar', 'guion_aprobado', 'grabando_voz', 'en_render',
                              'subtitulando', 'error_produccion', 'video_por_aprobar', 'armando_carrusel',
                              'carrusel_por_aprobar')
             for share) s;
  -- A8: at least 2 h ahead (the Agenda's margin), one piece per time, never the signed time of a piece still to go out
  -- (scheduled or waiting to be uploaded by hand), never the time
  -- another piece's live proposal holds. A proposal is live while its piece is before gate 2 and it is 2 h ahead; the
  -- pieces of this call give theirs up, so a batch may swap times among them.
  if exists (select 1 from unnest(p_fechas) as f where f < now() + interval '2 hours')
     or (select count(distinct f) from unnest(p_fechas) as f) <> cardinality(p_fechas)
     or exists (select 1 from public.piezas p
                 where p.estado in ('programado', 'para_subir_a_mano') and p.puerta2_publicar_en = any (p_fechas))
     or exists (select 1 from public.fechas_propuestas r join public.piezas p on p.id = r.pieza_id
                 where r.publicar_en = any (p_fechas)
                   and r.pieza_id <> all (p_piezas)
                   and r.publicar_en >= now() + interval '2 hours'
                   and p.estado in ('guion_en_proceso', 'guion_por_aprobar', 'guion_aprobado', 'grabando_voz',
                                    'en_render', 'subtitulando', 'error_produccion', 'video_por_aprobar',
                                    'armando_carrusel', 'carrusel_por_aprobar'))
     or v_n <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'propuesta_invalida';
  end if;
  insert into public.fechas_propuestas (pieza_id, publicar_en)
  select * from unnest(p_piezas, p_fechas)
  on conflict (pieza_id) do update set publicar_en = excluded.publicar_en, propuesta_en = now();
end $$;
