import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UIProvider, useUI } from '../store/ui.jsx';
import QuickActions from './QuickActions.jsx';

function Probe({ onState }) {
  const ui = useUI();
  onState(ui);
  return null;
}

describe('QuickActions', () => {
  it('mostra os cinco botoes, incluindo o assistente', () => {
    render(<UIProvider><QuickActions /></UIProvider>);
    ['Saldo', 'Despesa', 'Receita', 'IA', 'Mais'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('o botao IA abre o modal assistant', () => {
    const seen = vi.fn();
    render(
      <UIProvider>
        <QuickActions />
        <Probe onState={seen} />
      </UIProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'IA' }));
    const last = seen.mock.calls[seen.mock.calls.length - 1][0];
    expect(last.modals.assistant).toBeTruthy();
  });
});
