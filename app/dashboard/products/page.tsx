"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase-browser";
import ProductTable from "@/components/products/product-table";
import "@/components/products/product-table.css";
import "./products.css";
import "./compact.css";
const blank = {
  name: "",
  brand: "",
  cost_price: "",
  sale_price: "",
  stock: "",
  min_stock: "",
};
export default function Products() {
  const s = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [adjustmentStock, setAdjustmentStock] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  async function load() {
    setReady(false);
    const { data, error } = await s
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) setError(error.message);
    setRows(data || []);
    setReady(true);
  }
  useEffect(() => {
    load();
    s.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: p } = await s
          .from("profiles")
          .select("role,business_id")
          .eq("id", data.user.id)
          .single();
        setAdmin(p?.role === "admin");
        setBusinessId(p?.business_id || null);
      }
    });
  }, []);
  function edit(p: any) {
    setEditing(p);
    setForm({
      name: p.name,
      brand: p.brand || "",
      cost_price: String(p.cost_price),
      sale_price: String(p.sale_price),
      stock: String(p.stock),
      min_stock: String(p.min_stock),
    });
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      brand: form.brand || null,
      cost_price: Number(form.cost_price || 0),
      sale_price: Number(form.sale_price || 0),
      stock: Number(form.stock || 0),
      min_stock: Number(form.min_stock || 0),
      unit: "unidad",
      updated_at: new Date().toISOString(),
    };
    if (!editing && businessId) Object.assign(payload, { business_id: businessId });
    const r = editing
      ? await s.from("products").update(payload).eq("id", editing.id)
      : await s.from("products").insert(payload);
    if (r.error) setError(r.error.message);
    else {
      setOpen(false);
      setEditing(null);
      setForm(blank);
      load();
    }
  }
  function downloadTemplate() {
    const rows = [{ nombre: "Ejemplo de producto", precio_costo: 100, precio_venta: 150, stock: 10, stock_minimo: 2 }];
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Productos");
    XLSX.writeFile(book, "plantilla-productos-escuadra.xlsx");
  }
  async function importExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !businessId) return;
    setError("");
    setMessage("");
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const products = rows.map((row, index) => {
        const name = String(row.nombre ?? "").trim();
        const cost = Number(row.precio_costo ?? 0);
        const sale = Number(row.precio_venta ?? 0);
        const stock = Number(row.stock ?? 0);
        const minimum = Number(row.stock_minimo ?? 0);
        if (!name || [cost, sale, stock, minimum].some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`Fila ${index + 2}: revisá el nombre y los valores numéricos.`);
        return { business_id: businessId, name, cost_price: cost, sale_price: sale, stock, min_stock: minimum, unit: "unidad" };
      });
      if (!products.length) throw new Error("El archivo no contiene productos.");
      const { error: insertError } = await s.from("products").insert(products);
      if (insertError) throw new Error(insertError.message);
      setMessage(`${products.length} producto${products.length === 1 ? "" : "s"} importado${products.length === 1 ? "" : "s"} correctamente.`);
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "No se pudo leer el archivo.");
    } finally {
      setImporting(false);
    }
  }
  async function adjustStock(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const stock = Number(adjustmentStock);
    if (!adjusting || !Number.isFinite(stock) || stock < 0 || !adjustmentReason.trim()) {
      setError("Ingresá un stock válido y el motivo del ajuste.");
      return;
    }
    setAdjustmentLoading(true);
    const { error: adjustmentError } = await s.rpc("adjust_stock", { product_id: adjusting.id, new_stock: stock, adjustment_reason: adjustmentReason.trim() });
    if (adjustmentError) setError(adjustmentError.message);
    else {
      setMessage("Stock ajustado correctamente.");
      setAdjusting(null);
      setAdjustmentReason("");
      setAdjustmentStock("");
      await load();
    }
    setAdjustmentLoading(false);
  }
  const list = rows.filter((p) =>
    (p.name + " " + (p.sku || "")).toLowerCase().includes(q.toLowerCase()),
  );
  if (!ready) return <main className="panel page-loading"><div className="loading-line short"/><div className="loading-line title"/><div className="loading-line text"/><div className="loading-grid"><div/><div/><div/></div></main>;
  return (
    <main className="panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Inventario</div>
          <h1></h1>
          <p className="muted">
            {admin
              ? "Administrá el catálogo y el stock."
            :""}
          </p>
        </div>
        {admin && (
          <div className="product-actions">
          <button className="button secondary-button" type="button" onClick={downloadTemplate}>Descargar plantilla</button>
          <label className="button top-button import-button">{importing ? "Importando…" : "Importar Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} disabled={importing} /></label>
          <button
            className="button top-button"
            onClick={() => {
              setEditing(null);
              setForm(blank);
              setOpen(true);
            }}
          >
            + Nuevo producto
          </button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar producto o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <ProductTable products={list} canEdit={admin} onEdit={edit} onAdjust={(product) => { setAdjusting(product); setAdjustmentStock(String(product.stock)); setAdjustmentReason(""); }} />
      {adjusting && <div className="modal-backdrop"><form className="modal" onSubmit={adjustStock}><h2>Ajustar stock</h2><p className="muted">{adjusting.name}<br />Stock actual: <strong>{adjusting.stock}</strong></p><label className="field">Nuevo stock<input className="input" type="number" min="0" step="0.01" required value={adjustmentStock} onChange={(e) => setAdjustmentStock(e.target.value)} /></label><label className="field">Motivo<input className="input" required value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="Ej. Conteo físico" /></label><div className="modal-actions"><button type="button" className="link" onClick={() => setAdjusting(null)}>Cancelar</button><button className="button" disabled={adjustmentLoading}>{adjustmentLoading ? "Guardando…" : "Guardar ajuste"}</button></div></form></div>}
      {open && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <h2>{editing ? "Editar producto" : "Nuevo producto"}</h2>
            <label className="field">
              Nombre
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="field">
              Marca
              <input
                className="input"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Precio costo
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) =>
                    setForm({ ...form, cost_price: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Precio venta
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Stock actual
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
              <label className="field">
                Stock mínimo
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.min_stock}
                  onChange={(e) =>
                    setForm({ ...form, min_stock: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="link"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="button">Guardar producto</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
