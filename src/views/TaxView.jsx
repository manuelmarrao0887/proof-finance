/* ════════════════════════════════════════════════════════════════════════
   TaxView — Fiscal (Portugal): calendário de obrigações + estimativa das
   deduções à coleta do IRS a partir das despesas registadas. Configuração
   inline (IMI, IUC, tributação conjunta) guardada em state.taxCfg.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, mask, maskText } from '../lib/format.js';
import { taxCalendarPT, upcomingTaxEvents, MONTH_NAMES_PT } from '../lib/taxpt.js';
import { estimateDeductions } from '../lib/irs.js';
import { monthsWithData } from '../lib/months.js';

const KIND_COLOR = {
  efatura: 'var(--primary)',
  irs: 'var(--purple, #7b5fe0)',
  imi: 'var(--warning)',
  iuc: 'var(--success)',
};
const KIND_LABEL = { efatura: 'e-Fatura', irs: 'IRS', imi: 'IMI', iuc: 'IUC' };

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return m[3] + '/' + m[2];
}

export default function TaxView() {
  const { state, actions } = useStore();
  const toast = useToast();
  const cfg = state.taxCfg || {};
  const hidden = !!state.balancesHidden;
  const [editing, setEditing] = useState(false);
  const [imi, setImi] = useState(cfg.imiAmount != null ? String(cfg.imiAmount).replace('.', ',') : '');
  const [iuc, setIuc] = useState(Array.isArray(cfg.iucMonths) ? cfg.iucMonths.join(', ') : '');
  const [couple, setCouple] = useState(!!cfg.couple);

  const addedExp = state.addedExp || [];
  const years = useMemo(() => {
    const ys = new Set([String(new Date().getFullYear())]);
    monthsWithData(addedExp, undefined, 60).forEach((k) => ys.add(k.slice(0, 4)));
    return Array.from(ys).sort().reverse();
  }, [addedExp]);
  const [year, setYear] = useState(years[0]);

  const upcoming = useMemo(() => upcomingTaxEvents(cfg, undefined, 120), [cfg]);
  const calendar = useMemo(() => taxCalendarPT(Number(year), cfg), [year, cfg]);
  const ded = useMemo(() => estimateDeductions(addedExp, year, { couple: !!cfg.couple }), [addedExp, year, cfg]);

  const save = () => {
    const imiNum = parseFloat(String(imi).replace(',', '.')) || 0;
    const months = String(iuc)
      .split(/[,;\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => n >= 1 && n <= 12);
    actions.setTaxCfg({ imiAmount: imiNum, iucMonths: months, couple, irs: true });
    setEditing(false);
    toast('Configuração fiscal guardada', 'success');
  };

  const input = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 10, fontSize: 'var(--fs-input)', boxSizing: 'border-box' };

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {/* ── Próximas obrigações ── */}
      <div className="lb" style={{ marginBottom: 8 }}>Próximas obrigações</div>
      {upcoming.length === 0 ? (
        <div className="cd" style={{ padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text3)' }}>
          Nada nos próximos 4 meses.
        </div>
      ) : (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcoming.slice(0, 5).map((e) => (
            <div key={e.id} className="cd" style={{ padding: '12px 14px', borderLeft: '3px solid ' + (KIND_COLOR[e.kind] || 'var(--border)') }}>
              <div className="rw" style={{ marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{e.title}</span>
                <span className="m" style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {fmtDate(e.date)} · {e.daysLeft === 0 ? 'hoje' : e.daysLeft === 1 ? 'amanhã' : e.daysLeft + ' dias'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 }}>{maskText(e.detail, hidden)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Ano + deduções ── */}
      <div className="rw" style={{ marginBottom: 8 }}>
        <div className="lb">Deduções estimadas</div>
        {years.length > 1 && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Ano fiscal"
            style={{ padding: '4px 10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', borderRadius: 8, fontSize: 'var(--fs-input)', fontFamily: 'var(--mono)' }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      <div className="cd" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
          <span className="m" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--success)' }}>
            {mask(ded.total, hidden, fm)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>a deduzir (estimativa)</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.45 }}>
          Com base nas despesas de {year} registadas nesta app. Só contam faturas comunicadas à AT com o teu NIF — os valores oficiais são os do e-Fatura.
        </div>

        {ded.regimes.filter((r) => r.spent > 0).map((r) => {
          const pct = r.cap > 0 ? Math.min(100, (r.deduction / r.cap) * 100) : 0;
          return (
            <div key={r.key} style={{ marginBottom: 12 }}>
              <div className="rw" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {r.label}
                  {r.capped && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', marginLeft: 6 }}>NO LIMITE</span>}
                </span>
                <span className="m" style={{ fontSize: 12, fontWeight: 700 }}>{mask(r.deduction, hidden, fm)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: r.capped ? 'var(--warning)' : 'var(--success)' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                Gasto {mask(r.spent, hidden, fm)} · teto {mask(r.cap, hidden, fm)}
              </div>
            </div>
          );
        })}
        {ded.regimes.every((r) => r.spent === 0) && (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sem despesas registadas em {year}.</div>
        )}
      </div>

      {/* ── Calendário completo do ano ── */}
      <div className="lb" style={{ marginBottom: 8 }}>Calendário {year}</div>
      <div className="cd" style={{ padding: '6px 14px', marginBottom: 16 }}>
        {calendar.map((e) => (
          <div key={e.id} className="rw" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: KIND_COLOR[e.kind], background: 'var(--elevated)', padding: '2px 6px', borderRadius: 999, flexShrink: 0 }}>
                {KIND_LABEL[e.kind]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
            </div>
            <span className="m" style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</span>
          </div>
        ))}
      </div>

      {/* ── Configuração ── */}
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{ width: '100%', padding: '12px 0', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Configurar IMI / IUC
        </button>
      ) : (
        <div className="cd" style={{ padding: 16 }}>
          <div className="lb" style={{ marginBottom: 8 }}>IMI anual (€)</div>
          <input value={imi} onChange={(e) => setImi(e.target.value)} placeholder="Ex: 240" inputMode="decimal" style={{ ...input, marginBottom: 12 }} />
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: -8, marginBottom: 12 }}>
            Até 100 € paga-se de uma vez (maio); 100–500 € em 2 prestações (maio e novembro); acima de 500 € em 3 (maio, agosto e novembro).
          </div>

          <div className="lb" style={{ marginBottom: 8 }}>IUC — mês da matrícula</div>
          <input value={iuc} onChange={(e) => setIuc(e.target.value)} placeholder="Ex: 3 (ou 3, 9 para dois veículos)" inputMode="numeric" style={{ ...input, marginBottom: 4 }} />
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 14 }}>
            Número do mês (1 = {MONTH_NAMES_PT[0]}, 12 = {MONTH_NAMES_PT[11]}). Separa por vírgulas se tiveres mais do que um veículo.
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={couple} onChange={(e) => setCouple(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Tributação conjunta (duplica o teto das despesas gerais)</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={save} style={{ flex: 1, padding: '12px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 16, lineHeight: 1.5 }}>
        Estimativa indicativa, não é aconselhamento fiscal. Confirma sempre no Portal das Finanças.
      </div>
    </div>
  );
}
