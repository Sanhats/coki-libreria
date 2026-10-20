"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Props = { profile: { full_name: string; role: "admin" | "seller" } | null; email: string };
type NavItem = { href: string; label: string; icon: string };

const operations: NavItem[] = [
  { href: "/dashboard/sales", label: "Nueva venta", icon: "+" },
  { href: "/dashboard/sales/history", label: "Historial de ventas", icon: "◷" },
];
const catalog: NavItem[] = [{ href: "/dashboard/products", label: "Productos", icon: "▦" }, { href: "/dashboard/products/movements", label: "Movimientos", icon: "↕" }];
const adminItems: NavItem[] = [{ href: "/dashboard/reports", label: "Reportes", icon: "▥" }];

function Group({ title, items, path, close }: { title: string; items: NavItem[]; path: string; close: () => void }) {
  return <section className="nav-group" aria-label={title}>{items.map((item) => <a className={`nav-item ${path === item.href || path.startsWith(item.href + "/") ? "active" : ""}`} href={item.href} key={item.href} onClick={close}><span className="nav-icon">{item.icon}</span>{item.label}</a>)}</section>;
}

export default function DashboardNav({ profile, email }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = profile?.role === "admin";
  const close = () => setOpen(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() { await createClient().auth.signOut(); window.location.href = "/"; }

  return <>
    <button className="mobile-menu-button" type="button" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={() => setOpen(!open)}><span /><span /><span /></button>
    {open && <button className="mobile-menu-overlay" aria-label="Cerrar menú" onClick={close} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <a className="nav-brand" href="/dashboard" aria-label="Escuadra Software" onClick={close}><img src="/escuadra-logo.png" alt="Escuadra Software" /></a>
      <a className={`nav-item nav-home ${path === "/dashboard" ? "active" : ""}`} href="/dashboard" onClick={close}><span className="nav-icon">⌂</span>Inicio</a>
      <nav className="nav-groups">
        <Group title="OPERACIONES" items={operations} path={path} close={close} />
        <Group title="CATÁLOGO" items={catalog} path={path} close={close} />
        <Group title="CAJA" items={[{ href: "/dashboard/cash", label: "Mi caja", icon: "$" }]} path={path} close={close} />
        {isAdmin && <Group title="ADMINISTRACIÓN" items={adminItems} path={path} close={close} />}
      </nav>
      <div className="nav-bottom"><div className="user-box"><div className="avatar">{(profile?.full_name || email).slice(0, 1).toUpperCase()}</div><div><strong>{profile?.full_name || "Usuario"}</strong><small>{isAdmin ? "Administrador" : "Operador"}</small></div></div><button className="logout" onClick={logout}>Cerrar sesión</button></div>
    </aside>
  </>;
}
