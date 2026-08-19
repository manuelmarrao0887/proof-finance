/* ════════════════════════════════════════════════════════════════════════
   HousingModal — editar o crédito à habitação atual. useModal('housing').
   Guarda em state.housing via actions.setHousing.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { PrimaryButton, SecondaryButton } from '../components/Buttons.jsx';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;
const str = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

function fromHousing(h) {
  h = h || {};
  return {
    valorAquisicao: str(h.valorAquisicao),
    valorEmprestimo: str(h.valorEmprestimo),
    capitaisProprios: str(h.capitaisProprios),
    impostos: str(h.impostos),
    dataAquisicao: h.dataAquisicao || '',
    taxaJuro: str(h.taxaJuro),
    prazoAnos: str(h.prazoAnos),
    prestacao: str(h.prestacao),
    rendimentoAgregado: str(h.rendimentoAgregado),
  };
}

export default function HousingModal() {
  const { isOpen, close } = useModal('housing');
  const { state, actions } = useStore();
  const toast = useToast();
  const [d, setD] = useState(fromHousing(null));

  useEffect(() => {
    if (isOpen) setD(fromHousing(state.housing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  // Capitais próprios auto = aquisição − empréstimo (enquanto o utilizador não o editar à mão).
  const onAcqOrLoan = (k, v) => {
    setD((p) => {
      const next = { ...p, [k]: v };
      const acq = num(k === 'valorAquisicao' ? v : p.valorAquisicao);
      const loan = num(k === 'valorEmprestimo' ? v : p.valorEmprestimo);
      next.capitaisProprios = str(Math.max(0, acq - loan));
      return next;
    });
  };

  const save = () => {
    const housing = {
      valorAquisicao: num(d.valorAquisicao),
      valorEmprestimo: num(d.valorEmprestimo),
      capitaisProprios: num(d.capitaisProprios),
      impostos: num(d.impostos),
      dataAquisicao: d.dataAquisicao || '',
      taxaJuro: num(d.taxaJuro),
      prazoAnos: num(d.prazoAnos),
      prestacao: num(d.prestacao),
      rendimentoAgregado: num(d.rendimentoAgregado),
    };
    actions.setHousing(housing);
    close();
    toast('Crédito habitação guardado', 'success');
  };

  const removeHousing = () => {
    if (typeof confirm === 'function' && !confirm('Remover os dados do crédito à habitação?')) return;
    actions.setHousing(null);
    close();
    toast('Removido', 'success');
  };

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };
  const field = (label, k, opts) => (
    <div style={{ marginBottom: 12 }}>
      <div className="lb" style={{ marginBottom: 6 }}>{label}</div>
      <input
        value={d[k]}
        onChange={(e) => (opts && opts.onAcqLoan ? onAcqOrLoan(k, e.target.value) : set(k, e.target.value))}
        type={opts && opts.type ? opts.type : 'text'}
        inputMode={opts && opts.type === 'date' ? undefined : 'decimal'}
        placeholder={opts && opts.ph ? opts.ph : ''}
        aria-label={label}
        style={inputStyle}
      />
    </div>
  );

  const footer = (
    <>
      <PrimaryButton onClick={save}>Guardar</PrimaryButton>
      {state.housing && <SecondaryButton onClick={removeHousing}>Remover</SecondaryButton>}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title="Crédito à habitação" footer={footer}>
      {field('Valor de aquisição (€)', 'valorAquisicao', { onAcqLoan: true, ph: '250000' })}
      {field('Empréstimo bancário (€)', 'valorEmprestimo', { onAcqLoan: true, ph: '200000' })}
      {field('Capitais próprios (€)', 'capitaisProprios', { ph: '50000' })}
      {field('Impostos pagos na compra — IMT+IS (€)', 'impostos', { ph: '7000' })}
      {field('Data de aquisição', 'dataAquisicao', { type: 'date' })}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>{field('Taxa de juro (%)', 'taxaJuro', { ph: '3,3' })}</div>
        <div style={{ flex: 1 }}>{field('Prazo (anos)', 'prazoAnos', { ph: '30' })}</div>
      </div>
      {field('Prestação mensal (€)', 'prestacao', { ph: '870' })}
      {field('Rendimento do agregado / mês (€)', 'rendimentoAgregado', { ph: '3000' })}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginBottom: 8 }}>
        Usado para a taxa de esforço (prestação ÷ rendimento).
      </div>
    </Sheet>
  );
}
