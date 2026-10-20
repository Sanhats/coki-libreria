"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Sale = { id: string; total: number; payment_method: string; created_at: string };
type Movement = { type: string; amount: number; description: string | null; created_at: string };
type Item = { quantity: number; subtotal: number; products: { name: string } | null };
const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthStart = () => { const date = new Date(); date.setDate(1); return date.toISOString().slice(0, 10); };
const currentDate = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const supabase = createClient();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(currentDate);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true); setError("");
      const start = new Date(`${from}T00:00:00-03:00`).toISOString();
      const end = new Date(`${to}T23:59:59-03:00`).toISOString();
      const [salesResult, movementsResult, itemsResult] = await Promise.all([
        supabase.from("sales").select("id,total,payment_method,created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("cash_movements").select("type,amount,description,created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("sale_items").select("quantity,subtotal,products(name),sales!inner(created_at)").gte("sales.created_at", start).lte("sales.created_at", end),
      ]);
      const firstError = salesResult.error || movementsResult.error || itemsResult.error;
      if (firstError) setError(firstError.message);
      setSales((salesResult.data || []) as Sale[]);
      setMovements((movementsResult.data || []) as Movement[]);
      setItems((itemsResult.data || []) as unknown as Item[]);
      setLoading(false);
    }
    load();
  }, [from, to]);

  const summary = useMemo(() => {
    const total = sales.reduce((sum, row) => sum + Number(row.total), 0);
    const cash = sales.filter(row => row.payment_method === "cash").reduce((sum, row) => sum + Number(row.total), 0);
    const transfer = sales.filter(row => row.payment_method === "transfer").reduce((sum, row) => sum + Number(row.total), 0);
    const expenses = movements.filter(row => row.type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
    const withdrawals = movements.filter(row => row.type === "withdrawal").reduce((sum, row) => sum + Number(row.amount), 0);
    const incomes = movements.filter(row => row.type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
    const products = new Map<string, { name: string; quantity: number; subtotal: number }>();
    items.forEach(item => { const name = item.products?.name || "Producto"; const current = products.get(name) || { name, quantity: 0, subtotal: 0 }; current.quantity += Number(item.quantity); current.subtotal += Number(item.subtotal); products.set(name, current); });
    return { total, cash, transfer, expenses, withdrawals, incomes, products: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8) };
  }, [sales, movements, items]);

  function exportCsv() {
    const rows = [["Tipo", "Descripción", "Método", "Monto", "Fecha"], ...sales.map(row => ["Venta", `#${row.id.slice(0, 8).toUpperCase()}`, row.payment_method === "cash" ? "Efectivo" : "Transferencia", Number(row.total).toFixed(2), new Date(row.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })]), ...movements.map(row => [row.type === "income" ? "Ingreso" : row.type === "expense" ? "Gasto" : "Retiro", row.description || "Movimiento de caja", "", Number(row.amount).toFixed(2), new Date(row.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `escuadra-informe-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <main className="panel reports-page">
    <header className="dashboard-heading"><div><div className="breadcrumb"><span>Administración</span><b>/</b><strong>Reportes</strong></div><h1>Informes</h1><p className="muted">Una lectura clara del movimiento de tu negocio.</p></div></header>
    <section className="report-toolbar"><div><label htmlFor="from">Desde</label><input id="from" className="input" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div><div><label htmlFor="to">Hasta</label><input id="to" className="input" type="date" value={to} onChange={event => setTo(event.target.value)} /></div><button className="secondary-button" onClick={() => { setFrom(monthStart()); setTo(currentDate()); }}>Este mes</button><button className="button report-export" disabled={loading || (!sales.length && !movements.length)} onClick={exportCsv}>Descargar CSV</button></section>
    {error && <div className="error">No se pudo cargar el informe: {error}</div>}
    {loading ? <div className="reports-loading"><div /><div /><div /></div> : <>
      <section className="quick-grid report-metrics"><div className="metric report-primary"><span className="metric-label">Ventas del período</span><strong className="metric-value">{money(summary.total)}</strong><small>{sales.length} operación{sales.length === 1 ? "" : "es"}</small></div><div className="metric"><span className="metric-label">Efectivo</span><strong className="metric-value">{money(summary.cash)}</strong><small>Ventas cobradas en efectivo</small></div><div className="metric"><span className="metric-label">Transferencias</span><strong className="metric-value">{money(summary.transfer)}</strong><small>Pagos electrónicos</small></div><div className="metric"><span className="metric-label">Salidas</span><strong className="metric-value">{money(summary.expenses + summary.withdrawals)}</strong><small>{money(summary.expenses)} gastos · {money(summary.withdrawals)} retiros</small></div></section>
      <section className="report-columns"><div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Inventario</div><h2>Productos más vendidos</h2></div></div>{summary.products.length ? <div className="report-product-list">{summary.products.map(product => <div className="report-product" key={product.name}><span><strong>{product.name}</strong><small>{product.quantity} unidad{product.quantity === 1 ? "" : "es"}</small></span><strong>{money(product.subtotal)}</strong></div>)}</div> : <p className="muted">No hay ventas en este período.</p>}</div><div className="dashboard-card"><div className="section-heading"><div><div className="eyebrow">Caja</div><h2>Movimientos</h2></div></div><div className="report-cash-list"><div><span>Ingresos manuales</span><strong className="positive">{money(summary.incomes)}</strong></div><div><span>Gastos</span><strong>{money(summary.expenses)}</strong></div><div><span>Retiros</span><strong>{money(summary.withdrawals)}</strong></div></div><a className="link dashboard-link" href="/dashboard/cash">Ver caja y movimientos →</a></div></section>
    </>}
  </main>;
}
