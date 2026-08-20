/* ════════════════════════════════════════════════════════════════════════
   GroupsView — Grupos (despesas partilhadas), vista de lista.

   - Hero com o saldo global: soma de owedToMe/owedByMe (lib/split.js) de
     todos os grupos não arquivados.
   - Secção "Ativos": grupos com contas por acertar.
   - Secção "Acertados": grupos saldados (isSettled) ou arquivados, com
     opacidade reduzida.
   - Estado vazio quando não há nenhum grupo.
   - Botão "Novo grupo" abre a GroupSheet (store/ui.jsx).

   `openId` + os derivados abaixo (nameOf/colorOf/entriesOf) alimentam o ramo
   de detalhe (GroupDetail), mais abaixo neste mesmo ficheiro.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useStore, ME_ID } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { computeBalances, simplifyDebts, groupTotals, isSettled, groupCatMeta, shareText, toCents, fromCents } from '../lib/split.js';
import { getGroupsData } from '../lib/finance.js';
import { fm, fmDateShort } from '../lib/format.js';
import CategoryIcon from '../components/CategoryIcon.jsx';

// Os três separadores do detalhe do grupo.
const SEGMENTS = [
  { id: 'exp', label: 'Despesas' },
  { id: 'bal', label: 'Saldos' },
  { id: 'act', label: 'Atividade' },
];

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
// `btnRef` deixa GroupsView reganhar o foco neste cartão ao voltar do
// detalhe (ver useEffect de foco em GroupsView, mais abaixo).
function GroupCard({ group, totals, settled, onOpen, btnRef }) {
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
      ref={btnRef}
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
      <span className="rw">
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
      </span>
    </button>
  );
}

// Avatar circular com iniciais: cor da pessoa como fundo, nome como aria-label
// (role="img" para o leitor de ecrã anunciar o nome em vez de "Tu"/iniciais soltas).
function MemberAvatar({ id, nameOf, colorOf, size = 30 }) {
  return (
    <span
      role="img"
      aria-label={nameOf(id)}
      title={nameOf(id)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colorOf(id),
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initialsOf(nameOf(id), id)}
    </span>
  );
}

// Quanto é que esta despesa muda a minha posição: positivo = emprestei
// (paguei mais do que a minha parte), negativo = devo (a minha parte por pagar).
function myImpactCents(entry) {
  const myShare = (entry.shares || []).find((s) => s.personId === ME_ID)?.amount || 0;
  const paidCents = entry.payerId === ME_ID ? toCents(entry.amount) : 0;
  return paidCents - toCents(myShare);
}

// Linha de uma despesa (separador "Despesas"): categoria, descrição, quem pagou
// e o impacto para o utilizador — a haver (verde) ou a dever (vermelho).
function ExpenseRow({ entry, nameOf, onOpen, disabled }) {
  const impactCents = myImpactCents(entry);
  const shareCount = (entry.shares || []).length;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      className="cd"
      style={{ width: '100%', display: 'block', textAlign: 'left', marginBottom: 8, padding: '12px 16px', border: '1px solid var(--border)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
    >
      <span className="rw" style={{ gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <CategoryIcon id={groupCatMeta(entry.gcat).cat} size={36} />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{entry.desc}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {nameOf(entry.payerId)} pagou · {shareCount} {shareCount === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </span>
        </span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span className="m" style={{ fontSize: 13, fontWeight: 700, display: 'block' }}>{fm(entry.amount)}</span>
          {impactCents !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: impactCents > 0 ? 'var(--success)' : 'var(--signal)' }}>
              {impactCents > 0 ? 'emprestaste ' : 'deves '}{fm(fromCents(Math.abs(impactCents)))}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

// Linha de atividade: despesa (categoria + quem pagou) ou acerto ("X pagou a Y").
function ActivityRow({ entry, nameOf }) {
  const isSettlement = entry.kind === 'settlement';
  return (
    <div className="cd" style={{ marginBottom: 8, padding: '12px 16px' }}>
      <div className="rw" style={{ gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {!isSettlement && <CategoryIcon id={groupCatMeta(entry.gcat).cat} size={32} />}
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
              {isSettlement ? nameOf(entry.fromId) + ' pagou a ' + nameOf(entry.toId) + ' · acerto' : entry.desc}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {isSettlement ? fmDateShort(entry.date) : nameOf(entry.payerId) + ' pagou · ' + fmDateShort(entry.date)}
            </span>
          </span>
        </span>
        <span className="m" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{fm(entry.amount)}</span>
      </div>
    </div>
  );
}

// Barra de saldo por membro: cresce para a direita do centro quando positivo
// (tem a receber), para a esquerda quando negativo (deve). A cor nunca é o
// único sinal — o texto "Tens a receber"/"Deves"/"Acertado" acompanha sempre,
// e o nome vai por extenso ao lado do avatar (não só no aria-label): um
// membro com saldo exatamente zero não aparece em simplifyDebts, por isso
// esta linha é o único sítio garantido onde o nome fica visível para toda a
// gente, não só para quem usa leitor de ecrã ou passa o rato pelo avatar.
function BalanceBar({ id, balance, maxAbsCents, nameOf, colorOf }) {
  const cents = toCents(balance);
  const ratio = maxAbsCents > 0 ? Math.min(1, Math.abs(cents) / maxAbsCents) : 0;
  const widthPct = ratio * 50;
  const color = cents > 0 ? 'var(--success)' : cents < 0 ? 'var(--signal)' : 'var(--text3)';
  const label = cents > 0 ? 'Tens a receber ' + fm(balance) : cents < 0 ? 'Deves ' + fm(Math.abs(balance)) : 'Acertado';
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="rw" style={{ marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MemberAvatar id={id} nameOf={nameOf} colorOf={colorOf} size={26} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(id)}</span>
        </span>
        <span className="m" style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'var(--elevated)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
        {cents !== 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              [cents > 0 ? 'left' : 'right']: '50%',
              width: widthPct + '%',
              background: color,
              borderRadius: 4,
            }}
          />
        )}
      </div>
    </div>
  );
}

// Linha do plano de acertos (simplifyDebts): quem deve pagar a quem + botão.
function SettleRow({ debt, nameOf, onSettle, disabled }) {
  return (
    <div className="cd rw" style={{ marginBottom: 8, padding: '12px 16px' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(debt.from)} → {nameOf(debt.to)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="m" style={{ fontSize: 13, fontWeight: 700 }}>{fm(debt.amount)}</span>
        <button
          type="button"
          onClick={disabled ? undefined : onSettle}
          disabled={disabled}
          aria-label={'Acertar ' + nameOf(debt.from) + ' → ' + nameOf(debt.to)}
          style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: disabled ? 0.6 : 1 }}
        >
          Acertar
        </button>
      </span>
    </div>
  );
}

// Cabeçalho da LISTA de grupos (nunca aparece no detalhe): dá acesso à gestão
// de pessoas sem ser preciso estar a criar/editar um grupo primeiro. Até aqui
// só existia um `open('person')` dentro de GroupSheet ("+ Nova pessoa"),
// deixando "Gerir pessoas" inalcançável sem já se estar a criar/editar um
// grupo — este cabeçalho dá acesso a Pessoas diretamente a partir da lista.
// `headingRef` (tabIndex=-1, alvo programático — não entra no tab order) é o
// destino de foco de recurso quando se volta do detalhe e o cartão do grupo
// já não existe (ex.: apagado noutro sítio enquanto o detalhe estava aberto).
function GroupsHeader({ onManagePeople, headingRef }) {
  return (
    <div className="rw" style={{ margin: '6px 0 16px' }}>
      <span ref={headingRef} tabIndex={-1} style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Grupos</span>
      <button type="button" onClick={onManagePeople} className="icon-btn" aria-label="Gerir pessoas">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
    </div>
  );
}

// Ecrã de detalhe de um grupo: totais, separador Despesas/Saldos/Atividade e
// os dois atalhos fixos no fundo (Acertar / Despesa).
function GroupDetail({ group, entries, totals, balances, nameOf, colorOf, open, toast, onBack, isDemo }) {
  const [seg, setSeg] = useState('exp');
  const headingRef = useRef(null);

  // GroupsView troca TODA a subárvore ao entrar no detalhe (a lista
  // desmonta) — sem mover o foco explicitamente ele cai para <body>, o que
  // deixa quem navega por teclado/leitor de ecrã sem contexto de onde está.
  // tabIndex=-1 no título (abaixo) torna-o um alvo de foco programático válido
  // sem entrar no tab order normal.
  useEffect(() => {
    headingRef.current?.focus();
  }, [group.id]);

  const expenseEntries = useMemo(
    () => entries.filter((e) => e.kind !== 'settlement').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [entries]
  );
  const dayGroups = useMemo(() => {
    const out = [];
    expenseEntries.forEach((e) => {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.items.push(e);
      else out.push({ date: e.date, items: [e] });
    });
    return out;
  }, [expenseEntries]);
  const activity = useMemo(() => entries.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [entries]);
  const plan = useMemo(() => simplifyDebts(balances), [balances]);
  const maxAbsCents = useMemo(
    () => Math.max(1, ...(group.memberIds || []).map((id) => Math.abs(toCents(balances[id])))),
    [group.memberIds, balances]
  );

  async function handleShare() {
    const text = shareText({ group, entries, nameOf });
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: group.name, text });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast('Resumo copiado', 'success');
      }
    } catch {
      // utilizador cancelou a partilha (ou falhou a cópia) — sem toast de erro.
    }
  }

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <div className="rw" style={{ margin: '6px 0 16px' }}>
        <button type="button" onClick={onBack} className="icon-btn" aria-label="Voltar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span
          ref={headingRef}
          tabIndex={-1}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">{group.emoji || '👥'}</span>
          <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
        </span>
        <button
          type="button"
          onClick={isDemo ? undefined : () => open('group', group)}
          disabled={isDemo}
          className="icon-btn"
          aria-label={isDemo ? 'Editar grupo (indisponível para dados de exemplo)' : 'Editar grupo'}
          style={isDemo ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      </div>

      {isDemo && (
        <div className="cd" style={{ marginBottom: 16, padding: '12px 16px', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
          Dados de exemplo — inicia sessão para criares os teus próprios grupos.
        </div>
      )}

      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="lb">Total do grupo</div>
        <div className="m" style={{ fontSize: 26, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>{fm(totals.total)}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
          tu pagaste {fm(totals.paidByMe)} · a tua parte {fm(totals.myShare)}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {(group.memberIds || []).map((id) => (
            <MemberAvatar key={id} id={id} nameOf={nameOf} colorOf={colorOf} />
          ))}
        </div>
      </div>

      <div className="ms-bar" style={{ marginBottom: 16 }}>
        {SEGMENTS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={'ms' + (seg === s.id ? ' on' : '')}
            aria-pressed={seg === s.id}
            onClick={() => setSeg(s.id)}
            style={i < SEGMENTS.length - 1 ? { borderRight: '1px solid var(--border)' } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      {seg === 'exp' && (
        expenseEntries.length === 0 ? (
          <div className="empty">Sem despesas registadas.</div>
        ) : (
          dayGroups.map((g) => (
            <div key={g.date}>
              <div className="lb" style={{ margin: '4px 4px 8px' }}>{fmDateShort(g.date)}</div>
              {g.items.map((e) => (
                <ExpenseRow key={e.id} entry={e} nameOf={nameOf} onOpen={() => open('gexp', e)} disabled={isDemo} />
              ))}
            </div>
          ))
        )
      )}

      {seg === 'bal' && (
        <>
          <section aria-labelledby="grp-bal-heading">
            <div id="grp-bal-heading" className="lb" style={{ margin: '0 4px 8px' }}>Saldo de cada pessoa</div>
            <div className="cd" style={{ marginBottom: 16 }}>
              {(group.memberIds || []).map((id) => (
                <BalanceBar key={id} id={id} balance={balances[id] || 0} maxAbsCents={maxAbsCents} nameOf={nameOf} colorOf={colorOf} />
              ))}
            </div>
          </section>

          <div className="lb" style={{ margin: '0 4px 8px' }}>Para acertar</div>
          {plan.length === 0 ? (
            <div className="empty">✓ Contas acertadas.</div>
          ) : (
            plan.map((debt) => (
              <SettleRow
                key={debt.from + '→' + debt.to}
                debt={debt}
                nameOf={nameOf}
                onSettle={() => open('settle', { groupId: group.id, from: debt.from, to: debt.to, amount: debt.amount })}
                disabled={isDemo}
              />
            ))
          )}

          <button
            type="button"
            onClick={handleShare}
            style={{ width: '100%', marginTop: 12, padding: '12px 0', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Partilhar resumo
          </button>
        </>
      )}

      {seg === 'act' && (
        activity.length === 0 ? (
          <div className="empty">Sem atividade registada.</div>
        ) : (
          activity.map((e) => <ActivityRow key={e.id} entry={e} nameOf={nameOf} />)
        )
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={isDemo ? undefined : () => open('settle', { groupId: group.id })}
          disabled={isDemo}
          style={{
            flex: 1, padding: '12px 0', border: '1px solid var(--border)', background: 'var(--surface)',
            color: isDemo ? 'var(--text3)' : 'var(--text)', borderRadius: 999, fontSize: 14, fontWeight: 600,
            cursor: isDemo ? 'not-allowed' : 'pointer', opacity: isDemo ? 0.6 : 1,
          }}
        >
          Acertar
        </button>
        <button
          type="button"
          onClick={isDemo ? undefined : () => open('gexp', { groupId: group.id })}
          disabled={isDemo}
          style={{
            flex: 1, padding: '12px 0', border: 'none', background: isDemo ? 'var(--bg3)' : 'var(--primary)',
            color: isDemo ? 'var(--text3)' : 'var(--bg)', borderRadius: 999, fontSize: 14, fontWeight: 600,
            cursor: isDemo ? 'not-allowed' : 'pointer',
          }}
        >
          Despesa
        </button>
      </div>
    </div>
  );
}

export default function GroupsView() {
  const { state, preview } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const [openId, setOpenId] = useState(null);
  // Foco: refs dos cartões (por id de grupo) + do título da lista, para
  // devolver o foco a um sítio com sentido quando se volta do detalhe (ver
  // o useEffect a seguir a `openDerived`, mais abaixo).
  const cardRefs = useRef({});
  const listHeadingRef = useRef(null);
  const pendingFocusIdRef = useRef(null);

  // Em preview (sem login) e sem nada próprio ainda, mostra o grupo de
  // exemplo — só para ler: nunca é despachado para o store (ver finance.js
  // getGroupsData). O Resumo usa a mesma função, para as duas vistas nunca
  // divergirem uma da outra. Deps são as três slices que a função lê (não
  // `state` inteiro) + `preview`, para não recalcular a cada alteração
  // qualquer no store (ex.: editar uma despesa pessoal).
  const { people, groups, groupEntries: allEntries, isDemo } = useMemo(
    () => getGroupsData(state, preview),
    [state.people, state.groups, state.groupEntries, preview]
  );
  const nameOf = useMemo(() => nameOfFactory(people), [people]);
  const colorOf = useMemo(() => colorOfFactory(people), [people]);
  const entriesOf = useMemo(
    () => (groupId) => allEntries.filter((e) => e.groupId === groupId),
    [allEntries]
  );

  // Derivados por grupo (entradas, totais e saldo), calculados uma vez e
  // reaproveitados tanto pela lista como pelo detalhe (openId).
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

  // Detalhe: procura-se sempre em `derived` (nunca guarda-se o grupo à parte)
  // para que um grupo apagado noutro sítio deixe de resolver sozinho e caia
  // de volta na lista, em vez de renderizar um detalhe órfão.
  const openDerived = openId ? derived.find((d) => d.group.id === openId) : null;

  // Foco ao voltar à lista (Voltar, ou o grupo aberto ter desaparecido
  // entretanto): guarda sempre o id do grupo em exibição enquanto o detalhe
  // está aberto; quando `openDerived` cai a null, tenta focar o cartão desse
  // id de volta na lista — e cai para o título da lista se o cartão já não
  // existir (grupo apagado noutro sítio). O detalhe cuida do seu próprio
  // foco ao abrir (ver useEffect em GroupDetail).
  useEffect(() => {
    if (openDerived) {
      pendingFocusIdRef.current = openDerived.group.id;
      return;
    }
    const id = pendingFocusIdRef.current;
    pendingFocusIdRef.current = null;
    if (!id) return;
    (cardRefs.current[id] || listHeadingRef.current)?.focus();
  }, [openDerived]);

  if (openDerived) {
    return (
      <GroupDetail
        group={openDerived.group}
        entries={openDerived.entries}
        totals={openDerived.totals}
        balances={openDerived.balances}
        nameOf={nameOf}
        colorOf={colorOf}
        open={open}
        toast={toast}
        onBack={() => setOpenId(null)}
        isDemo={isDemo}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <GroupsHeader onManagePeople={() => open('person')} headingRef={listHeadingRef} />
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
      <GroupsHeader onManagePeople={() => open('person')} headingRef={listHeadingRef} />
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
            <GroupCard
              key={d.group.id}
              group={d.group}
              totals={d.totals}
              settled={false}
              onOpen={() => setOpenId(d.group.id)}
              btnRef={(el) => { cardRefs.current[d.group.id] = el; }}
            />
          ))}
        </>
      )}

      {settledGroups.length > 0 && (
        <>
          <div className="lb" style={{ margin: '20px 4px 8px' }}>
            Acertados
          </div>
          {settledGroups.map((d) => (
            <GroupCard
              key={d.group.id}
              group={d.group}
              totals={d.totals}
              settled
              onOpen={() => setOpenId(d.group.id)}
              btnRef={(el) => { cardRefs.current[d.group.id] = el; }}
            />
          ))}
        </>
      )}
    </div>
  );
}
