-- Retires the B2 links and hand-picked theories. Applied AFTER the new code is deployed, because until then the old
-- code still reads these columns. The tables `vinculos` and `embeddings_ficha` stay until production is verified;
-- `teorias` stays because the weekly engine reuses it.
drop function if exists public.materiales_cercanos(uuid, int);
drop function if exists public.aceptar_vinculo(uuid, uuid, text, int);
drop function if exists public.descartar_vinculo(uuid, uuid);
drop function if exists public.crear_vinculo(uuid, uuid, text, int, text);
drop function if exists public.pedir_teoria(uuid[]);
drop function if exists public.guardar_teoria(uuid, text, text, jsonb, jsonb, uuid);
drop function if exists public.guardar_teoria(uuid, text, text, uuid);
drop function if exists public.reintentar_teoria(uuid);
drop function if exists public.marcar_teoria_disparo_fallido(uuid);

alter table public.materiales drop column if exists vinculos_pendientes;
alter table public.materiales drop column if exists vinculos_intentos;
