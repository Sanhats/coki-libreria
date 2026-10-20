"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import "./cash.css";
export default function Cash() {
  const s = createClient();
  const [cash, setCash] = useState<any>(null);
  const [moves, setMoves] = useState<any[]>([]);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<"income" | "expense" | "withdrawal">("expense");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  async function load() {
    setReady(false);
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) return;
    const { data: profile } = await s.from("profiles").select("business_id").eq("id", user.id).single();
    setBusinessId(profile?.business_id || null);
    const { data } = await s
      .from("cash_registers")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open")
      .maybeSingle();
    setCash(data);
    if (data) {
      const { data: m } = await s
        .from("cash_movements")
        .select("*")
        .eq("cash_register_id", data.id)
        .order("created_at", { ascending: false });
      setMoves(m || []);
    } else {
      const { data: last } = await s
        .from("cash_registers")
        .select("closing_amount")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .not("closing_amount", "is", null)
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) setOpening(String(last.closing_amount));
    }
    setReady(true);
  }
  useEffect(() => {
    load();
  }, []);
  async function open() {
    setError("");
    setMessage("");
    const amount = Number(opening);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Ingresá un monto inicial válido.");
      return;
    }
    setLoading(true);
    const { error } = await s.rpc("open_cash", { amount });
    if (error) setError(error.message);
    else {
      setMessage("Caja abierta correctamente.");
      load();
    }
    setLoading(false);
  }
  async function close() {
    setError("");
    setMessage("");
    const counted = Number(closing || expected);
    if (!Number.isFinite(counted) || counted < 0) {
      setError("Ingresá un efectivo contado válido.");
      return;
    }
    setLoading(true);
    const { error } = await s.rpc("close_cash", {
      register_id: cash.id,
      counted,
    });
    if (error) setError(error.message);
    else {
      setMessage("Caja cerrada correctamente.");
      setCash(null);
      setMoves([]);
      setClosing("");
      load();
    }
    setLoading(false);
  }
  async function addMovement() {
    setError("");
    setMessage("");
    const amount = Number(movementAmount);
    if (!cash || !businessId || !Number.isFinite(amount) || amount <= 0 || !movementDescription.trim()) {
      setError("Ingresá un importe positivo y una descripción para el movimiento.");
      return;
    }
    const { data: { user } } = await s.auth.getUser();
    if (!user) return;
    setSavingMovement(true);
    const { error } = await s.from("cash_movements").insert({
      business_id: businessId,
      cash_register_id: cash.id,
      user_id: user.id,
      type: movementType,
      amount,
      description: movementDescription.trim(),
    });
    if (error) setError(error.message);
    else {
      setMessage("Movimiento registrado correctamente.");
      setMovementAmount("");
      setMovementDescription("");
      await load();
    }
    setSavingMovement(false);
  }
  const cashSales = moves
    .filter((m) => m.description === "Venta en efectivo")
    .reduce((n, m) => n + Number(m.amount), 0);
  const transfers = moves
    .filter((m) => m.description === "Venta por transferencia")
    .reduce((n, m) => n + Number(m.amount), 0);
  const incomes = moves.filter((m) => m.type === "income").reduce((n, m) => n + Number(m.amount), 0);
  const expenses = moves.filter((m) => m.type === "expense").reduce((n, m) => n + Number(m.amount), 0);
  const withdrawals = moves.filter((m) => m.type === "withdrawal").reduce((n, m) => n + Number(m.amount), 0);
  const expected = Number(cash?.opening_amount || 0) + cashSales + incomes - expenses - withdrawals;
  if (!ready) return <main className="panel page-loading"><div className="loading-line short"/><div className="loading-line title"/><div className="loading-line text"/><div className="loading-grid"><div/><div/><div/></div></main>;
  return (
    <main className="panel">
      <div className="eyebrow">Operación</div>
      <h1>Mi caja</h1>
      <p className="muted">Administrá el turno de caja del día.</p>
      {!cash ? (
        <div className="cash-card">
          <h2>Abrir caja</h2>
          <p className="muted">
            El monto se completa con el cierre anterior. Podés modificarlo si
            hubo un retiro o ajuste.
          </p>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.00"
          />
          <button className="button" onClick={open} disabled={loading}>
            {loading ? "Abriendo…" : "Abrir caja"}
          </button>
        </div>
      ) : (
        <>
          <div className="cash-metrics">
            <div>
              <span>Efectivo esperado</span>
              <strong>${expected.toFixed(2)}</strong>
            </div>
            <div>
              <span>Ventas efectivo</span>
              <strong>${cashSales.toFixed(2)}</strong>
            </div>
            <div>
              <span>Transferencias</span>
              <strong>${transfers.toFixed(2)}</strong>
            </div>
            <div>
              <span>Total vendido</span>
              <strong>${(cashSales + transfers).toFixed(2)}</strong>
            </div>
          </div>
          <div className="cash-card">
            <h2>Caja abierta</h2>
            <p>
              Abierta desde: {new Date(cash.opened_at).toLocaleString("es-AR")}
            </p>
            <p>
              Monto inicial:{" "}
              <strong>${Number(cash.opening_amount).toFixed(2)}</strong>
            </p>
            <label className="field">
              Efectivo contado al cierre
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
              value={closing || expected.toFixed(2)}
                onChange={(e) => setClosing(e.target.value)}
              />
            </label>
            <button className="button" onClick={close} disabled={loading}>
              {loading ? "Cerrando…" : "Cerrar caja"}
            </button>
          </div>
          <div className="cash-card movement-form">
            <h2>Registrar movimiento</h2>
            <p className="muted">Usá esta sección para ingresos, gastos o retiros durante el turno.</p>
            <div className="form-grid">
              <label className="field">Tipo<select className="input" value={movementType} onChange={(e) => setMovementType(e.target.value as typeof movementType)}><option value="expense">Gasto</option><option value="withdrawal">Retiro</option><option value="income">Ingreso</option></select></label>
              <label className="field">Importe<input className="input" type="number" min="0.01" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="0.00" /></label>
            </div>
            <label className="field">Descripción<input className="input" value={movementDescription} onChange={(e) => setMovementDescription(e.target.value)} placeholder="Ej. Compra de insumos" /></label>
            <button className="button" onClick={addMovement} disabled={savingMovement}>{savingMovement ? "Guardando…" : "Registrar movimiento"}</button>
          </div>
          <div className="table-card cash-movements">
            <h2>Movimientos</h2>
            <table>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Importe</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td>{m.description || m.type}</td>
                    <td>${Number(m.amount).toFixed(2)}</td>
                    <td>
                      {new Date(m.created_at).toLocaleTimeString("es-AR")}
                    </td>
                  </tr>
                ))}
                {!moves.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      Todavía no hay movimientos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
    </main>
  );
}
