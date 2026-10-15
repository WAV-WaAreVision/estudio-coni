-- Checks the rows written before 20261015000050. If this fails, list them with:
--   select id, estado from public.piezas
--   where estado in ('para_subir_a_mano', 'publicado_a_mano') and puerta1_hash is null;
alter table public.piezas validate constraint aprobada_para_grabar;
