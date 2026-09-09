import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { fm } from '../lib/format.js';
import { monthsElapsed, remainingBalance, simulateExtraRepayment } from '../lib/mortgage.js';
import ExtraRepaymentSimulator from './ExtraRepaymentSimulator.jsx';

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

afterEach(cleanup);

// getByText normaliza espaços (inclui o nbsp do fm()) e não bate certo com
// comparação exata de string — compara já normalizado dos dois lados.
const normalizeWs = (s) => s.replace(/\s+/g, ' ').trim();
const matchText = (expected) => (_, node) => !!node.textContent && normalizeWs(node.textContent) === normalizeWs(expected);

function dateYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const housing = {
  valorAquisicao: 120000,
  valorEmprestimo: 100000,
  taxaJuro: 3,
  prazoAnos: 30,
  prestacao: 421.6,
  dataAquisicao: dateYearsAgo(5),
  rendimentoAgregado: 3000,
};

describe('ExtraRepaymentSimulator', () => {
  it('sem crédito registado não renderiza nada', async () => {
    const { container } = await renderWithStore(<ExtraRepaymentSimulator />, { fixture: { housing: null } });
    expect(container.textContent).toBe('');
  });

  it('com crédito completo mostra o saldo em dívida estimado', async () => {
    await renderWithStore(<ExtraRepaymentSimulator />, { fixture: { housing } });
    const elapsed = monthsElapsed(housing.dataAquisicao);
    const balance = remainingBalance(housing.valorEmprestimo, housing.taxaJuro, housing.prazoAnos, elapsed);
    expect(screen.getByText(matchText(fm(balance)))).toBeInTheDocument();
  });

  it('ao introduzir um valor extra mostra a poupança nos dois cenários', async () => {
    await renderWithStore(<ExtraRepaymentSimulator />, { fixture: { housing } });
    fireEvent.change(screen.getByLabelText('Valor extra a abater'), { target: { value: '10000' } });

    const elapsed = monthsElapsed(housing.dataAquisicao);
    const sim = simulateExtraRepayment({
      principal: housing.valorEmprestimo,
      annualRatePct: housing.taxaJuro,
      years: housing.prazoAnos,
      monthsElapsed: elapsed,
      payment: housing.prestacao,
      extra: 10000,
    });

    expect(screen.getByText(matchText(`−${sim.reduceTerm.monthsSaved} meses`))).toBeInTheDocument();
    expect(screen.getByText(matchText(`${fm(sim.reducePayment.newPayment)}/mês`))).toBeInTheDocument();
    expect(screen.getAllByText(matchText(fm(sim.reduceTerm.interestSaved))).length).toBeGreaterThan(0);
  });

  it('valor extra igual ou maior que o saldo mostra mensagem de quitação', async () => {
    await renderWithStore(<ExtraRepaymentSimulator />, { fixture: { housing } });
    const elapsed = monthsElapsed(housing.dataAquisicao);
    const balance = remainingBalance(housing.valorEmprestimo, housing.taxaJuro, housing.prazoAnos, elapsed);

    fireEvent.change(screen.getByLabelText('Valor extra a abater'), { target: { value: String(balance + 5000) } });

    expect(screen.getByText('Quitas o crédito!')).toBeInTheDocument();
  });

  it('com saldos ocultos, o saldo em dívida fica mascarado', async () => {
    await renderWithStore(<ExtraRepaymentSimulator />, { fixture: { housing, balancesHidden: true } });
    expect(screen.getByText(matchText('••••'))).toBeInTheDocument();
    const elapsed = monthsElapsed(housing.dataAquisicao);
    const balance = remainingBalance(housing.valorEmprestimo, housing.taxaJuro, housing.prazoAnos, elapsed);
    expect(screen.queryByText(matchText(fm(balance)))).not.toBeInTheDocument();
  });
});
