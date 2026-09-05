/* ════════════════════════════════════════════════════════════════════════
   GroupExpenseSheet — criar/editar uma despesa de um grupo: quem pagou, como
   se divide (igual, valores exatos ou percentagens) e se se reflete nas
   Despesas pessoais.

   Sheet no padrão de src/modals/AddExpenseSheet.jsx (layout de campos, erros
   inline por campo, o toggle partilhado) e de src/modals/GroupSheet.jsx
   (convenções já estabelecidas nesta feature: nameOf/colorOf locais — não
   exportados de GroupsView.jsx, replicados aqui como em PersonSheet.jsx —,
   ConfirmButton — dois toques — antes de apagar, Task 8). useModal('gexp'):
     - payload `{ groupId }`        -> despesa nova nesse grupo;
     - payload = a entry (tem `.id`) -> edição; o id é sempre relido de
       state.groupEntries (nunca confiado ao payload em si), pela mesma razão
       de AddExpenseSheet: a lista pode ter reordenado entretanto.

   A matemática da divisão vive TODA em src/lib/split.js — resolveShares() é
   a ÚNICA fonte das partes de cada pessoa. A pré-visualização por pessoa e o
   payload gravado usam sempre o resultado dele, nunca um cálculo paralelo.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore, ME_ID } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, todayISO } from '../lib/format.js';
import { resolveShares, GROUP_CATS, groupCatMeta, toCents, fromCents } from '../lib/split.js';
import CategoryIcon from '../components/CategoryIcon.jsx';
import Avatar from '../components/Avatar.jsx';
import { PrimaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';

const MODES = [
  { id: 'equal', label: 'Igual' },
  { id: 'exact', label: 'Valores' },
  { id: 'percent', label: '%' },
];

// pt-PT com 2 casas decimais, SEM o símbolo "€" — é o formato que a
// pré-visualização por pessoa usa (fm(), em lib/format.js, tem sempre o
// símbolo a seguir ao número).
function fmNum(v) {
  return Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aceita vírgula como separador decimal (app pt-PT), tal como AddExpenseSheet.
function parseNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Mesmas fórmulas de GroupsView.jsx (não exportadas de lá — replicadas aqui).
// 'me' é sempre "Tu".
function nameOfFactory(people) {
  return (id) => (id === ME_ID ? 'Tu' : (people.find((p) => p.id === id) || {}).name || '—');
}
function colorOfFactory(people) {
  return (id) => (id === ME_ID ? 'var(--primary)' : (people.find((p) => p.id === id) || {}).color || 'var(--fg-subtle)');
}

/* Avatar decorativo (o nome está escrito ao lado) sobre o componente
   partilhado, para as iniciais serem as mesmas em toda a app. O próprio
   utilizador continua a mostrar "Tu" por override explícito. */
function MemberAvatar({ name, color, id, size = 26 }) {
  return <Avatar name={name} color={color} size={size} initials={id === ME_ID ? 'Tu' : undefined} decorative />;
}

// Draft em branco para uma despesa nova: todos os membros do grupo
// participam por omissão, categoria "Outro", reflete-se se o grupo reflete
// por omissão (orig: `reflect = group.reflectMine`).
function freshDraft(group) {
  const ids = (group && group.memberIds) || [ME_ID];
  const parts = {};
  ids.forEach((id) => {
    parts[id] = { on: true, amount: '', percent: '' };
  });
  return {
    desc: '',
    amount: '',
    payerId: ME_ID,
    date: todayISO(),
    mode: 'equal',
    parts,
    gcat: 'other',
    notes: '',
    reflect: group ? group.reflectMine !== false : true,
  };
}

