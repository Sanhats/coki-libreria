-- Stock = 1 representa stock estimado: se vende sin bloquear ni descontar ese valor de referencia.
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
    if v_product.stock <> 1 and v_product.stock < v_quantity then raise exception 'Stock insuficiente para %', v_product.name; end if;
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal) values (v_sale_id, v_product.id, v_quantity, v_product.sale_price, v_quantity * v_product.sale_price);
    if v_product.stock <> 1 then
      update public.products set stock = stock - v_quantity, updated_at = now() where id = v_product.id;
      insert into public.stock_movements (business_id, product_id, user_id, type, quantity, reference_id) values (v_business, v_product.id, auth.uid(), 'sale', -v_quantity, v_sale_id);
    end if;
  end loop;
  select coalesce(sum(subtotal), 0) into v_total from public.sale_items where sale_id = v_sale_id;
  update public.sales set total = v_total where id = v_sale_id;
  insert into public.cash_movements (business_id, cash_register_id, user_id, type, amount, description, reference_id) values (v_business, v_register_id, auth.uid(), 'sale', v_total, case when sale_payment = 'cash' then 'Venta en efectivo' else 'Venta por transferencia' end, v_sale_id);
  return v_sale_id;
end;
$$;
grant execute on function public.create_sale(jsonb, public.payment_method) to authenticated;
