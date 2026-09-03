import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatTiles from './StatTiles.jsx';

afterEach(() => cleanup());

describe('StatTiles', () => {
  it('renderiza um tile por item, com barra de cor quando há color', () => {
    const { container } = render(
      <StatTiles items={[{ value: '76 €', label: 'por mês' }, { value: '910 €', label: 'por ano' }, { value: '40 €', label: 'por pagar', color: '#9c5e00' }]} />
    );
    expect(container.querySelectorAll('.tile').length).toBe(3);
    expect(screen.getByText('76 €')).toBeTruthy();
    expect(screen.getByText('por pagar')).toBeTruthy();
    expect(container.querySelectorAll('.tile-bar').length).toBe(1);
  });
  it('sem items não renderiza nada', () => {
    const { container } = render(<StatTiles items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