// Reconstrói o draft a partir de uma entry gravada (edição): quem participa
// vem de quem tem uma share; os campos de "Valores"/"%" são pré-preenchidos
// a partir dessa share em euros (a percentagem é derivada dela — a entry só
// guarda o valor final em euros, nunca a percentagem em si).
function draftFromEntry(entry, group) {
  const ids = (group && group.memberIds) || (entry.shares || []).map((s) => s.personId);
  const shareOf = Object.fromEntries((entry.shares || []).map((s) => [s.personId, s.amount]));
  const total = Number(entry.amount) || 0;
  const parts = {};
  ids.forEach((id) => {
    const on = id in shareOf;
    const amt = on ? Number(shareOf[id]) || 0 : 0;
    parts[id] = {
      on,
      amount: on ? String(amt).replace('.', ',') : '',
      percent: on && total > 0 ? String(Math.round((amt / total) * 10000) / 100).replace('.', ',') : '',
    };
  });
  return {
    desc: entry.desc || '',
    amount: String(entry.amount || '').replace('.', ','),
    payerId: entry.payerId || ME_ID,
    date: entry.date || todayISO(),
    mode: entry.splitMode || 'equal',
    parts,
    gcat: entry.gcat || 'other',
    notes: entry.notes || '',
    reflect: entry.reflect !== false,
  };
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 8,
  fontSize: 'var(--fs-input)',
  boxSizing: 'border-box',
};
const monoBig = { ...inputStyle, fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600 };
const monoSmall = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-input)',
  fontWeight: 600,
  textAlign: 'right',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 8,
  boxSizing: 'border-box',
};
// Erro inline por campo (orig só tinha toast; AddExpenseSheet acrescentou isto).
const errText = (msg) =>
  msg ? <div style={{ color: 'var(--signal)', fontSize: 11, marginTop: 4 }}>{msg}</div> : null;

