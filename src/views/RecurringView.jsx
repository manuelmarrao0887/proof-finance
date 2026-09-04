/* ════════════════════════════════════════════════════════════════════════
   Recurring (Subscrições / Despesas Recorrentes) view — React port of
   rRecurring (orig 1452-1485).

   - Empty state when no recurring entries.
   - Hero card: fixed monthly cost + yearly + count.
   - List sorted by amount DESC (explicit display sort — kept verbatim).
   - Each row: name, category name + day + days-until-next, amount, edit +
     delete. Edit/delete open the rec modal via useUI().open('rec', { id }).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fc, fm, mask } from '../lib/format.js';
import MerchantLogo, { BrandMark } from '../components/MerchantLogo.jsx';
import StatTiles from '../components/StatTiles.jsx';
import Icon from '../components/Icon.jsx';
import { resolveBrand } from '../lib/brands.jsx';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Marcas que quase toda a gente tem; aparecem como sugestão quando a lista é curta.
const SUGGESTIONS = [
  { id: 'netflix', name: 'Netflix', cat: 'sub' },
  { id: 'spotify', name: 'Spotify', cat: 'sub' },
  { id: 'edp', name: 'EDP', cat: 'cas' },
  { id: 'meo', name: 'MEO', cat: 'tel' },
  { id: 'vodafone', name: 'Vodafone', cat: 'tel' },
  { id: 'nos', name: 'NOS', cat: 'tel' },
];

function Suggestions({ recurring, open }) {
  const have = new Set(recurring.map((r) => resolveBrand(r.name)).filter(Boolean));
  const list = SUGGESTIONS.filter((s) => !have.has(s.id));
  if (recurring.length >= 3 || list.length === 0) return null;
  return (
    <div className="cd" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div className="lb" style={{ marginBottom: 4 }}>Costumas ter?</div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Toca para adicionar com o nome e a categoria já preenchidos.</div>
      <div className="sugg">
        {list.map((s) => (
          <button key={s.id} type="button" aria-label={'Adicionar ' + s.name} onClick={() => open('rec', { prefill: { name: s.name, cat: s.cat } })}>
            <BrandMark id={s.id} size={20} radius={6} title={s.name} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RecurringView() {
  const { state, actions } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const recurring = state.recurring || [];
  const bdg = state.bdg || [];
  const hidden = !!state.balancesHidden;

  if (recurring.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div className="empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Sem despesas recorrentes
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Regista subscrições (Netflix, ginásio,
            <br />
            seguros, telecom...) para teres uma
            <br />
            visão clara do gasto mensal fixo.
          </div>
        </div>
        <Suggestions recurring={recurring} open={open} />
      </div>
    );
  }

  // Explicit display sort: amount descending (kept from the original).
  const sorted = recurring.slice().sort((a, b) => b.amount - a.amount);
  const now = new Date();
  /* Recorrentes já lançadas como despesa neste mês (carregam recId) — para
     mostrar o que já está pago e não parecer que falta pagar tudo. */
  const thisYm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const paidThisMonth = new Set(
    (state.addedExp || [])
      .filter((x) => x.recId && (x.date || '').slice(0, 7) === thisYm)
      .map((x) => x.recId)
  );
  const total = sorted.reduce((s, r) => s + r.amount, 0);
  const pendingTotal = sorted.reduce((s, r) => (paidThisMonth.has(r.id) ? s : s + r.amount), 0);
  const yearly = total * 12;

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      <div style={{ marginBottom: 12 }}>
        <StatTiles
          items={[
            { key: 'mes', value: mask(total, hidden, fc), label: 'por mês' },
            { key: 'ano', value: mask(yearly, hidden, fc), label: 'por ano' },
            { key: 'pend', value: mask(pendingTotal, hidden, fc), label: 'por pagar', color: pendingTotal > 0 ? 'var(--warning)' : 'var(--success)' },
          ]}
        />
      </div>
      <Suggestions recurring={recurring} open={open} />

      {sorted.map((r) => {
        let bI = null;
        bdg.forEach((b) => {
          if (b.id === r.cat) bI = b;
        });
        const nextDay = parseInt(r.day) || 1;
        // Dia 29-31 não existe em todos os meses: encosta ao último dia do mês
        // (uma cobrança marcada para 31 sai a 30 em abril, não a 1 de maio).
        const atMonth = (y, m) => new Date(y, m, Math.min(nextDay, new Date(y, m + 1, 0).getDate()));
        let next = atMonth(now.getFullYear(), now.getMonth());
        if (next < now) next = atMonth(now.getFullYear(), now.getMonth() + 1);
        const dleft = Math.ceil((next - now) / 86400000);

        return (
          <div key={r.id} className="cd fadeUp" style={{ marginBottom: 10, padding: '14px 18px' }}>
            <div className="rw" style={{ gap: 12 }}>
              <MerchantLogo text={r.name} cat={r.cat} size={40} bdg={bdg} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.name}
                  {paidThisMonth.has(r.id) && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)', background: 'var(--success-soft, rgba(63,201,122,0.12))', padding: '1px 6px', borderRadius: 999 }}>
                      PAGA
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>{bI ? bI.nm : '—'}</span>
                  <span aria-hidden="true">·</span>
                  <Icon name="calendar" size={11} />
                  <span>{next.getDate() + ' ' + MONTHS_SHORT[next.getMonth()]}</span>
                  {!paidThisMonth.has(r.id) && dleft <= 3 && <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{dleft === 0 ? 'hoje' : dleft === 1 ? 'amanhã' : 'em ' + dleft + ' dias'}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="m" style={{ fontSize: 15, fontWeight: 600 }}>{mask(r.amount, hidden, fm)}</div>
                <button
                  type="button"
                  onClick={() => open('rec', { id: r.id })}
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  aria-label="Editar recorrência"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    actions.deleteRecurring(r.id);
                    toast('Recorrente eliminada', 'success');
                  }}
                  className="icon-btn"
                  style={{ width: 30, height: 30, color: 'var(--signal)' }}
                  aria-label="Eliminar recorrência"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
