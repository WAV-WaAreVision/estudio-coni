-- Local development and tests only: `supabase db reset` runs this; production users come from invites.
-- GoTrue reads the token columns as strings: a NULL there makes it answer "Database error finding user" on sign-in.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'coni@estudio.test', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'wav@estudio.test', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'otra@estudio.test', '', now(), now(), now(), '{}', '{}', '', '', '', '', '', '', '', '');

insert into public.miembros (user_id, rol) values
  ('c0000000-0000-4000-8000-000000000001', 'coni'),
  ('a0000000-0000-4000-8000-000000000002', 'mantenedor');

insert into public.ajustes default values;
