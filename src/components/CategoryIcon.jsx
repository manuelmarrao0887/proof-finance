/* ════════════════════════════════════════════════════════════════════════
   CategoryIcon — círculo com fundo suave (cor da categoria a ~13%) e o ícone
   da categoria na cor cheia. Elemento assinatura do redesign Finany.
   Uso: <CategoryIcon id="rest" size={40} />
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import Icon from './Icon.jsx';
import { catMeta } from '../lib/categories.js';

export default function CategoryIcon({ id, size = 40, style, className, bdg }) {
  const item = Array.isArray(bdg) ? bdg.find((b) => b.id === id) : null;
  const meta = catMeta(id, item);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: meta.color + '22', // hex alpha ~13%
        color: meta.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={meta.icon} size={Math.round(size * 0.5)} />
    </div>
  );
}
