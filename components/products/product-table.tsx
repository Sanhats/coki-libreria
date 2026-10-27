"use client";
import { useEffect, useState } from "react";
type Props = { products: any[]; canEdit: boolean; onEdit: (product: any) => void; onAdjust: (product: any) => void };
export default function ProductTable({ products, canEdit, onEdit, onAdjust }: Props) {
  const [page, setPage] = useState(1); const size = 8; const pages = Math.max(1, Math.ceil(products.length / size));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const current = products.slice((page - 1) * size, page * size);
  return <><div className="table-card spreadsheet-card"><table className="spreadsheet-table"><thead><tr><th>#</th><th>Producto</th><th>SKU</th><th>Precio venta</th><th>Stock actual</th>{canEdit && <th>Acciones</th>}</tr></thead><tbody>
    {current.map((product, index) => <tr key={product.id}><td className="row-number">{(page - 1) * size + index + 1}</td><td><strong>{product.name}</strong><small>{product.brand || "Producto unitario"}</small></td><td>{product.sku || "—"}</td><td className="money-cell">${Number(product.sale_price).toFixed(2)}</td><td className={Number(product.stock) <= Number(product.min_stock) ? "low-stock" : ""}>{product.stock}</td>{canEdit && <td><button className="link" onClick={() => onAdjust(product)}>Ajustar</button><button className="link table-action" onClick={() => onEdit(product)}>Editar</button></td>}</tr>)}
    {!current.length && <tr><td colSpan={canEdit ? 6 : 5} className="muted">No hay productos para mostrar.</td></tr>}
  </tbody></table></div><div className="pagination"><button className="link" disabled={page === 1} onClick={() => setPage(page - 1)}>← Anterior</button><span>Página {page} de {pages}</span><button className="link" disabled={page === pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div></>;
}
