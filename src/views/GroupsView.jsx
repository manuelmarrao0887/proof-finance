/* ════════════════════════════════════════════════════════════════════════
   GroupsView — Grupos (despesas partilhadas), vista de lista.

   - Hero com o saldo global: soma de owedToMe/owedByMe (lib/split.js) de
     todos os grupos não arquivados.
   - Secção "Ativos": grupos com contas por acertar.
   - Secção "Acertados": grupos saldados (isSettled) ou arquivados, com
     opacidade reduzida.
   - Estado vazio quando não há nenhum grupo.
   - Botão "Novo grupo" abre a sheet (Task 7); por agora só regista o modal
     em store/ui.jsx — abrir sem componente registado não rebenta (Shell.jsx
     só monta o componente do modal se `MODAL_COMPONENTS[key]` existir).

   `openId` + os derivados abaixo (nameOf/colorOf/entriesOf) ficam prontos
   para a Task 6, que acrescenta o ramo de detalhe a este mesmo ficheiro.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { ME_ID } from '../store/store.jsx';
import { computeBalances, simplifyDebts, groupTotals, isSettled, groupCatMeta, shareText } from '../lib/split.js';
import { fm, fmDateShort } from '../lib/format.js';

// Nome a mostrar para um id de pessoa ('me' é sempre "Tu").
function nameOfFactory(people) {
  return (id) => (id === ME_ID ? 'Tu' : (people.find((p) => p.id === id) || {}).name || '—');
}
// Cor do avatar (o próprio utilizador usa a cor da marca).
function colorOfFactory(people) {
  return (id) => (id === ME_ID ? 'var(--primary)' : (people.find((p) => p.id === id) || {}).color || 'var(--fg-subtle)');
}
// Iniciais para o avatar: "Tu" para o próprio, 2 letras para os outros.
function initialsOf(name, id) {
  if (id === ME_ID) return 'Tu';
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

// Cartão de um grupo na lista: emoji, nome, resumo e saldo (ou "acertado").
function GroupCard({ group, totals, settled, onOpen }) {
  const memberCount = (group.memberIds || []).length;
  const hasRange = !!(group.start && group.end);
  const saldoColor = totals.owedToMe > 0 ? 'var(--success)' : totals.owedByMe > 0 ? 'var(--signal)' : 'var(--text3)';
  const saldoLabel =
    totals.owedToMe > 0
      ? 'Devem-te ' + fm(totals.owedToMe)
      : totals.owedByMe > 0
      ? 'Deves ' + fm(totals.owedByMe)
      : 'Sem saldo';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="cd"
      style={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        marginBottom: 8,
        padding: '14px 16px',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        opacity: settled ? 0.6 : 1,
      }}
    >
      <div className="rw">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
            {group.emoji || '👥'}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{group.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {memberCount} pessoas · {fm(totals.total)}
              {hasRange ? ' · ' + fmDateShort(group.start) + ' – ' + fmDateShort(group.end) : ''}
            </span>
          </span>
        </span>
        {settled ? (
          <span className="chip up-solid" style={{ whiteSpace: 'nowrap' }}>
            ✓ acertado
          </span>
        ) : (
          <span className="m" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: saldoColor }}>
            {saldoLabel}
          </span>
        )}
      </div>
    </button>
  );
}

export default function GroupsView() {
  const { state } = useStore();
  const { open } = useUI();
  const [openId, setOpenId] = useState(null);

  const people = state.people || [];
  const groups = state.groups || [];
  const allEntries = state.groupEntries || [];
  const nameOf = useMemo(() => nameOfFactory(people), [people]);
  const colorOf = useMemo(() => colorOfFactory(people), [people]);
  const entriesOf = useMemo(
    () => (groupId) => allEntries.filter((e) => e.groupId === groupId),
    [allEntries]
  );

  // Derivados por grupo (entradas, totais e saldo), calculados uma vez para
  // toda a lista — a Task 6 vai reaproveitar o mesmo objeto para o detalhe.
  const derived = useMemo(
    () =>
      groups.map((g) => {
        const entries = entriesOf(g.id);
        const totals = groupTotals(entries, ME_ID);
        const balances = computeBalances(entries, g.memberIds);
        return { group: g, entries, totals, balances, settled: isSettled(balances) };
      }),
    [groups, entriesOf]
  );

  if (groups.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div className="empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Ainda não tens grupos
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
            Cria um grupo para dividir despesas de viagens,
            <br />
            casa partilhada ou saídas com amigos.
          </div>
          <button
            type="button"
            onClick={() => open('group')}
            style={{ padding: '10px 18px', border: 'none', background: 'var(--primary)', color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Novo grupo
          </button>
        </div>
      </div>
    );
  }

  const activeGroups = derived.filter((d) => !d.group.archived && !d.settled);
  const settledGroups = derived.filter((d) => d.group.archived || d.settled);

  // Saldo global: soma dos totais de todos os grupos não arquivados.
  let owedToMe = 0;
  let owedByMe = 0;
  derived.forEach((d) => {
    if (d.group.archived) return;
    owedToMe += d.totals.owedToMe;
    owedByMe += d.totals.owedByMe;
  });
  const net = owedToMe - owedByMe;
  const netLabel = net > 0 ? 'Tens a receber' : net < 0 ? 'Tens a pagar' : 'Contas equilibradas';

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <div className="hero fadeUp" style={{ margin: '6px 0 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>
          Saldo global dos grupos
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 6 }}>
          {fm(net)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>{netLabel}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span className="chip up">A receber {fm(owedToMe)}</span>
          <span className="chip down">A pagar {fm(owedByMe)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => open('group')}
        style={{ width: '100%', marginBottom: 16, padding: '12px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        + Novo grupo
      </button>

      {activeGroups.length > 0 && (
        <>
          <div className="lb" style={{ margin: '0 4px 8px' }}>
            Ativos
          </div>
          {activeGroups.map((d) => (
            <GroupCard key={d.group.id} group={d.group} totals={d.totals} settled={false} onOpen={() => setOpenId(d.group.id)} />
          ))}
        </>
      )}

      {settledGroups.length > 0 && (
        <>
          <div className="lb" style={{ margin: '20px 4px 8px' }}>
            Acertados
          </div>
          {settledGroups.map((d) => (
            <GroupCard key={d.group.id} group={d.group} totals={d.totals} settled onOpen={() => setOpenId(d.group.id)} />
          ))}
        </>
      )}
    </div>
  );
}
