/* Associar despesa a uma recorrente (T47.18) — ao criar (select "Despesa
   recorrente" em "Mais opções" pré-preenche desc/valor/categoria/conta a
   partir do item, sem sobrepor o que o utilizador já escreveu) e ao editar
   (liga/desliga uma despesa já existente). Ligar/desligar só mexe no recId —
   monthPendingFixed/RecurringView (badge "PAGA") passam a contar a
   recorrente como paga no mês só a partir disso, sem mais nenhuma alteração
   (ver src/lib/metrics.js monthPendingFixed e src/views/RecurringView.jsx). */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import { fm } from '../lib/format.js';
import AddExpenseSheet from './AddExpenseSheet.jsx';
import RecurringView from '../views/RecurringView.jsx';

vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.addedExp)}</pre>;
}

describe('Associar despesa a uma recorrente', () => {
  it('nova despesa: escolher uma recorrente preenche descrição/valor e marca-a como paga em Recorrentes', async () => {
    // richFixture já materializa "Ginásio" (recId rec-gym) todos os meses,
    // incluindo o corrente (id 'g0') — para testar o caminho "ainda por
    // pagar → pago" tira-se essa linha do mês corrente primeiro.
    const fixture = richFixture();
    fixture.addedExp = fixture.addedExp.filter((x) => x.id !== 'g0');

    await renderWithStore(<><AddExpenseSheet /><RecurringView /><Probe /></>, { fixture, openModal: 'add' });

    // Antes: Ginásio ainda não está paga este mês (sem despesa com recId
    // rec-gym datada no mês corrente).
    expect(screen.queryByText('PAGA')).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais opções' })); });
    const select = screen.getByLabelText('Despesa recorrente (opcional)');
    // O rótulo da opção usa fm() (cêntimos): confirma-se aqui em vez de
    // cravar a string, para não depender do formato de fm().
    const gymOption = select.querySelector('option[value="rec-gym"]');
    expect(gymOption.textContent).toBe('Ginásio · ' + fm(35.9));

    await act(async () => { fireEvent.change(select, { target: { value: 'rec-gym' } }); });

    expect(screen.getByLabelText('Descrição').value).toBe('Ginásio');
    expect(screen.getByLabelText('Valor (€)').value).toBe(String(35.9).replace('.', ','));
    expect(screen.getByText('Conta como paga em Recorrentes neste mês.')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registar despesa' })); });

    const added = JSON.parse(screen.getByTestId('probe').textContent);
    const last = added[added.length - 1];
    expect(last.recId).toBe('rec-gym');
    expect(last.desc).toBe('Ginásio');

    // Depois: RecurringView (mesma store) já mostra Ginásio como paga.
    expect(screen.getByText('PAGA')).toBeTruthy();
  });

  it('editar uma despesa existente: ligar a uma recorrente não sobrepõe a descrição já escrita', async () => {
    let actionsRef;
    await renderWithStore(<AddExpenseSheet />, {
      fixture: richFixture(),
      openModal: 'add',
      payload: { editId: 'k0' }, // IKEA (richFixture), sem shared/tags/nota/recId
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // IKEA não tem nada em "Mais opções" -> começa fechada.
    expect(screen.queryByLabelText('Despesa recorrente (opcional)')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais opções' })); });

    const select = screen.getByLabelText('Despesa recorrente (opcional)');
    const netOption = select.querySelector('option[value="rec-net"]');
    expect(netOption.textContent).toBe('Internet · ' + fm(39.9));

    await act(async () => { fireEvent.change(select, { target: { value: 'rec-net' } }); });

    // Nunca sobrepõe entrada não-vazia do utilizador.
    expect(screen.getByLabelText('Descrição').value).toBe('IKEA');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' })); });

    const ikea = actionsRef.getState().addedExp.find((x) => x.id === 'k0');
    expect(ikea.recId).toBe('rec-net');
    expect(ikea.desc).toBe('IKEA');
  });

  it('editar uma despesa já ligada: "Mais opções" abre sozinha e "Nenhuma" remove a ligação', async () => {
    let actionsRef;
    await renderWithStore(<AddExpenseSheet />, {
      fixture: richFixture(),
      openModal: 'add',
      payload: { editId: 'g0' }, // Ginásio do mês corrente, recId: 'rec-gym'
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // "Mais opções" já vem aberta porque editExp.recId está definido.
    const select = screen.getByLabelText('Despesa recorrente (opcional)');
    expect(select.value).toBe('rec-gym');
    expect(screen.getByText('Conta como paga em Recorrentes neste mês.')).toBeTruthy();

    await act(async () => { fireEvent.change(select, { target: { value: '' } }); });
    expect(screen.queryByText('Conta como paga em Recorrentes neste mês.')).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' })); });

    const gym = actionsRef.getState().addedExp.find((x) => x.id === 'g0');
    expect(gym.recId).toBeFalsy();
  });

  it('sem despesas recorrentes, o seletor não aparece', async () => {
    const fixture = richFixture();
    fixture.recurring = [];
    await renderWithStore(<AddExpenseSheet />, { fixture, openModal: 'add' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais opções' })); });
    expect(screen.queryByLabelText('Despesa recorrente (opcional)')).toBeNull();
  });
});
