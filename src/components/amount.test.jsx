import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Amount from './Amount.jsx';

afterEach(() => cleanup());

describe('Amount', () => {
  it('saída: sinal menos tipográfico, cor neutra', () => {
    render(<Amount value={80} kind="out" />);
    const el = screen.getByText('−80,00 €');
    expect(el.className).toMatch(/amount-out/);
  });

  it('entrada: mais e verde; neutro sem sinal; alerta vermelho; oculto', () => {
    render(
      <>
        <Amount value={120} kind="in" />
        <Amount value={5} kind="neutral" />
        <Amount value={-60} kind="alert" />
        <Amount value={9} hidden />
      </>
    );
    expect(screen.getByText('+120,00 €').className).toMatch(/amount-in/);
    expect(screen.getByText('5,00 €')).toBeTruthy();
    expect(screen.getByText('-60,00 €').className).toMatch(/amount-alert/);
    expect(screen.getByText('••••')).toBeTruthy();
  });
});
