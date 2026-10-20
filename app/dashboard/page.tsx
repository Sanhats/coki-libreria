import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "./logout-button";

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("full_name,role").eq("id", user.id).single();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ data: sales }, { data: movements }, { data: cash }, { data: lowStock }, { data: estimatedItems }] = await Promise.all([
    supabase.from("sales").select("total,payment_method").gte("created_at", today.toISOString()),
    supabase.from("cash_movements").select("type,amount,description").gte("created_at", today.toISOString()),
    supabase.from("cash_registers").select("id,status,opening_amount,opened_at,closing_amount,difference").eq("status", "open").maybeSingle(),
    supabase.from("products").select("id,name,stock,min_stock").eq("active", true).filter("stock", "lte", "min_stock").order("stock").limit(6),
    supabase.from("sale_items").select("quantity,products!inner(id,name,stock),sales!inner(created_at)").eq("products.stock", 1).gte("sales.created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const rows = sales || [];
  const moves = movements || [];
  const totalSales = rows.reduce((sum, sale) => sum + Number(sale.total), 0);
  const cashSales = rows.filter((sale) => sale.payment_method === "cash").reduce((sum, sale) => sum + Number(sale.total), 0);
  const transfers = rows.filter((sale) => sale.payment_method === "transfer").reduce((sum, sale) => sum + Number(sale.total), 0);
  const expenses = moves.filter((move) => move.type === "expense").reduce((sum, move) => sum + Number(move.amount), 0);
  const withdrawals = moves.filter((move) => move.type === "withdrawal").reduce((sum, move) => sum + Number(move.amount), 0);
  const incomes = moves.filter((move) => move.type === "income").reduce((sum, move) => sum + Number(move.amount), 0);
  const isAdmin = profile?.role === "admin";
  const estimatedSales = new Map<string, { id: string; name: string; quantity: number }>();
  (estimatedItems || []).forEach((item: any) => { const product = item.products; if (!product) return; const current = estimatedSales.get(product.id) || { id: product.id, name: product.name, quantity: 0 }; current.quantity += Number(item.quantity); estimatedSales.set(product.id, current); });
  const reviewStock = [...estimatedSales.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  return <main className="panel admin-dashboard">
    <header className="dashboard-heading"><div><div className="breadcrumb"><span>Inicio</span><b>/</b><strong>Resumen general</strong></div><h1>Hola, {profile?.full_name || user.email}</h1><p className="muted">Una vista rápida de las operaciones de tu negocio.</p></div><LogoutButton /></header>
    {!isAdmin ? <div className="empty-panel"><h3>Panel de operación</h3><p className="muted">Desde aquí podés acceder a tus ventas, productos y caja.</p></div> : <>
      <section className="quick-grid dashboard-metrics">
        <div className="metric"><span className="metric-label">Ventas del día</span><strong className="metric-value">{money(totalSales)}</strong><small>{rows.length} operación{rows.length === 1 ? "" : "es"}</small></div>
        <div className="metric"><span className="metric-label">Cobrado en efectivo</span><strong className="metric-value">{money(cashSales)}</strong><small>Dinero físico recibido</small></div>
        <div className="metric"><span className="metric-label">Cobrado por transferencia</span><strong className="metric-value">{money(transfers)}</strong><small>Pagos electrónicos recibidos</small></div>
        <div className="metric"><span className="metric-label">Salidas de dinero</span><strong className="metric-value">{money(expenses + withdrawals)}</strong><small>{money(expenses)} gastos · {money(withdrawals)} retiros</small></div>
      </section>
      <section className="dashboard-columns">
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Caja</div><h2>Estado del turno</h2></div><span className={`status-pill ${cash ? "status-open" : "status-closed"}`}>{cash ? "Abierta" : "Cerrada"}</span></div>{cash ? <div className="cash-summary"><div><span>Saldo inicial</span><strong>{money(Number(cash.opening_amount))}</strong></div><div><span>Ingresos</span><strong>{money(incomes + cashSales)}</strong></div><div><span>Salidas</span><strong>{money(expenses + withdrawals)}</strong></div></div> : <p className="muted">No hay una caja abierta en este momento.</p>}<a className="link dashboard-link" href="/dashboard/cash">Ver caja y movimientos →</a></div>
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Inventario</div><h2>Stock bajo</h2></div><span className="stock-count">{lowStock?.length || 0}</span></div>{lowStock?.length ? <div className="low-stock-list">{lowStock.map((product) => <div className="low-stock-item" key={product.id}><span>{product.name}<small>Stock actual: {product.stock}</small></span><strong>Mín. {product.min_stock}</strong></div>)}</div> : <p className="muted">No hay productos por debajo del mínimo.</p>}<a className="link dashboard-link" href="/dashboard/products">Ver inventario →</a></div>
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Revisión sugerida</div><h2>Productos de stock estimado</h2></div><span className="stock-count">{reviewStock.length}</span></div>{reviewStock.length ? <><p className="muted">Se vendieron más durante los últimos 7 días. Conviene revisar su existencia.</p><div className="low-stock-list">{reviewStock.map(product => <div className="low-stock-item" key={product.id}><span>{product.name}<small>{product.quantity} venta{product.quantity === 1 ? "" : "s"} recientes</small></span><strong>Revisar</strong></div>)}</div></> : <p className="muted">Todavía no hay productos de stock estimado con alta rotación.</p>}<a className="link dashboard-link" href="/dashboard/products">Ver inventario →</a></div>
      </section>
    </>}
  </main>;
}
