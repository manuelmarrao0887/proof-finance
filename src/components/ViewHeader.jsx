/* ════════════════════════════════════════════════════════════════════════
   ViewHeader — cabeçalho (título + "Voltar") para os ecrãs alcançados a
   partir do "Mais". É o único <h1> desses ecrãs (ver Shell.jsx, que troca o
   <h1> da saudação por um <div> quando esta tab está montada).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export default function ViewHeader({ title, sub, onBack }) {
  return (
    <div className="vhead">
      <button type="button" aria-label="Voltar" onClick={onBack}>
        ‹
      </button>
      <h1>{title}</h1>
      {sub && <div className="lb">{sub}</div>}
    </div>
  );
}
