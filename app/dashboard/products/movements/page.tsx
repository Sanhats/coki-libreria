"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const labels: Record<string, string> = { sale: "Venta", entry: "Entrada", adjustment: "Ajuste" };

export default function StockMovements() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const size = 8;

  useEffect(() => {
    supabase.from("stock_movements").select("id,type,quantity,reason,created_at,products(name),profiles(full_name)").order("created_at", { ascending: false }).then(({ data, error: queryError }) => {
      if (queryError) setError(queryError.message);
      setRows(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter((row) => {
    const product = row.products?.name || "";
    const user = row.profiles?.full_name || "";
    const queryMatch = `${product} ${user} ${row.reason || ""}`.toLowerCase().includes(search.toLowerCase());
    const typeMatch = typeFilter === "all" || row.type === typeFilter;
    const date = new Date(row.created_at).toISOString().slice(0, 10);
    const fromMatch = !fromDate || date >= fromDate;
    const toMatch = !toDate || date <= toDate;
    return queryMatch && typeMatch && fromMatch && toMatch;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = filtered.slice((page - 1) * size, page * size);
  if (loading) return <main className="panel page-loading"><div className="loading-line short" /><div className="loading-line title" /><div className="loading-line text" /><div className="loading-grid"><div /><div /><div /></div></main>;

  return <main className="panel">
    <div className="breadcrumb"><a className="link" href="/dashboard/products">Productos</a><b>/</b><strong>Movimientos</strong></div>
    <div className="panel-header"><div><div className="eyebrow">Inventario</div><h1>Movimientos de stock</h1><p className="muted">Consultá las entradas, ventas y ajustes realizados.</p></div></div>
    <div className="movement-filters"><input className="input" placeholder="Buscar producto, usuario o motivo…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /><select className="input" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}><option value="all">Todos los movimientos</option><option value="sale">Ventas</option><option value="entry">Entradas</option><option value="adjustment">Ajustes</option></select><label>Desde<input className="input" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} /></label><label>Hasta<input className="input" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} /></label><button className="link" type="button" onClick={() => { setSearch(""); setTypeFilter("all"); setFromDate(""); setToDate(""); setPage(1); }}>Limpiar filtros</button></div>
    {error && <div className="error">{error}</div>}
    <div className="table-card"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>{current.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(row.created_at))}</td><td><strong>{row.products?.name || "Producto"}</strong></td><td><span className={`movement-badge movement-${row.type}`}>{labels[row.type] || row.type}</span></td><td className={Number(row.quantity) < 0 ? "movement-negative" : "movement-positive"}>{Number(row.quantity) > 0 ? "+" : ""}{row.quantity}</td><td>{row.reason || (row.type === "sale" ? "Venta registrada" : "—")}</td><td>{row.profiles?.full_name || "Usuario"}</td></tr>)}{!current.length && <tr><td colSpan={6} className="muted">No hay movimientos que coincidan con los filtros.</td></tr>}</tbody></table></div>
    <div className="pagination"><button className="link" disabled={page === 1} onClick={() => setPage(page - 1)}>← Anterior</button><span>Página {page} de {pages}</span><button className="link" disabled={page === pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div>
  </main>;
}
