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
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);
  const [{ data: sales }, { data: movements }, { data: cash }, { data: lowStock }, { data: estimatedItems }, { data: weekSales }] = await Promise.all([
    supabase.from("sales").select("total,payment_method").gte("created_at", today.toISOString()),
    supabase.from("cash_movements").select("type,amount,description").gte("created_at", today.toISOString()),
    supabase.from("cash_registers").select("id,status,opening_amount,opened_at,closing_amount,difference").eq("status", "open").maybeSingle(),
    supabase.from("products").select("id,name,stock,min_stock").eq("active", true).filter("stock", "lte", "min_stock").order("stock").limit(6),
    supabase.from("sale_items").select("quantity,products!inner(id,name,stock),sales!inner(created_at)").eq("products.stock", 1).gte("sales.created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase.from("sales").select("total,created_at").gte("created_at", weekStart.toISOString()).lt("created_at", today.toISOString()),
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
  const previousSales = (weekSales || []).reduce((sum, sale) => sum + Number(sale.total), 0);
  const change = previousSales > 0 ? Math.round(((totalSales - previousSales / 7) / (previousSales / 7)) * 100) : null;
  const insight = totalSales === 0
    ? "Todavía no hay ventas registradas hoy. Podés comenzar revisando la caja y el catálogo."
    : change !== null && change > 10
      ? `El ritmo de ventas de hoy está ${change}% por encima del promedio de los últimos 7 días.`
      : change !== null && change < -10
        ? `El ritmo de ventas de hoy está ${Math.abs(change)}% por debajo del promedio reciente.`
        : `Hoy llevás ${rows.length} operación${rows.length === 1 ? "" : "es"} y ${money(totalSales)} facturados.`;
  const nextAction = lowStock?.length
    ? `Revisá ${lowStock[0].name} y los demás productos que están por debajo del mínimo.`
    : reviewStock.length
      ? `Hacé un conteo físico de ${reviewStock[0].name}, que tuvo la mayor rotación reciente.`
      : !cash
        ? "Abrí la caja para comenzar a registrar operaciones."
        : expenses + withdrawals > cashSales && cashSales > 0
          ? "Revisá las salidas de dinero: hoy superan lo cobrado en efectivo."
          : "El negocio está al día. Podés revisar la rentabilidad de tus productos.";
  const alerts = [
    ...(lowStock || []).slice(0, 3).map(product => ({ level: "Importante", tone: "warning", title: `${product.name} está por debajo del mínimo`, detail: `Stock actual: ${product.stock}. Mínimo configurado: ${product.min_stock}.`, href: "/dashboard/products", action: "Revisar inventario" })),
    ...reviewStock.slice(0, 2).map(product => ({ level: "Sugerencia", tone: "info", title: `${product.name} tuvo alta rotación`, detail: `${product.quantity} unidades vendidas durante los últimos 7 días con stock estimado.`, href: "/dashboard/products", action: "Revisar existencia" })),
    ...((expenses + withdrawals > cashSales && cashSales > 0) ? [{ level: "Importante", tone: "warning", title: "Las salidas superan el efectivo cobrado", detail: `${money(expenses + withdrawals)} de salidas frente a ${money(cashSales)} cobrados en efectivo hoy.`, href: "/dashboard/cash", action: "Ver movimientos" }] : []),
    ...((!cash && rows.length === 0) ? [{ level: "Atención", tone: "neutral", title: "La caja todavía está cerrada", detail: "Abrí la caja para comenzar a operar y registrar ventas.", href: "/dashboard/cash", action: "Abrir caja" }] : []),
  ];

  return <main className="panel admin-dashboard">
    <header className="dashboard-heading"><div><div className="breadcrumb"><span>Inicio</span><b>/</b><strong>Resumen general</strong></div><h1>Hola, {profile?.full_name || user.email}</h1><p className="muted">Una vista rápida de las operaciones de tu negocio.</p></div><LogoutButton /></header>
    {!isAdmin ? <div className="empty-panel"><h3>Panel de operación</h3><p className="muted">Desde aquí podés acceder a tus ventas, productos y caja.</p></div> : <>
      <section className="quick-grid dashboard-metrics">
        <div className="metric"><span className="metric-label">Ventas del día</span><strong className="metric-value">{money(totalSales)}</strong><small>{rows.length} operación{rows.length === 1 ? "" : "es"}</small></div>
        <div className="metric"><span className="metric-label">Cobrado en efectivo</span><strong className="metric-value">{money(cashSales)}</strong><small>Dinero físico recibido</small></div>
        <div className="metric"><span className="metric-label">Cobrado por transferencia</span><strong className="metric-value">{money(transfers)}</strong><small>Pagos electrónicos recibidos</small></div>
        <div className="metric"><span className="metric-label">Salidas de dinero</span><strong className="metric-value">{money(expenses + withdrawals)}</strong><small>{money(expenses)} gastos · {money(withdrawals)} retiros</small></div>
      </section>
      <section className="insight-grid"><div className="insight-card"><span className="eyebrow">Lectura del día</span><h2>Qué está pasando</h2><p>{insight}</p></div><div className="insight-card insight-action"><span className="eyebrow">Próximo paso</span><h2>Qué revisar ahora</h2><p>{nextAction}</p><a className="link dashboard-link" href={lowStock?.length || reviewStock.length ? "/dashboard/products" : "/dashboard/reports"}>{lowStock?.length || reviewStock.length ? "Ir al inventario →" : "Ver informes →"}</a></div></section>
      <section className="alerts-panel"><div className="section-heading"><div><div className="eyebrow">Centro de atención</div><h2>Alertas del negocio</h2></div><span className={`alerts-count ${alerts.length ? "has-alerts" : ""}`}>{alerts.length ? `${alerts.length} pendiente${alerts.length === 1 ? "" : "s"}` : "Todo en orden"}</span></div>{alerts.length ? <div className="alerts-list">{alerts.map((alert, index) => <div className={`alert-item alert-${alert.tone}`} key={`${alert.title}-${index}`}><span className="alert-dot"/><div className="alert-copy"><span className="alert-level">{alert.level}</span><strong>{alert.title}</strong><p>{alert.detail}</p></div><a className="alert-action" href={alert.href}>{alert.action} →</a></div>)}</div> : <div className="alerts-empty"><span>✓</span><div><strong>No hay alertas pendientes</strong><p>Las operaciones principales están dentro de los parámetros habituales.</p></div></div>}</section>
      <section className="daily-routine"><div className="section-heading"><div><div className="eyebrow">Acompañamiento</div><h2>Rutina de hoy</h2></div><span className="routine-progress">{[Boolean(cash), rows.length > 0, !lowStock?.length].filter(Boolean).length}/3 completos</span></div><div className="routine-grid"><a className={`routine-step ${cash ? "complete" : "attention"}`} href="/dashboard/cash"><span className="routine-icon">{cash ? "✓" : "1"}</span><span><strong>{cash ? "Caja abierta" : "Abrir caja"}</strong><small>{cash ? "Lista para operar" : "Prepará el turno de hoy"}</small></span><b>→</b></a><a className={`routine-step ${rows.length ? "complete" : "attention"}`} href="/dashboard/sales"><span className="routine-icon">{rows.length ? "✓" : "2"}</span><span><strong>{rows.length ? "Ventas registradas" : "Registrar primera venta"}</strong><small>{rows.length ? `${rows.length} operación${rows.length === 1 ? "" : "es"} hoy` : "Mantené actualizado el movimiento"}</small></span><b>→</b></a><a className={`routine-step ${!lowStock?.length ? "complete" : "attention"}`} href="/dashboard/products"><span className="routine-icon">{!lowStock?.length ? "✓" : "3"}</span><span><strong>{lowStock?.length ? "Revisar inventario" : "Inventario en orden"}</strong><small>{lowStock?.length ? `${lowStock.length} producto${lowStock.length === 1 ? "" : "s"} requiere${lowStock.length === 1 ? "" : "n"} atención` : "Sin faltantes detectados"}</small></span><b>→</b></a></div></section>
      <section className="dashboard-columns">
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Caja</div><h2>Estado del turno</h2></div><span className={`status-pill ${cash ? "status-open" : "status-closed"}`}>{cash ? "Abierta" : "Cerrada"}</span></div>{cash ? <div className="cash-summary"><div><span>Saldo inicial</span><strong>{money(Number(cash.opening_amount))}</strong></div><div><span>Ingresos</span><strong>{money(incomes + cashSales)}</strong></div><div><span>Salidas</span><strong>{money(expenses + withdrawals)}</strong></div></div> : <p className="muted">No hay una caja abierta en este momento.</p>}<a className="link dashboard-link" href="/dashboard/cash">Ver caja y movimientos →</a></div>
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Inventario</div><h2>Stock bajo</h2></div><span className="stock-count">{lowStock?.length || 0}</span></div>{lowStock?.length ? <div className="low-stock-list">{lowStock.map((product) => <div className="low-stock-item" key={product.id}><span>{product.name}<small>Stock actual: {product.stock}</small></span><strong>Mín. {product.min_stock}</strong></div>)}</div> : <p className="muted">No hay productos por debajo del mínimo.</p>}<a className="link dashboard-link" href="/dashboard/products">Ver inventario →</a></div>
        <div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Revisión sugerida</div><h2>Productos de stock estimado</h2></div><span className="stock-count">{reviewStock.length}</span></div>{reviewStock.length ? <><p className="muted">Se vendieron más durante los últimos 7 días. Conviene revisar su existencia.</p><div className="low-stock-list">{reviewStock.map(product => <div className="low-stock-item" key={product.id}><span>{product.name}<small>{product.quantity} venta{product.quantity === 1 ? "" : "s"} recientes</small></span><strong>Revisar</strong></div>)}</div></> : <p className="muted">Todavía no hay productos de stock estimado con alta rotación.</p>}<a className="link dashboard-link" href="/dashboard/products">Ver inventario →</a></div>
      </section>
    </>}
  </main>;
}
