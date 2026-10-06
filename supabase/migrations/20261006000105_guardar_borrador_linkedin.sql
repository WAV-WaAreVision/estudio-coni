-- The writer now returns a LinkedIn text with the script and the caption, and it is saved with them in the same
-- transaction that confirms the spend. The old signature goes so PostgREST does not see two candidates; a worker
-- deployed before LinkedIn calls with the same named arguments and still matches: p_texto_linkedin defaults to null,
-- which leaves the piece without a LinkedIn text (the Video screen starts one from the caption).
drop function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb);

create function public.guardar_borrador(
  p_pieza uuid,
  p_version integer,
  p_guion text,
  p_texto text,
  p_revision jsonb,
  p_clave text,
  p_real numeric,
  p_respaldo jsonb default null,
  p_texto_linkedin text default null
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  update public.piezas
    set guion = p_guion, texto = p_texto, texto_linkedin = p_texto_linkedin, revision = p_revision,
        respaldo = p_respaldo, version = version + 1
    where id = p_pieza and version = p_version
    returning * into v_pieza;
  if not found then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'claude', null);

  -- Without a reserved spend there is nothing to confirm; raising rolls back the writes above as well.
  update public.gastos set estado = 'confirmado', real_usd = p_real
    where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;

  return v_pieza;
end $$;

revoke execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb, text) to service_role;

-- exigir_revision_limpia as of 20261001001300, plus: gate 1 now leads to guion_aprobado (en_render stays for the old
-- path), so that is where its check applies; and a blocking finding of the LinkedIn text only counts when LinkedIn
-- is among the destinations of the approval (the same update writes them), so a LinkedIn text that is not going out
-- cannot keep the Instagram reel from being approved.
create or replace function public.exigir_revision_limpia() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only server tasks write the review; otherwise Coni could clear it in the same update that approves.
  if new.revision is distinct from old.revision and public.es_coni() and current_user = 'authenticated' then
    raise exception using errcode = '42501', message = 'revision_solo_servidor';
  end if;
  if (
    (old.estado = 'guion_por_aprobar' and new.estado in ('guion_aprobado', 'en_render'))
    or (old.estado = 'video_por_aprobar' and new.estado = 'programado')
  ) and exists (
    select 1 from jsonb_array_elements(new.revision) as hallazgo
    where hallazgo ->> 'tipo' = 'bloquea'
      and (hallazgo ->> 'campo' is distinct from 'linkedin' or 'linkedin' = any (new.destinos))
  ) then
    raise exception using errcode = '42501', message = 'revision_bloquea';
  end if;
  return new;
end $$;
