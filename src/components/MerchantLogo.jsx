/* ════════════════════════════════════════════════════════════════════════
   MerchantLogo — o círculo à esquerda de cada linha de lista.

   Cadeia: marca conhecida (pack local) → logo + categoria como badge no
   canto; sem marca → CategoryIcon; sem categoria → inicial num círculo com
   cor estável por nome. BankLogo e AssetLogo usam o mesmo pack.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { BRANDS, resolveBrand, resolveAsset, hashHue } from '../lib/brands.jsx';
import CategoryIcon from './CategoryIcon.jsx';

export function BrandMark({ id, size = 40, radius, title }) {
  const b = BRANDS[id];
  if (!b) return null;
  const label = title || b.name;
  return (
    <span
      className="brand"
      role="img"
      aria-label={label}
      title={label}
      style={{ width: size, height: size, borderRadius: radius != null ? radius : Math.round(size * 0.28), background: b.bg, color: b.fg }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{b.node}</svg>
    </span>
  );
}

export function Initial({ name, size = 40 }) {
  const hue = hashHue(name);
  const ch = String(name || '').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="initial"
      role="img"
      aria-label={name || '?'}
      title={name || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: 'hsl(' + hue + ' 60% 90%)', color: 'hsl(' + hue + ' 55% 32%)' }}
    >
      {ch}
    </span>
  );
}

export default function MerchantLogo({ text, cat, size = 40, bdg }) {
  const id = resolveBrand(text);
  if (id) {
    return (
      <span className="mlogo" style={{ width: size, height: size }}>
        <BrandMark id={id} size={size} />
        {cat ? <CategoryIcon id={cat} size={Math.round(size * 0.4)} className="mlogo-badge" bdg={bdg} /> : null}
      </span>
    );
  }
  if (cat) return <CategoryIcon id={cat} size={size} bdg={bdg} />;
  return <Initial name={text} size={size} />;
}

export function BankLogo({ bank, size = 36 }) {
  const id = resolveBrand(bank);
  return id ? <BrandMark id={id} size={size} /> : <Initial name={bank} size={size} />;
}

export function AssetLogo({ ticker, size = 40 }) {
  const id = resolveAsset(ticker);
  return id ? <BrandMark id={id} size={size} /> : <Initial name={ticker} size={size} />;
}
