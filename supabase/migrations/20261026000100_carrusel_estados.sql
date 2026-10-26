-- LinkedIn document carousels as their own piece (design 2026-10-26, D2). The two states mirror lib/dominio/estados.ts
-- (ESTADOS). A new enum value cannot be used in the transaction that adds it, so the constraints, triggers and
-- functions that name them are in 20261026000110 and 20261026000120.
alter type public.estado_pieza add value if not exists 'armando_carrusel' after 'video_por_aprobar';
alter type public.estado_pieza add value if not exists 'carrusel_por_aprobar' after 'armando_carrusel';
