-- ESCUADRA SOFTWARE · ESQUEMA COMPLETO PARA UN PROYECTO SUPABASE NUEVO
-- Ejecutar todo este archivo una sola vez en el SQL Editor.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'seller');
create type public.payment_method as enum ('cash', 'transfer');
create type public.cash_status as enum ('open', 'closed');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'ARS',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  brand_name text not null default 'Escuadra Software',
  logo_url text,
  primary_color text not null default '#27187E',
  background_color text not null default '#F7F7FF',
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'seller',
  business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'seller',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku text not null,
  brand text,
  unit text not null default 'unidad',
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  stock numeric(12,2) not null default 0 check (stock >= 0),
  min_stock numeric(12,2) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);

create sequence public.product_sku_seq start 1;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  cash_register_id uuid,
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method public.payment_method not null,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('sale', 'entry', 'adjustment')),
  quantity numeric(12,2) not null,
  reference_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  closing_amount numeric(12,2) check (closing_amount >= 0),
  difference numeric(12,2),
  status public.cash_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('sale', 'income', 'expense', 'withdrawal')),
  amount numeric(12,2) not null check (amount >= 0),
  description text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

alter table public.sales add constraint sales_cash_register_fk foreign key (cash_register_id) references public.cash_registers(id);

create or replace function public.current_business_id()
returns uuid language sql security definer set search_path = public as $$
  select business_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_business_admin(target_business uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = target_business and user_id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'seller');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.assign_product_sku()
