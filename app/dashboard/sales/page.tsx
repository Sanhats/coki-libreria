"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import "./sales.css";
type Product = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  sale_price: number;
};
type Cart = Product & { quantity: number };
export default function Sales() {
  const s = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<Cart[]>([]);
  const [payment, setPayment] = useState<"cash" | "transfer">("cash");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await s.auth.getUser();
      if (!user) return;
      const { data: cash } = await s
        .from("cash_registers")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "open")
        .maybeSingle();
      setCashOpen(!!cash);
      if (cash) {
        const { data, error } = await s
          .from("products")
          .select("id,name,sku,stock,sale_price")
          .eq("active", true)
          .order("name");
        if (error) setError(error.message);
        setProducts(data || []);
      }
    }
    init();
  }, []);
  function add(p: Product) {
    setCart((c) => {
      const x = c.find((i) => i.id === p.id);
      return x
        ? c.map((i) =>
            i.id === p.id
              ? { ...i, quantity: p.stock === 1 ? i.quantity + 1 : Math.min(i.quantity + 1, Number(p.stock)) }
              : i,
          )
        : [...c, { ...p, quantity: 1 }];
    });
  }
  function remove(id: string) {
    setCart((c) => c.filter((i) => i.id !== id));
  }
  const filteredProducts = products.filter((p) =>
    (p.name + " " + p.sku).toLowerCase().includes(q.toLowerCase()),
  );
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  async function confirm() {
    setError("");
    setDone("");
    if (!cart.length || total <= 0) {
      setError("Agregá al menos un producto para registrar la venta.");
      return;
    }
    const invalid = cart.find((item) => Number(item.stock) !== 1 && item.quantity > Number(item.stock));
    if (invalid) {
      setError(`No hay stock suficiente de ${invalid.name}.`);
      return;
    }
    setLoading(true);
    const { error } = await s.rpc("create_sale", {
      items: cart.map((x) => ({ product_id: x.id, quantity: x.quantity })),
      sale_payment: payment,
    });
    if (error) setError(error.message);
    else {
      setDone("Venta registrada correctamente.");
      setCart([]);
    }
    setLoading(false);
  }
  const total = cart.reduce((n, x) => n + x.quantity * Number(x.sale_price), 0);
  if (cashOpen === null)
    return (
      <main className="panel">
        <h1>Nueva venta</h1>
        <p className="muted">Verificando el estado de tu caja…</p>
      </main>
    );
  if (!cashOpen)
    return (
      <main className="panel">
        <h1>Nueva venta</h1>
        <div className="empty-panel">
          <h3>Abrí tu caja para comenzar</h3>
          <p className="muted">
            Necesitás tener una caja abierta antes de cargar productos o
            registrar una venta.
          </p>
          <a className="button" href="/dashboard/cash">
            Ir a Mi caja
          </a>
        </div>
      </main>
    );
  return (
    <main className="panel">
      <h1>Nueva venta</h1>
      <div className="sale-layout">
        <section>
          <div className="sale-search"><input className="input" type="search" autoFocus autoComplete="off" placeholder="Buscar desde la primera letra…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />{q && <button type="button" className="clear-search" aria-label="Limpiar búsqueda" onClick={() => { setQ(""); setPage(1); }}>×</button>}</div>
          <div className="product-results">
            {visibleProducts.map((p) => (
                <button
                  type="button"
                  className="product-result"
                  key={p.id}
                  onClick={() => add(p)}
                >
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.stock === 1 ? "Stock estimado · Tocar para agregar" : `${p.sku} · Disponible: ${p.stock}`}</small>
                  </span>
                  <span className="product-result-price"><b>${Number(p.sale_price).toFixed(2)}</b><em>Agregar</em></span>
                </button>
              ))}
          </div>
          <div className="pagination">
            <button className="link" disabled={page === 1} onClick={() => setPage(page - 1)}>← Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="link" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Siguiente →</button>
          </div>
        </section>
        <aside className="cart">
          <h2>Venta actual</h2>
          {cart.length ? (
            cart.map((x) => (
              <div className="cart-row" key={x.id}>
                <span>
                  {x.name}
                  <small>
                    {x.quantity} × ${Number(x.sale_price).toFixed(2)}
                  </small>
                </span>
                <span>
                  <strong>
                    ${(x.quantity * Number(x.sale_price)).toFixed(2)}
                  </strong>
                    <button type="button" className="remove-item" onClick={() => remove(x.id)}>
                    Quitar
                  </button>
                </span>
              </div>
            ))
          ) : (
            <p className="muted">Agregá productos para comenzar.</p>
          )}
          <div className="cart-total">
            <span>Total</span>
            <strong>${total.toFixed(2)}</strong>
          </div>
          <label className="field">
            Medio de pago
            <select
              className="input"
              value={payment}
              onChange={(e) =>
                setPayment(e.target.value as "cash" | "transfer")
              }
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <button className="button" disabled={!cart.length || loading} onClick={confirm}>
            {loading ? "Registrando…" : "Confirmar venta"}
          </button>
          {error && <div className="error">{error}</div>}
          {done && <div className="success">{done}</div>}
        </aside>
      </div>
    </main>
  );
}