export default function GroupExpenseSheet() {
  const { isOpen, payload, close } = useModal('gexp');
  const { state, actions } = useStore();
  const toast = useToast();

  // Stable id, não o payload em si — assim edita-se sempre o registo certo
  // mesmo que a lista tenha reordenado desde que a sheet abriu (AddExpenseSheet).
  const editId = payload && typeof payload === 'object' && payload.id != null ? payload.id : null;
  const editEntry = editId != null ? (state.groupEntries || []).find((e) => e.id === editId) : null;
  const isEdit = !!editEntry;
  const groupId = editEntry
    ? editEntry.groupId
    : payload && typeof payload === 'object'
    ? payload.groupId
    : null;
  const group = (state.groups || []).find((g) => g.id === groupId) || null;
  const people = state.people || [];
  const nameOf = useMemo(() => nameOfFactory(people), [people]);
  const colorOf = useMemo(() => colorOfFactory(people), [people]);
  const memberIds = (group && group.memberIds) || [];

  const [draft, setDraft] = useState(() => freshDraft(null));
  const [errors, setErrors] = useState({});

  // (Re)seed o draft sempre que a sheet abre (edição -> entry; criação -> vazio).
  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setDraft(isEdit ? draftFromEntry(editEntry, group) : freshDraft(group));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId, group]);

  const activeIds = useMemo(
    () => memberIds.filter((id) => draft.parts[id] && draft.parts[id].on),
    [memberIds, draft.parts]
  );
  const shareEntries = useMemo(
    () =>
      activeIds.map((id) => ({
        personId: id,
        amount: parseNum(draft.parts[id] && draft.parts[id].amount),
        percent: parseNum(draft.parts[id] && draft.parts[id].percent),
      })),
    [activeIds, draft.parts]
  );
  // Fonte única da divisão: a pré-visualização por pessoa lê sempre daqui,
  // nunca recalcula em paralelo (não pode divergir do que se vai gravar).
  const resolved = useMemo(
    () => resolveShares(draft.mode, parseNum(draft.amount), shareEntries, draft.payerId),
    [draft.mode, draft.amount, shareEntries, draft.payerId]
  );

  if (!isOpen || !group) return null;

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const setPart = (id, patch) => {
    setDraft((d) => ({ ...d, parts: { ...d.parts, [id]: { ...d.parts[id], ...patch } } }));
    setErrors((e) => (e.parts ? { ...e, parts: undefined } : e));
  };
  const toggleParticipant = (id) => setPart(id, { on: !(draft.parts[id] && draft.parts[id].on) });
  // Trocar de modo invalida qualquer erro de divisão anterior (ex: "Faltam X
  // para chegar ao total." do modo Valores não faz sentido depois de voltar
  // para Igual) — limpa-se junto com a mudança, não só no próximo "Guardar".
  const setMode = (m) => {
    set('mode', m);
    setErrors((e) => (e.parts ? { ...e, parts: undefined } : e));
  };

  const myShare = resolved.shares ? (resolved.shares.find((s) => s.personId === ME_ID) || {}).amount || 0 : 0;
  const catId = groupCatMeta(draft.gcat).cat;
  const catName = ((state.bdg || []).find((b) => b.id === catId) || {}).nm || catId;

  function submit() {
    const desc = (draft.desc || '').trim();
    if (!desc) {
      setErrors({ desc: 'Preenche a descrição.' });
      return;
    }
    // Arredondado ao cêntimo ANTES de gravar: parseNum('10,005') dava
    // 10.005, e fm() mostrava "10,01 €" enquanto as partes (sempre em
    // cêntimos inteiros, ver resolveShares) somavam 10,00 € — um cêntimo
    // fantasma na pré-visualização que nunca batia certo com o total.
    const amount = fromCents(toCents(parseNum(draft.amount)));
    if (amount <= 0) {
      setErrors({ amount: 'O valor tem de ser maior que zero.' });
      return;
    }
    if (activeIds.length === 0) {
      setErrors({ parts: 'Escolhe pelo menos uma pessoa.' });
      return;
    }
    // `resolved` já é o resultado de resolveShares para este exato amount/modo/
    // participantes (useMemo acima) — reaproveita-se em vez de chamar outra vez.
    const { shares, error } = resolved;
    if (error) {
      setErrors({ parts: error });
      return;
    }
    setErrors({});
    const notes = (draft.notes || '').trim();
    const entry = {
      groupId: group.id,
      kind: 'expense',
      desc,
      amount,
      date: draft.date,
      payerId: draft.payerId,
      splitMode: draft.mode,
      shares,
      gcat: draft.gcat,
      notes,
      reflect: draft.reflect,
    };
    if (isEdit) {
      actions.updateGroupEntry(editEntry.id, entry);
      toast('Despesa atualizada', 'success');
    } else {
      actions.addGroupEntry(entry);
      toast('Despesa adicionada', 'success');
    }
    close();
  }

  function remove() {
    if (!isEdit) return;
    const snap = snapshotSlices(actions.getState(), ['groupEntries', 'addedExp']);
    actions.deleteGroupEntry(editEntry.id);
    close();
    toast('Despesa eliminada', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
  }

  const footer = (
    <>
      <PrimaryButton onClick={submit}>{isEdit ? 'Guardar alterações' : 'Guardar'}</PrimaryButton>
      {isEdit && (
        <ConfirmButton label="Apagar despesa" confirmLabel="Confirmar" onConfirm={remove} style={{ marginTop: 8 }} />
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar despesa' : 'Nova despesa'} footer={footer}>
      {/* Categoria — grelha curta (GROUP_CATS), ícone do orçamento mapeado */}
      <div className="lb" style={{ marginBottom: 8 }}>
        Categoria
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
        {GROUP_CATS.map((c) => {
          const on = draft.gcat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => set('gcat', c.id)}
              aria-pressed={on}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '10px 4px',
                borderRadius: 14,
                border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'),
                background: on ? 'var(--blue-soft)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <CategoryIcon id={c.cat} size={32} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: on ? 'var(--primary)' : 'var(--text2)',
                  textAlign: 'center',
                  lineHeight: 1.15,
                }}
              >
                {c.nm}
              </span>
            </button>
          );
        })}
      </div>

      {/* Descrição */}
      <div className="lb" style={{ marginBottom: 6 }}>
        Descrição
      </div>
      <input
        value={draft.desc}
        onChange={(e) => set('desc', e.target.value)}
        placeholder="Ex: Jantar"
        aria-label="Descrição"
        style={{ ...inputStyle, fontSize: 'var(--fs-input)', marginBottom: errors.desc ? 0 : 14 }}
      />
      {errText(errors.desc)}
      {errors.desc && <div style={{ height: 14 }} />}

      {/* Valor + Data */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>
            Valor (€)
          </div>
          <input
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            aria-label="Valor"
            style={monoBig}
          />
          {errText(errors.amount)}
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>
            Data
          </div>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => set('date', e.target.value)}
            aria-label="Data"
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 'var(--fs-input)' }}
          />
        </div>
      </div>

      {/* Quem pagou */}
      <div className="lb" style={{ marginBottom: 8 }}>
        Quem pagou
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {memberIds.map((id) => {
          const on = draft.payerId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => set('payerId', id)}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid ' + (on ? colorOf(id) : 'var(--border)'),
                background: on ? colorOf(id) : 'transparent',
                color: on ? '#fff' : 'var(--text)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {nameOf(id)}
            </button>
          );
        })}
      </div>

      {/* Como dividir */}
      <div className="lb" style={{ marginBottom: 8 }}>
        Como dividir
      </div>
      <div className="ms-bar">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'ms' + (draft.mode === m.id ? ' on' : '')}
            aria-pressed={draft.mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Participantes: toggle (aria-label contratual) + pré-visualização
          (modo igual, lida do resolveShares) ou input (valores/percentagem) */}
      <div className="lb" style={{ margin: '4px 0 8px' }}>
        Participantes
      </div>
      <div className="cd" style={{ padding: 0, marginBottom: 16 }}>
        {memberIds.map((id, i) => {
          const p = draft.parts[id] || { on: false, amount: '', percent: '' };
          const share = resolved.shares ? resolved.shares.find((s) => s.personId === id) : null;
          return (
            <div
              key={id}
              className="rw"
              style={{
                padding: '10px 14px',
                gap: 10,
                borderBottom: i < memberIds.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <button
                type="button"
                onClick={() => toggleParticipant(id)}
                aria-pressed={p.on}
                aria-label={'Participação de ' + nameOf(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                }}
              >
                {/* Estado nunca só pela cor: círculo vazio vs. preenchido + visto */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: '2px solid ' + (p.on ? 'var(--primary)' : 'var(--border)'),
                    background: p.on ? 'var(--primary)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.on && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <MemberAvatar name={nameOf(id)} color={colorOf(id)} id={id} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: p.on ? 1 : 0.5,
                  }}
                >
                  {nameOf(id)}
                </span>
              </button>
              {p.on && draft.mode === 'equal' && (
                <span className="m" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {share ? fmNum(share.amount) : '—'}
                </span>
              )}
              {p.on && draft.mode === 'exact' && (
                <input
                  value={p.amount}
                  onChange={(e) => setPart(id, { amount: e.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={'Valor de ' + nameOf(id)}
                  style={{ ...monoSmall, width: 84 }}
                />
              )}
              {p.on && draft.mode === 'percent' && (
                <input
                  value={p.percent}
                  onChange={(e) => setPart(id, { percent: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={'Percentagem de ' + nameOf(id)}
                  style={{ ...monoSmall, width: 64 }}
                />
              )}
            </div>
          );
        })}
      </div>
      {errText(errors.parts)}
      {errors.parts && <div style={{ height: 10 }} />}

      {/* Nota */}
      <div className="lb" style={{ marginBottom: 6 }}>
        Nota (opcional)
      </div>
      <textarea
        value={draft.notes || ''}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="Detalhes ou contexto"
        aria-label="Nota (opcional)"
        rows={2}
        style={{ ...inputStyle, fontSize: 'var(--fs-input)', marginBottom: 14, resize: 'vertical', fontFamily: 'var(--font)' }}
      />

      {/* Refletir a minha parte nas Despesas */}
      <div className="rw" style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 'var(--r2)', marginBottom: 4 }}>
        <div style={{ minWidth: 0, marginRight: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Refletir a minha parte nas Despesas</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
            Cria &quot;{draft.desc.trim() || 'despesa'} · {fm(myShare)}&quot; em {catName}
          </div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={draft.reflect}
            aria-label="Refletir a minha parte nas Despesas"
            onChange={(e) => set('reflect', e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              cursor: 'pointer',
              inset: 0,
              background: draft.reflect ? 'var(--blue)' : 'var(--border)',
              borderRadius: 26,
              transition: '0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                height: 20,
                width: 20,
                left: draft.reflect ? 21 : 3,
                bottom: 3,
                background: '#fff',
                borderRadius: '50%',
                transition: '0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </span>
        </label>
      </div>
      {/* Ressalva (v2 fica de fora): importar o extrato do banco lança o valor
          TOTAL da despesa (620 €) enquanto este reflexo lança só a MINHA parte
          (155 €) — como dedupeAddedExp compara desc|cêntimos|data, as duas
          linhas nunca colidem e o mês fica inflacionado pelo valor total pago,
          exatamente o que esta funcionalidade existe para evitar. Marcar o
          movimento importado como "despesa de grupo" fica para uma versão
          futura — por agora avisa-se aqui, onde a pessoa decide. */}
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 4 }}>
        Se também importares o extrato do banco, o valor total que pagaste entra nas Despesas — apaga essa linha para não contar a despesa duas vezes.
      </div>
    </Sheet>
  );
}
