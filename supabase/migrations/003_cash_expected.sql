-- Escuadra Software: el cierre considera ingresos, gastos y retiros.
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
