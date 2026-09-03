import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import Avatar, { initialsFrom } from '../components/Avatar.jsx';
import { render } from '@testing-library/react';
import { richFixture, emptyFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';
import OverviewView from './OverviewView.jsx';

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

afterEach(() => cleanup());

describe('avatares nos grupos', () => {
  it('o card do grupo mostra os membros como avatares sobrepostos', async () => {
    const { container } = await renderWithStore(<GroupsView />, { fixture: richFixture() });
    const card = container.querySelector('.cd .avatar-stack');
    expect(card).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Ana' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'João' }).length).toBeGreaterThan(0);
  });
  it('o nome acessível do card mantém o saldo e o nº de pessoas', async () => {
    // Um aria-label no botão substituía o nome inteiro e calava o saldo.
    await renderWithStore(<GroupsView />, { fixture: richFixture() });
    const card = screen.getByText('Férias Algarve').closest('button');
    const name = card.textContent + ' ' + Array.from(card.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')).join(' ');
    expect(card.getAttribute('aria-label')).toBeNull();
    expect(name).toMatch(/pessoas/);
    expect(name).toMatch(/Devem-te|Deves|acertado/);
  });
  it('a faixa Grupos do Resumo mostra as pessoas dos grupos ativos', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    const strip = Array.from(container.querySelectorAll('button.cd')).find((b) => /Grupos/.test(b.getAttribute('aria-label') || ''));
    expect(strip).toBeTruthy();
    expect(strip.querySelector('.avatar-stack')).toBeTruthy();
  });
  it('em preview sem dados próprios a faixa mostra as pessoas do grupo de exemplo', async () => {
    // Os saldos vêm de getGroupsData() (grupo de exemplo); os avatares têm de
    // vir da mesma fonte, senão o cartão mostrava demo com a pilha vazia.
    const { container } = await renderWithStore(<OverviewView />, { fixture: emptyFixture(), preview: true });
    const strip = Array.from(container.querySelectorAll('button.cd')).find((b) => /Grupos/.test(b.getAttribute('aria-label') || ''));
    expect(strip).toBeTruthy();
    const stack = strip.querySelector('.avatar-stack');
    expect(stack).toBeTruthy();
    expect(stack.querySelectorAll('.avatar').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Ana' }).length).toBeGreaterThan(0);
  });
  it('a mesma pessoa tem as mesmas iniciais nos grupos e no componente partilhado', async () => {
    // Havia duas regras: a dos grupos dava "MA" (2 primeiras letras) e a
    // partilhada "MM" (primeira + última) para o mesmo "Manuel Marrão".
    const fx = richFixture();
    fx.people = [{ id: 'p-mm', name: 'Manuel Marrão', color: '#12b3a6', createdAt: 1 }];
    fx.groups = [{ ...fx.groups[0], memberIds: ['me', 'p-mm'] }];
    fx.groupEntries = [];
    await renderWithStore(<GroupsView />, { fixture: fx });
    const noGrupo = screen.getAllByRole('img', { name: 'Manuel Marrão' })[0];
    const { container } = render(<Avatar name="Manuel Marrão" />);
    expect(noGrupo.textContent).toBe(container.firstChild.textContent);
    expect(noGrupo.textContent).toBe(initialsFrom('Manuel Marrão'));
    expect(noGrupo.textContent).toBe('MM');
  });
});