returns trigger language plpgsql as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'FEL-' || lpad(nextval('public.product_sku_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger assign_product_sku_before_insert
before insert on public.products
for each row execute procedure public.assign_product_sku();

create or replace function public.open_cash(amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid; business uuid;
begin
  business := public.current_business_id();
  if business is null then raise exception 'El usuario no está asociado a un negocio'; end if;
  if exists (select 1 from public.cash_registers where user_id = auth.uid() and business_id = business and status = 'open') then raise exception 'Ya tenés una caja abierta'; end if;
  insert into public.cash_registers (business_id, user_id, opening_amount) values (business, auth.uid(), amount) returning id into result;
  return result;
end;
$$;

create or replace function public.close_cash(register_id uuid, counted numeric)
returns void language plpgsql security definer set search_path = public as $$
declare expected numeric;
begin
  select opening_amount + coalesce((select sum(case when type in ('sale', 'income') then amount else -amount end) from public.cash_movements where cash_register_id = register_id and (type = 'income' or (type = 'sale' and description = 'Venta en efectivo') or type in ('expense', 'withdrawal'))), 0)
  into expected from public.cash_registers where id = register_id and user_id = auth.uid() and status = 'open';
  if expected is null then raise exception 'La caja no está abierta'; end if;
  update public.cash_registers set closing_amount = counted, difference = counted - expected, status = 'closed', closed_at = now() where id = register_id and user_id = auth.uid() and status = 'open';
end;
$$;

create or replace function public.create_sale(items jsonb, sale_payment public.payment_method)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sale_id uuid; v_register_id uuid; v_business uuid; v_item jsonb; v_product public.products; v_quantity numeric; v_total numeric;
begin
  v_business := public.current_business_id();
  select id into v_register_id from public.cash_registers where user_id = auth.uid() and business_id = v_business and status = 'open' limit 1;
  if v_register_id is null then raise exception 'Debés abrir la caja antes de registrar una venta'; end if;
  insert into public.sales (business_id, seller_id, cash_register_id, payment_method) values (v_business, auth.uid(), v_register_id, sale_payment) returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(items) loop
    v_quantity := (v_item->>'quantity')::numeric;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and business_id = v_business and active for update;
    if v_product.id is null then raise exception 'Producto inválido'; end if;
    if v_product.stock < v_quantity then raise exception 'Stock insuficiente para %', v_product.name; end if;
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal) values (v_sale_id, v_product.id, v_quantity, v_product.sale_price, v_quantity * v_product.sale_price);
    update public.products set stock = stock - v_quantity, updated_at = now() where id = v_product.id;
    insert into public.stock_movements (business_id, product_id, user_id, type, quantity, reference_id) values (v_business, v_product.id, auth.uid(), 'sale', -v_quantity, v_sale_id);
  end loop;
  select coalesce(sum(subtotal), 0) into v_total from public.sale_items where sale_id = v_sale_id;
  update public.sales set total = v_total where id = v_sale_id;
  insert into public.cash_movements (business_id, cash_register_id, user_id, type, amount, description, reference_id) values (v_business, v_register_id, auth.uid(), 'sale', v_total, case when sale_payment = 'cash' then 'Venta en efectivo' else 'Venta por transferencia' end, v_sale_id);
  return v_sale_id;
end;
$$;

grant execute on function public.open_cash(numeric), public.close_cash(uuid, numeric), public.create_sale(jsonb, public.payment_method) to authenticated;

create or replace function public.adjust_stock(product_id uuid, new_stock numeric, adjustment_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare current_stock numeric; business uuid; delta numeric;
begin
  business := public.current_business_id();
  if not public.is_business_admin(business) then raise exception 'Solo un administrador puede ajustar stock'; end if;
  if new_stock is null or adjustment_reason is null or btrim(adjustment_reason) = '' then raise exception 'El stock y el motivo son obligatorios'; end if;
  select stock into current_stock from public.products where id = product_id and business_id = business and active for update;
  if current_stock is null then raise exception 'Producto inválido'; end if;
  delta := new_stock - current_stock;
  update public.products set stock = new_stock, updated_at = now() where id = product_id;
  insert into public.stock_movements (business_id, product_id, user_id, type, quantity, reason)
  values (business, product_id, auth.uid(), 'adjustment', delta, btrim(adjustment_reason));
end;
$$;

grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;

alter table public.businesses enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_members enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;

create policy "members read businesses" on public.businesses for select to authenticated using (exists (select 1 from public.business_members m where m.business_id = id and m.user_id = auth.uid() and m.active));
create policy "members read settings" on public.business_settings for select to authenticated using (business_id = public.current_business_id());
create policy "members read profiles" on public.profiles for select to authenticated using (business_id = public.current_business_id() or id = auth.uid());
create policy "members read products" on public.products for select to authenticated using (business_id = public.current_business_id());
create policy "admins manage products" on public.products for all to authenticated using (public.is_business_admin(business_id)) with check (public.is_business_admin(business_id));
create policy "users read sales" on public.sales for select to authenticated using (business_id = public.current_business_id() and (seller_id = auth.uid() or public.is_business_admin(business_id)));
create policy "users read sale items" on public.sale_items for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id and s.business_id = public.current_business_id() and (s.seller_id = auth.uid() or public.is_business_admin(s.business_id))));
create policy "users read stock movements" on public.stock_movements for select to authenticated using (business_id = public.current_business_id() and (user_id = auth.uid() or public.is_business_admin(business_id)));
create policy "users manage own cash" on public.cash_registers for all to authenticated using (business_id = public.current_business_id() and (user_id = auth.uid() or public.is_business_admin(business_id))) with check (business_id = public.current_business_id() and (user_id = auth.uid() or public.is_business_admin(business_id)));
create policy "users manage own cash movements" on public.cash_movements for all to authenticated using (business_id = public.current_business_id() and (user_id = auth.uid() or public.is_business_admin(business_id))) with check (business_id = public.current_business_id() and (user_id = auth.uid() or public.is_business_admin(business_id)));

-- ============================================================
-- BOOTSTRAP DEL PRIMER NEGOCIO Y ADMINISTRADOR
-- Ejecutar después de crear el usuario administrador en
-- Authentication > Users. Reemplazar ADMIN_UUID.
-- ============================================================
-- 1) Crear el negocio y copiar el id devuelto:
-- insert into public.businesses (name, slug)
-- values ('Escuadra Software', 'escuadra')
-- returning id;
--
-- 2) Asociar el administrador al negocio:
-- update public.profiles
-- set full_name = 'Administrador', role = 'admin', business_id = 'BUSINESS_UUID'
-- where id = 'ADMIN_UUID';
--
-- 3) Crear su membresía administrativa:
-- insert into public.business_members (business_id, user_id, role)
-- values ('BUSINESS_UUID', 'ADMIN_UUID', 'admin');
--
-- 4) Crear la configuración visual del negocio:
-- insert into public.business_settings (business_id, brand_name)
-- values ('BUSINESS_UUID', 'Escuadra Software');
