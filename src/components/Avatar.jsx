/* ════════════════════════════════════════════════════════════════════════
   Avatar — círculo com foto (Google) ou iniciais sobre a cor da pessoa.
   AvatarStack — avatares sobrepostos, com "+N" quando há mais do que `max`.
   greetingName — primeiro nome para o "Olá, …" do cabeçalho.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function greetingName(user) {
  if (!user) return '';
  if (user.displayName) return String(user.displayName).trim().split(/\s+/)[0] || '';
  if (user.email) {
    const local = String(user.email).split('@')[0].split(/[._-]/)[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
  }
  return '';
}

/* `decorative`: o avatar não acrescenta nada ao que já está escrito ao lado
   (o cabeçalho já diz "Olá, <nome>"), por isso fica fora da árvore de
   acessibilidade em vez de emprestar o seu `name` — que ali é o email — ao
   nome acessível do <h1>. `initials` permite forçar as iniciais quando quem
   chama já tem uma regra própria (ex.: "Tu" para o próprio utilizador). */
export default function Avatar({ name, photoURL, color, size = 32, decorative, initials }) {
  const a11y = decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name || 'Utilizador' };
  return (
    <span
      className="avatar"
      {...a11y}
      title={name || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color || 'var(--primary)' }}
    >
      {photoURL ? <img src={photoURL} alt="" referrerPolicy="no-referrer" /> : initials || initialsFrom(name)}
    </span>
  );
}

export function AvatarStack({ items, size = 26, max = 4 }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p, i) => (
        // key única mesmo sem id: nomes repetidos partilham índice, por isso combinamos nome + índice
        <Avatar key={p.id != null ? p.id : p.name + '-' + i} name={p.name} photoURL={p.photoURL} color={p.color} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="avatar"
          role="img"
          aria-label={'+' + extra + ' pessoas'}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: 'var(--elevated)', color: 'var(--fg-muted)' }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
