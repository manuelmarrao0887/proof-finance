/* ════════════════════════════════════════════════════════════════════════
   StatTiles — três números lado a lado (eyebrow por baixo, ícone opcional,
   barra de cor opcional no topo). Substitui frases do tipo "910 € por ano ·
   2 subscrições · falta pagar 40 €".
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export default function StatTiles({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  return (
    <div className="tiles">
      {list.map((it, i) => (
        <div key={it.key || i} className="tile" title={it.title}>
          {it.color ? <span className="tile-bar" style={{ background: it.color }} aria-hidden="true" /> : null}
          {it.icon || null}
          <b>{it.value}</b>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
