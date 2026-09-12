/* Vista Trading212 — botão "Sincronizar" (API real), estado da sync e a
   limpeza de duplicados oferecida na 1ª sync. */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve('token'),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: vi.fn(() => Promise.resolve(null)),
  syncUserData: vi.fn(() => Promise.resolve()),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));
vi.mock('../lib/trading212Api.js', () => ({
  t212Status: vi.fn(),
  t212Sync: vi.fn(),
  t212CleanupManual: vi.fn(),
}));

import { t212Status, t212Sync, t212CleanupManual } from '../lib/trading212Api.js';
import { loadUserData } from '../firebase/data.js';
import T212View from './T212View.jsx';

const OK_STATUS = { configured: true, env: 'live', enabled: true, lastSyncAt: '2026-09-11T18:30:00.000Z' };
const OK_REPORT = { report: { date: '2026-09-12', valorAtual: 1200, baseCusto: 1000, positions: 3, removed: 0, manualCandidates: [] } };

beforeEach(() => {
  t212Status.mockResolvedValue(OK_STATUS);
  t212Sync.mockResolvedValue(OK_REPORT);
  t212CleanupManual.mockResolvedValue({ removed: 1 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('T212View — sincronizar com a API', () => {
  it('mostra o botão de sincronizar', async () => {
    await renderWithStore(<T212View />);
    expect(await screen.findByRole('button', { name: /sincronizar/i })).toBeTruthy();
  });

  it('ao sincronizar, chama a API e recarrega os dados gravados pelo servidor', async () => {
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    await waitFor(() => expect(t212Sync).toHaveBeenCalled());
    await waitFor(() => expect(loadUserData).toHaveBeenCalled());
  });

  it('confirma com o valor e o número de posições', async () => {
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    expect(await screen.findByText(/3 posiç/i)).toBeTruthy();
  });

  it('mostra a data da última sincronização automática', async () => {
    await renderWithStore(<T212View />);
    expect(await screen.findByText(/11\.09|última/i)).toBeTruthy();
  });

  it('avisa quando a integração não está configurada no servidor', async () => {
    t212Status.mockResolvedValue({ configured: false, env: 'live', enabled: false, lastSyncAt: null });
    await renderWithStore(<T212View />);
    expect(await screen.findByText(/não está configurada/i)).toBeTruthy();
  });

  it('sinaliza o ambiente demo, para não confundir com dinheiro real', async () => {
    t212Status.mockResolvedValue({ ...OK_STATUS, env: 'demo' });
    await renderWithStore(<T212View />);
    expect(await screen.findByText(/demo/i)).toBeTruthy();
  });

  it('erro da API aparece ao utilizador em vez de falhar em silêncio', async () => {
    t212Sync.mockRejectedValue(new Error('Chave da Trading212 recusada (401)'));
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    expect(await screen.findByText(/recusada/i)).toBeTruthy();
  });

  it('um status que falha não impede sincronizar à mão', async () => {
    t212Status.mockRejectedValue(new Error('sem sessão'));
    await renderWithStore(<T212View />);
    expect(await screen.findByRole('button', { name: /sincronizar/i })).toBeTruthy();
  });
});

describe('T212View — limpeza de duplicados da 1ª sync', () => {
  const WITH_DUPES = {
    report: { ...OK_REPORT.report, manualCandidates: [{ id: 'm1', asset: 'VWCE', broker: 'Trading 212', qty: 5 }] },
  };

  it('oferece apagar as posições manuais que parecem ser da T212', async () => {
    t212Sync.mockResolvedValue(WITH_DUPES);
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    expect(await screen.findByText(/VWCE/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /apagar/i })).toBeTruthy();
  });

  it('ao confirmar, apaga só os ids sinalizados', async () => {
    t212Sync.mockResolvedValue(WITH_DUPES);
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /apagar/i }));
    await waitFor(() => expect(t212CleanupManual).toHaveBeenCalledWith(['m1']));
  });

  it('quem escolher manter fica sem o aviso e sem apagar nada', async () => {
    t212Sync.mockResolvedValue(WITH_DUPES);
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /manter/i }));
    await waitFor(() => expect(screen.queryByText(/VWCE/)).toBeNull());
    expect(t212CleanupManual).not.toHaveBeenCalled();
  });

  it('sem duplicados, não mostra aviso nenhum', async () => {
    await renderWithStore(<T212View />);
    fireEvent.click(await screen.findByRole('button', { name: /sincronizar/i }));
    await waitFor(() => expect(t212Sync).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /apagar/i })).toBeNull();
  });
});
