/* ════════════════════════════════════════════════════════════════════════
   SettingsSheet — seletor do tier de IA. A secção "Assistente IA" (já
   existente) ganha um seletor de 3 opções que escreve em state.aiTier via
   actions.setAiTier — a única forma de o utilizador escolher, dentro do
   whitelist do servidor (ver STORE_API.md / api/ai.js MODEL_TIERS).
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import SettingsSheet from './SettingsSheet.jsx';

const openSettings = (fixture) => renderWithStore(<SettingsSheet />, { openModal: 'settings', fixture });

describe('SettingsSheet — seletor do tier de IA', () => {
  it('mostra as 3 opções com o nome PT-PT e o modelo por trás de cada uma', async () => {
    await openSettings();
    expect(screen.getByText('Económico')).toBeInTheDocument();
    expect(screen.getByText('Equilibrado')).toBeInTheDocument();
    expect(screen.getByText('Avançado')).toBeInTheDocument();
    // O nome do modelo por trás de cada tier tem de estar visível — não só o
    // rótulo PT-PT (o utilizador está a escolher entre modelos reais).
    expect(screen.getByText(/Gemini 3\.5 Flash Lite/)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 3\.7 Flash/)).toBeInTheDocument();
    expect(screen.getByText(/Claude Haiku 4\.5/)).toBeInTheDocument();
  });

  it('marca a opção correspondente a state.aiTier como selecionada', async () => {
    await openSettings({ aiTier: 'avancado' });
    expect(screen.getByRole('button', { name: /Avançado/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Económico/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Equilibrado/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('arranca em Económico quando o utilizador nunca escolheu nada (default)', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: /Económico/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicar numa opção escreve o tier no store', async () => {
    let capturedActions;
    await renderWithStore(<SettingsSheet />, {
      openModal: 'settings',
      onReady: (ctx) => { capturedActions = ctx.actions; },
    });
    fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
    await waitFor(() => expect(capturedActions.getState().aiTier).toBe('avancado'));
    expect(screen.getByRole('button', { name: /Avançado/ })).toHaveAttribute('aria-pressed', 'true');
  });

  // Documento (extrato/recibo/print de saldo) nunca corre no tier mais
  // barato — a UI tem de deixar isso claro, para o utilizador não pensar que
  // escolher Económico também baixa o custo de importar um extrato.
  it('explica que a importação de documentos usa sempre pelo menos o nível Equilibrado', async () => {
    await openSettings();
    expect(screen.getByText(/pelo menos.*equilibrado/i)).toBeInTheDocument();
  });
});
