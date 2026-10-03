-- A member supplies the material id and the file keys, and the service role later reads and deletes whatever
-- they point at: a key must stay inside the material's own folder, with the names the upload app generates.
alter table public.materiales add constraint materiales_archivo_en_su_carpeta check (
  archivo_clave is null
  or archivo_clave ~ ('^materiales/' || id::text
    || '/original(-(0[1-9]|1[0-9]|20))?\.(pdf|docx|mp3|m4a|wav|mp4|mov|txt|jpg|jpeg|png|webp|heic)$')
);

alter table public.materiales_archivos add constraint materiales_archivos_en_su_carpeta check (
  archivo_clave ~ ('^materiales/' || material_id::text
    || '/original(-(0[1-9]|1[0-9]|20))?\.(pdf|docx|mp3|m4a|wav|mp4|mov|txt|jpg|jpeg|png|webp|heic)$')
);

-- Only whoever uploaded the material adds files to it, and only while it is still processing.
drop policy "coni y wav suben archivos" on public.materiales_archivos;
create policy "quien subio agrega archivos mientras procesa" on public.materiales_archivos for insert to authenticated
  with check (
    (public.es_coni() or public.es_mantenedor())
    and exists (
      select 1 from public.materiales m
      where m.id = material_id and m.subido_por = auth.uid() and m.estado = 'procesando'
    )
  );
