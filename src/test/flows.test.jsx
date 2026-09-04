/* Fluxos de utilizador ponta-a-ponta (UI real + store real, Firebase mockado):
   adicionar despesa, transferência, pagar cartão, reforçar metas, importar um
   Excel do banco gerado em memória, e aprender regra ao corrigir categoria. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act, fireEvent, screen, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture, CHECKING, SAVINGS, CARD } from './fixtures.js';
import { useStore } from '../store/store.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

import AddExpenseSheet from '../modals/AddExpenseSheet.jsx';
import TransferModal from '../modals/TransferModal.jsx';
import CardPayModal from '../modals/CardPayModal.jsx';
import ImportStatementSheet from '../modals/ImportStatementSheet.jsx';
import OverviewView from '../views/OverviewView.jsx';
import CardsView from '../views/CardsView.jsx';
import { getAcctsLive, cardUsage } from '../lib/finance.js';

// Sonda que expõe o estado do store para as asserções.
let probe = null;
function Probe() {
  const store = useStore();
  probe = store;
  return null;
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};
const type = (el, value) => fireEvent.change(el, { target: { value } });
afterEach(() => {
  cleanup();
  probe = null;
});

describe('Fluxo: adicionar despesa', () => {
  it('cria a despesa, aplica a regra do utilizador e desconta da conta', async () => {
    await renderWithStore(<><AddExpenseSheet /><Probe /></>, { fixture: richFixture(), openModal: 'add' });
    const before = probe.state.addedExp.length;
    const liveBefore = getAcctsLive({ ...probe.state, currentUser: probe.currentUser }).find((a) => a.b === 'Activobank').v;

    type(screen.getByLabelText('Descrição'), 'Pingo Doce Amadora');
    type(screen.getByLabelText('Valor (€)'), '12,50');
    type(screen.getByLabelText('Conta debitada (opcional)'), CHECKING);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Adicionar despesa/i })));
    await settle();

    expect(probe.state.addedExp.length).toBe(before + 1);
    const added = probe.state.addedExp[probe.state.addedExp.length - 1];
    expect(added.amount).toBe(12.5);
    expect(added.cat).toBe('sup'); // regra "pingo doce" → Supermercado
    const liveAfter = getAcctsLive({ ...probe.state, currentUser: probe.currentUser }).find((a) => a.b === 'Activobank').v;
    expect(liveAfter).toBeCloseTo(liveBefore - 12.5, 2);
  });

  it('recusa despesa sem descrição ou valor', async () => {
    await renderWithStore(<><AddExpenseSheet /><Probe /></>, { fixture: richFixture(), openModal: 'add' });
    const before = probe.state.addedExp.length;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Adicionar despesa/i })));
    expect(probe.state.addedExp.length).toBe(before);
  });
});

describe('Fluxo: transferência entre contas', () => {
  it('move o valor (origem −, destino +) e o património não muda', async () => {
    await renderWithStore(<><TransferModal /><Probe /></>, { fixture: richFixture(), openModal: 'transfer' });
    const s0 = { ...probe.state, currentUser: probe.currentUser };
    const total0 = getAcctsLive(s0).reduce((s, a) => s + a.v, 0);

    type(screen.getByLabelText('Conta de origem'), CHECKING);
    type(screen.getByLabelText('Conta de destino'), SAVINGS);
    type(screen.getByLabelText('Valor'), '250');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Registar transferência/i })));
    await settle();

    const s1 = { ...probe.state, currentUser: probe.currentUser };
    const live = getAcctsLive(s1);
    const total1 = live.reduce((s, a) => s + a.v, 0);
    expect(total1).toBeCloseTo(total0, 2); // património inalterado
    expect(probe.state.transfers.at(-1)).toMatchObject({ from: CHECKING, to: SAVINGS, amount: 250 });
  });

  it('recusa origem igual ao destino', async () => {
    await renderWithStore(<><TransferModal /><Probe /></>, { fixture: richFixture(), openModal: 'transfer' });
    const n = probe.state.transfers.length;
    type(screen.getByLabelText('Conta de origem'), CHECKING);
    type(screen.getByLabelText('Conta de destino'), CHECKING);
    type(screen.getByLabelText('Valor'), '10');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Registar transferência/i })));
    expect(probe.state.transfers.length).toBe(n);
  });
});

describe('Fluxo: pagar dívida do cartão', () => {
  it('baixa a dívida do cartão e desce o saldo da conta à ordem', async () => {
    await renderWithStore(<><CardPayModal /><Probe /></>, { fixture: richFixture(), openModal: 'cardpay', payload: { cardLabel: CARD } });
    const s0 = { ...probe.state, currentUser: probe.currentUser };
    const debt0 = cardUsage(s0, CARD).used;
    const chk0 = getAcctsLive(s0).find((a) => a.b === 'Activobank').v;
    expect(debt0).toBeGreaterThan(0);

    type(screen.getByLabelText('Conta de origem'), CHECKING);
    type(screen.getByLabelText('Valor'), '100');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Registar pagamento/i })));
    await settle();

    const s1 = { ...probe.state, currentUser: probe.currentUser };
    expect(cardUsage(s1, CARD).used).toBeCloseTo(debt0 - 100, 2);
    expect(getAcctsLive(s1).find((a) => a.b === 'Activobank').v).toBeCloseTo(chk0 - 100, 2);
  });

  it('"Pagar tudo" preenche a dívida total', async () => {
    await renderWithStore(<><CardPayModal /><Probe /></>, { fixture: richFixture(), openModal: 'cardpay', payload: { cardLabel: CARD } });
    const debt = cardUsage({ ...probe.state, currentUser: probe.currentUser }, CARD).used;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Pagar tudo/i })));
    expect(screen.getByLabelText('Valor').value.replace(',', '.')).toBe(debt.toFixed(2));
  });
});

describe('Fluxo: plano do mês → reforçar metas', () => {
  it('reserva para as metas uma única vez no mês', async () => {
    await renderWithStore(<><OverviewView /><Probe /></>, { fixture: richFixture() });
    const g0 = probe.state.goals.find((g) => g.id === 'g1').current;
    const btn = screen.getByRole('button', { name: /Reservar .* para as metas/i });
    await act(async () => fireEvent.click(btn));
    await settle();
    const g1 = probe.state.goals.find((g) => g.id === 'g1');
    expect(g1.current).toBe(g0 + 100); // reserva mensal da meta
    expect(g1.lastAlloc).toMatch(/^\d{4}-\d{2}$/);
    // g2 só lhe faltavam 100 → não ultrapassa o objetivo
    const g2 = probe.state.goals.find((g) => g.id === 'g2');
    expect(g2.current).toBeLessThanOrEqual(g2.target);
    // segundo clique não existe (botão substituído pela confirmação)
    expect(screen.queryByRole('button', { name: /Reservar .* para as metas/i })).toBeNull();
    expect(document.body.textContent).toMatch(/Metas já reforçadas este mês/);
  });
});

describe('Fluxo: importar Excel do banco (ponta-a-ponta)', () => {
  // Gera um xlsx no formato ActivoBank em memória.
  function bankFile(rows) {
    const aoa = [
      ['HISTÓRICO DE CONTA NÚMERO 000'],
      ['Moeda:', 'EUR'],
      [''],
      ['Tipo:', 'Todos'],
      ['Data de:', '01/07/2026'],
      ['Data até:', '31/07/2026'],
      [],
      ['Data Lanc.', 'Data Valor', 'Descrição', 'Valor', 'Saldo'],
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'mov');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buf], 'extrato.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  it('parseia, classifica, separa receitas/transferências, deteta duplicados e importa', async () => {
    const fx = richFixture();
    // uma despesa que JÁ existe (mesmo dia+valor) para testar o duplicado
    fx.addedExp.push({ id: 'exists', desc: 'Qualquer', amount: 7.25, cat: 'out', date: '2026-07-09', imported: true });
    await renderWithStore(<><ImportStatementSheet /><Probe /></>, { fixture: fx, openModal: 'stmt' });
    const before = { exp: probe.state.addedExp.length, inc: probe.state.incomes.length, trf: probe.state.transfers.length };

    const file = bankFile([
      ['02/07/2026', '02/07/2026', 'COMPRA 4174 CONTINENTE LISBOA CONTACTLESS', '-32.10', '1,000.00'],
      ['03/07/2026', '03/07/2026', 'DD VODAFONE PORTU 0797', '-59.19', '940.81'],
      ['05/07/2026', '05/07/2026', 'TRF P/ Trade Republic', '-300.00', '640.81'],
      ['08/07/2026', '08/07/2026', 'TRANSFERENCIA - VENCIMENTO', '1,850.00', '2,490.81'],
      ['09/07/2026', '09/07/2026', 'COMPRA 4174 LOJA XPTO', '-7.25', '2,483.56'], // duplicado (mesmo dia+valor)
    ]);
    const input = document.getElementById('stFile');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    // FileReader é assíncrono → espera o preview.
    for (let i = 0; i < 20 && !document.body.textContent.includes('transações'); i++) {
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
    const body = document.body.textContent;
    expect(body).toMatch(/5 transações/);
    expect(body).toMatch(/RECEITA/); // o vencimento
    expect(body).toMatch(/TRF/); // Trade Republic = transferência própria
    expect(body).toMatch(/POSSÍVEL DUP|DUPLICADO/); // a LOJA XPTO de 7,25 no dia 9

    // Categorias sugeridas corretas no preview
    const selects = screen.getAllByRole('combobox', { name: /Categoria de/ });
    const vals = selects.map((s) => s.value);
    expect(vals).toContain('sup'); // Continente
    expect(vals).toContain('tel'); // Vodafone

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Importar selecionadas/i })));
    await settle();

    // 2 despesas (Continente, Vodafone) — duplicado e transferência vêm desmarcados; receita importada
    expect(probe.state.addedExp.length).toBe(before.exp + 2);
    expect(probe.state.incomes.length).toBe(before.inc + 1);
    expect(probe.state.incomes.at(-1)).toMatchObject({ amount: 1850, source: 'salary', imported: true });
    expect(probe.state.transfers.length).toBe(before.trf); // TRF própria não foi selecionada
  });

  it('liga a despesa importada à recorrente correspondente (recId) e não liga a compra pontual', async () => {
    // richFixture tem recurring: Ginásio 35,90 (gym) e Internet 39,90 (tel).
    await renderWithStore(<><ImportStatementSheet /><Probe /></>, { fixture: richFixture(), openModal: 'stmt' });

    const file = bankFile([
      ['02/07/2026', '02/07/2026', 'DD GINASIO SOLINCA LISBOA', '-35.90', '1,000.00'], // = mensalidade
      ['03/07/2026', '03/07/2026', 'COMPRA 4174 GINASIO SOLINCA LOJA', '-89.00', '911.00'], // mesmo nome, compra pontual
      ['04/07/2026', '04/07/2026', 'COMPRA 4174 CONTINENTE LISBOA CONTACTLESS', '-32.10', '878.90'],
    ]);
    const input = document.getElementById('stFile');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    for (let i = 0; i < 20 && !document.body.textContent.includes('transações'); i++) {
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
    // Só UMA linha ganha o badge — a de 89€ é o mesmo comerciante mas não é a mensalidade.
    expect(document.body.textContent.match(/RECORRENTE/g) || []).toHaveLength(1);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Importar selecionadas/i })));
    await settle();

    const imported = probe.state.addedExp.filter((x) => (x.date || '').slice(0, 7) === '2026-07' && x.imported);
    const gym = imported.find((x) => x.amount === 35.9);
    const loja = imported.find((x) => x.amount === 89);
    const cont = imported.find((x) => x.amount === 32.1);
    expect(gym.recId).toBe('rec-gym'); // materializa a recorrente → projeção deixa de a somar
    expect(loja.recId).toBeUndefined();
    expect(cont.recId).toBeUndefined();
  });

  it('corrigir a categoria no preview aprende uma regra permanente', async () => {
    await renderWithStore(<><ImportStatementSheet /><Probe /></>, { fixture: richFixture(), openModal: 'stmt' });
    const rules0 = probe.state.rules.length;
    const file = bankFile([['02/07/2026', '02/07/2026', 'COMPRA 4174 PADARIA NOVA LISBOA', '-3.40', '100.00']]);
    await act(async () => {
      fireEvent.change(document.getElementById('stFile'), { target: { files: [file] } });
    });
    for (let i = 0; i < 20 && !document.body.textContent.includes('transações'); i++) {
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
    const sel = screen.getByRole('combobox', { name: /Categoria de/ });
    await act(async () => type(sel, 'comp'));
    await settle();
    expect(probe.state.rules.length).toBe(rules0 + 1);
    expect(probe.state.rules.at(-1)).toMatchObject({ pattern: 'padaria nova', cat: 'comp', learned: true });
  });
});

describe('Fluxo: cartões', () => {
  it('vista mostra dívida, limite e pagamentos do cartão', async () => {
    await renderWithStore(<><CardsView /><Probe /></>, { fixture: richFixture() });
    const body = document.body.textContent;
    expect(body).toMatch(/Dívida atual/);
    expect(body).toMatch(/de limite/);
    expect(body).toMatch(/Pagamentos \(1\)/); // t2 = pagamento ao cartão
  });
});
