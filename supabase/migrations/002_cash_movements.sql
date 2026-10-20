-- Escuadra Software: distingue gastos y retiros manuales de caja.
alter table public.cash_movements
  drop constraint if exists cash_movements_type_check;

alter table public.cash_movements
  add constraint cash_movements_type_check
  check (type in ('sale', 'income', 'expense', 'withdrawal'));
