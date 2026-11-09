-- Issue 22: Coni decides a proposal (Son el mismo / Uno es parte del otro / Son distintos) or joins a pair that was
-- rejected (Unir igual). Each decision lands in decisiones_de_tema for the x3 recalibration (change 17).

create function public.decidir_fusion(p_fusion uuid, p_veredicto text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.fusiones;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_veredicto is null or p_veredicto not in ('mismo', 'parte_de', 'distintos') then
    raise exception using errcode = '22023', message = 'veredicto_invalido';
  end if;
  select * into f from public.fusiones where id = p_fusion for update;
  if f.id is null then
    raise exception using errcode = 'P0002', message = 'fusion_inexistente';
  end if;
  if f.estado <> 'propuesta' then
    raise exception using errcode = '22023', message = 'fusion_ya_decidida';
  end if;
  update public.fusiones set decidida_en = now() where id = f.id;

  if p_veredicto = 'mismo' then
    perform public.fusionar_par_de_temas(f.ganador_id, f.perdedor_id, f.id);
    insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id)
    values ('fusion_aceptada', f.ganador_id, f.perdedor_id);
    return;
  end if;

  if p_veredicto = 'parte_de' then
    -- The topic with more claims (the proposal's winner) is the broader one.
    insert into public.temas_subtemas (tema_id, padre_id, origen)
    values (f.perdedor_id, f.ganador_id, 'coni')
    on conflict do nothing;
  else
    perform public.recordar_rechazo_de_coni(f.ganador_id, f.perdedor_id);
  end if;
  update public.fusiones set estado = 'rechazada' where id = f.id;
  -- «Parte de» is also «do not merge» for the recalibration: decisiones_de_tema has no subtopic type.
  insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id)
  values ('fusion_rechazada', f.ganador_id, f.perdedor_id);
end $$;

create function public.unir_temas_a_mano(p_a uuid, p_b uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ganador uuid;
  v_perdedor uuid;
  v_id uuid;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if not exists (
    select 1 from public.temas_fusion_rechazada where tema_a = least(p_a, p_b) and tema_b = greatest(p_a, p_b)
  ) then
    raise exception using errcode = '22023', message = 'par_no_rechazado';
  end if;
  -- The nightly run's rule (elegirGanador): more claims, then the older topic, then the smaller id.
  select t.id into v_ganador from public.temas t where t.id in (p_a, p_b)
   order by public.afirmaciones_vivas(t.id) desc, t.creado_en, t.id
   limit 1;
  if v_ganador is null then
    raise exception using errcode = 'P0002', message = 'tema_inexistente';
  end if;
  v_perdedor := case when v_ganador = p_a then p_b else p_a end;
  insert into public.fusiones (ganador_id, perdedor_id, origen, veredicto, modelo, decidida_en)
  values (v_ganador, v_perdedor, 'coni', 'mismo', public.modelo_de_huellas_vigente(), now())
  returning id into v_id;
  perform public.fusionar_par_de_temas(v_ganador, v_perdedor, v_id);
  delete from public.temas_fusion_rechazada where tema_a = least(p_a, p_b) and tema_b = greatest(p_a, p_b);
  insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id)
  values ('fusion_aceptada', v_ganador, v_perdedor);
  return v_id;
end $$;

revoke execute on function public.decidir_fusion(uuid, text), public.unir_temas_a_mano(uuid, uuid) from public, anon;
grant execute on function public.decidir_fusion(uuid, text), public.unir_temas_a_mano(uuid, uuid) to authenticated;
