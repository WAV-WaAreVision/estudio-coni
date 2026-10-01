-- Every entry into en_render is a new attempt at the video (approval, Regrabar, a retry after an error), and a new
-- attempt must not read the render of an old one: grabar-pieza skips POST /v3/videos when render_id is set, so a stale
-- id from a failed or rejected render would make the retry read the same failure forever.
-- Done as a trigger, not in the task, because the writes that enter en_render are Coni's, not the task's.
create function public.limpiar_render() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.render_id := null;
  return new;
end $$;

create trigger limpiar_render before update on public.piezas
  for each row when (new.estado = 'en_render' and old.estado is distinct from new.estado)
  execute function public.limpiar_render();
