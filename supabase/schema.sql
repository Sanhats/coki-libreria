create type public.user_role as enum ('admin', 'seller');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'seller',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.is_admin() returns boolean language sql security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
create policy "users read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id, full_name, role) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'seller'); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create table public.password_reset_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, token_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now());
alter table public.password_reset_tokens enable row level security;
-- Crear el único administrador desde el dashboard de Supabase Auth y luego ejecutar:
-- update public.profiles set role = 'admin' where id = 'UUID_DEL_ADMIN';
