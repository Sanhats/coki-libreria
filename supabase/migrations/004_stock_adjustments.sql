-- Ajustes manuales de stock con motivo y trazabilidad.
alter table public.stock_movements add column if not exists reason text;

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
