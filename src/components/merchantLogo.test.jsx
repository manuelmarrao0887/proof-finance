import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MerchantLogo, { BankLogo, AssetLogo, Initial, BrandMark } from './MerchantLogo.jsx';

afterEach(() => cleanup());

describe('MerchantLogo', () => {
  it('com marca conhecida mostra o logo e a categoria como badge', () => {
    const { container } = render(<MerchantLogo text="COMPRA 4174 PINGO DOCE LISBOA" cat="sup" size={40} />);
    expect(screen.getByRole('img', { name: 'Pingo Doce' })).toBeTruthy();
    expect(container.querySelector('.mlogo-badge')).toBeTruthy();
  });
  it('sem marca mas com categoria cai para o CategoryIcon (sem role img de marca)', () => {
    const { container } = render(<MerchantLogo text="Padaria Central" cat="rest" size={40} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.mlogo')).toBeNull();
    expect(container.firstChild.tagName).toBe('DIV'); // CategoryIcon é um <div> circular
  });
  it('sem marca nem categoria cai para a inicial com o nome acessível', () => {
    render(<MerchantLogo text="Padaria Central" size={40} />);
    const el = screen.getByRole('img', { name: 'Padaria Central' });
    expect(el.textContent).toBe('P');
  });
});

describe('BankLogo / AssetLogo / Initial / BrandMark', () => {
  it('BankLogo resolve o banco a partir do rótulo "Banco · Tipo"', () => {
    render(<BankLogo bank="Activobank · Conta a Ordem" />);
    expect(screen.getByRole('img', { name: 'ActivoBank' })).toBeTruthy();
  });
  it('BankLogo sem marca mostra a inicial', () => {
    render(<BankLogo bank="Banco Teste" />);
    expect(screen.getByRole('img', { name: 'Banco Teste' }).textContent).toBe('B');
  });
  it('AssetLogo resolve tickers', () => {
    render(<AssetLogo ticker="VWCE" />);
    expect(screen.getByRole('img', { name: 'Vanguard' })).toBeTruthy();
  });
  it('Initial usa "?" para nome vazio', () => {
    render(<Initial name="" />);
    expect(screen.getByRole('img').textContent).toBe('?');
  });
  it('BrandMark com id desconhecido não renderiza nada', () => {
    const { container } = render(<BrandMark id="nope" />);
    expect(container.firstChild).toBeNull();
  });
});
