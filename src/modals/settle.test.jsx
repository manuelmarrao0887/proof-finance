/* Testes de SettleSheet (Task 9) — os 4 do brief (pré-preenchimento do valor,
   saldo antes/depois via computeBalances, valor zero, pagar a si próprio) +
   os que o brief deixa por cobrir: gravar cria mesmo o "settlement" com os
   campos certos e não mexe em addedExp, o aviso de "mais do que a dívida"
   não bloqueia o registo, e trocar a pessoa em "de"/"para" recalcula o valor
   sugerido a partir dos saldos atuais — + a ronda de review (5 findings):
   o aviso de sobre-pagamento também dispara quando não há dívida nenhuma
   nessa direção (saldo 0), o par por defeito sem from/to no payload usa o
   MESMO plano (simplifyDebts) que a tab Saldos mostra, e reabrir a sheet já
   montada com um payload diferente (from/to/amount) atualiza os campos. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act, screen, fireEvent, within } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { todayISO } from '../lib/format.js';
import { computeBalances, simplifyDebts } from '../lib/split.js';
import SettleSheet from './SettleSheet.jsx';

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

// NOTA (mesma do groupExpense.test.jsx): `fixture` tem de ser o resultado de
// chamar richFixture(), não a função em si — senão nenhum grupo é semeado.
const open = { openModal: 'settle', payload: { groupId: 'g-ferias', from: 'p-joao', to: 'me', amount: 100 }, fixture: richFixture() };

// Grupo de 4 pessoas com DOIS devedores e DOIS credores, valores desiguais —
// para testar que o par por defeito (payload sem from/to) usa o mesmo plano
// (simplifyDebts) que a tab Saldos mostra, não um heurístico à parte que possa
// discordar do que já está escrito no ecrã por trás da sheet.
// Duas despesas reais (sem "reflect", irrelevante aqui) dão: me -30, p-ana -70,
// p-joao +90, p-rita +10 (soma 0).
function quadFixture() {
  return {
    people: [
      { id: 'p-ana', name: 'Ana', color: '#12b3a6', createdAt: 1 },
      { id: 'p-joao', name: 'João', color: '#f5a623', createdAt: 2 },
      { id: 'p-rita', name: 'Rita', color: '#8e44ad', createdAt: 3 },
    ],
    groups: [
      {
        id: 'g-quad', name: 'Quadrilha', emoji: '👥', type: 'trip', currency: 'EUR',
        memberIds: ['me', 'p-ana', 'p-joao', 'p-rita'], reflectMine: false, archived: false, createdAt: 1,
      },
    ],
    groupEntries: [
      {
        id: 'qe-1', groupId: 'g-quad', kind: 'expense', desc: 'Jantar', amount: 90,
        date: '2026-08-01', payerId: 'p-joao', splitMode: 'exact', gcat: 'other', reflect: false,
        shares: [{ personId: 'me', amount: 30 }, { personId: 'p-ana', amount: 60 }],
        linkedExpId: null, createdAt: 1,
      },
      {
        id: 'qe-2', groupId: 'g-quad', kind: 'expense', desc: 'Táxi', amount: 10,
        date: '2026-08-02', payerId: 'p-rita', splitMode: 'exact', gcat: 'transp', reflect: false,
        shares: [{ personId: 'p-ana', amount: 10 }],
        linkedExpId: null, createdAt: 2,
      },
    ],
  };
}

describe('SettleSheet', () => {
  it('pré-preenche o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText(/valor/i).value).toBe('100');
  });

  it('mostra o saldo antes e depois — rótulos genéricos "Antes"/"Depois" (o nome já vai na mesma linha)', async () => {
    await renderWithStore(<SettleSheet />, open);
    // "Saldo do Tu antes"/"Saldo do Tu depois" não fazia sentido para o próprio
    // utilizador nem concordava em género para nomes femininos — o nome de
    // cada pessoa já está na própria linha, por isso os rótulos são só
    // "Antes"/"Depois", dentro da linha de João.
    // "João" também aparece nos <option> dos selects "De"/"Para" — restringe
    // à linha da pré-visualização (um <span>, não uma <option>).
    const joaoRow = screen.getByText('João', { selector: 'span' }).closest('.rw');
    expect(within(joaoRow).getByText('Antes')).toBeTruthy();
    expect(within(joaoRow).getByText('Depois')).toBeTruthy();
    expect(screen.getByText('0,00 €')).toBeTruthy();
  });

  it('recusa valor zero', async () => {
    await renderWithStore(<SettleSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('O valor tem de ser maior que zero.')).toBeTruthy();
  });

  it('recusa pagar a si próprio', async () => {
    await renderWithStore(<SettleSheet />, { ...open, payload: { groupId: 'g-ferias', from: 'me', to: 'me', amount: 10 } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('Escolhe duas pessoas diferentes.')).toBeTruthy();
  });

  it('gravar regista o acerto com os campos certos e não mexe em addedExp', async () => {
    let actionsRef;
    await renderWithStore(<SettleSheet />, { ...open, onReady: ({ actions }) => { actionsRef = actions; } });
    const addedExpBefore = actionsRef.getState().addedExp.length;

    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));

    const state = actionsRef.getState();
    const saved = state.groupEntries.find((e) => e.kind === 'settlement' && e.id !== 'ge-2');
    expect(saved).toBeTruthy();
    expect(saved.groupId).toBe('g-ferias');
    expect(saved.fromId).toBe('p-joao');
    expect(saved.toId).toBe('me');
    expect(saved.amount).toBe(100);
    expect(saved.method).toBe('mbway');
    expect(saved.date).toBe(todayISO());
    // Um acerto move saldos dentro do grupo — nunca cria uma despesa pessoal.
    expect(state.addedExp.length).toBe(addedExpBefore);
  });

  it('aviso de valor acima da dívida não bloqueia o registo', async () => {
    let actionsRef;
    await renderWithStore(<SettleSheet />, { ...open, onReady: ({ actions }) => { actionsRef = actions; } });

    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '150' } });
    expect(screen.getByText('Estás a registar mais do que a dívida atual.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));

    const saved = actionsRef.getState().groupEntries.find((e) => e.kind === 'settlement' && e.id !== 'ge-2');
    expect(saved).toBeTruthy();
    expect(saved.amount).toBe(150);
  });

  it('trocar a pessoa em "de" recalcula o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText('Valor').value).toBe('100');

    // p-ana deve 50 (saldo -50), me tem 150 a receber -> sugestão min(50,150)=50.
    fireEvent.change(screen.getByLabelText('De'), { target: { value: 'p-ana' } });

    expect(screen.getByLabelText('Valor').value).toBe('50');
  });

  it('trocar a pessoa em "para" recalcula o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText('Valor').value).toBe('100');

    // De continua p-joao (deve 100); p-ana também deve (saldo -50) -> não há
    // dívida de p-joao PARA p-ana nessa direção, sugestão cai para 0.
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'p-ana' } });

    expect(screen.getByLabelText('Valor').value).toBe('0');
  });

  it('aviso de sobre-pagamento dispara mesmo sem dívida na direção escolhida (saldo 0)', async () => {
    let actionsRef;
    // De = Tu (saldo +150, tem a receber), Para = João (saldo -100, deve) —
    // direção invertida da dívida real: debtBetween dá 0 aqui.
    await renderWithStore(<SettleSheet />, {
      openModal: 'settle',
      payload: { groupId: 'g-ferias', from: 'me', to: 'p-joao', amount: 500 },
      fixture: richFixture(),
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    expect(screen.getByText('Estás a registar mais do que a dívida atual.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));

    const saved = actionsRef.getState().groupEntries.find(
      (e) => e.kind === 'settlement' && e.fromId === 'me' && e.toId === 'p-joao'
    );
    expect(saved).toBeTruthy();
    expect(saved.amount).toBe(500);
  });

  it('sem from/to no payload, propõe o primeiro pagamento do plano de simplifyDebts', async () => {
    const fixture = quadFixture();
    const plan = simplifyDebts(computeBalances(fixture.groupEntries, fixture.groups[0].memberIds));
    expect(plan[0]).toEqual({ from: 'p-ana', to: 'p-joao', amount: 70 }); // confirma o cenário antes de testar a sheet

    await renderWithStore(<SettleSheet />, { openModal: 'settle', payload: { groupId: 'g-quad' }, fixture });

    expect(screen.getByLabelText('De').value).toBe(plan[0].from);
    expect(screen.getByLabelText('Para').value).toBe(plan[0].to);
    expect(screen.getByLabelText('Valor').value).toBe(String(plan[0].amount));
  });

  it('reabrir a sheet já montada com outro payload (sem passar por unmount) atualiza os campos', async () => {
    let uiRef;
    await renderWithStore(<SettleSheet />, {
      ...open, // g-ferias, from: p-joao, to: me, amount: 100
      onReady: ({ ui }) => { uiRef = ui; },
    });
    expect(screen.getByLabelText('De').value).toBe('p-joao');
    expect(screen.getByLabelText('Valor').value).toBe('100');

    // close()+open() no MESMO act(): React só comita o estado final (aberta
    // com o payload B) — isOpen nunca passa visivelmente por false. É o
    // cenário que expõe a falta de p.from/p.to/p.amount nas deps do useEffect
    // de reseed (Finding 4): com deps=[isOpen, groupId] apenas, nem isOpen
    // nem groupId mudam aqui, e os campos ficavam presos no payload A.
    await act(async () => {
      uiRef.close('settle');
      uiRef.open('settle', { groupId: 'g-ferias', from: 'p-ana', to: 'me', amount: 50 });
    });

    expect(screen.getByLabelText('De').value).toBe('p-ana');
    expect(screen.getByLabelText('Para').value).toBe('me');
    expect(screen.getByLabelText('Valor').value).toBe('50');
  });
});
