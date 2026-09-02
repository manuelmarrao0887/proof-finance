import { describe, it, expect } from 'vitest';
import { BRANDS, normalizeMerchant, resolveBrand, resolveAsset, hashHue, ASSET_BRANDS } from './brands.jsx';

describe('brands: pack', () => {
  it('cada marca tem name, group, bg, fg, node e pelo menos um alias', () => {
    Object.entries(BRANDS).forEach(([id, b]) => {
      expect(b.name, id).toBeTruthy();
      expect(['merchant', 'bank', 'network', 'asset'], id).toContain(b.group);
      expect(b.bg, id).toBeTruthy();
      expect(b.fg, id).toBeTruthy();
      expect(b.node, id).toBeTruthy();
      expect(Array.isArray(b.match) && b.match.length > 0, id).toBe(true);
    });
  });
});

describe('brands: normalizeMerchant', () => {
  it('tira dígitos, pontuação, acentos e palavras de ruído', () => {
    expect(normalizeMerchant('COMPRA 4174 PINGO DOCE LISBOA')).toBe('pingo doce');
    expect(normalizeMerchant('NETFLIX.COM AMSTERDAM')).toBe('netflix amsterdam');
    expect(normalizeMerchant('Pagamento MB WAY Galp Alvalade')).toBe('galp alvalade');
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant(null)).toBe('');
  });
});

describe('brands: resolveBrand', () => {
  it('encontra comerciantes por alias, ignorando ruído', () => {
    expect(resolveBrand('COMPRA 4174 PINGO DOCE LISBOA')).toBe('pingodoce');
    expect(resolveBrand('Netflix')).toBe('netflix');
    expect(resolveBrand('NETFLIX.COM')).toBe('netflix');
    expect(resolveBrand('UBER *TRIP')).toBe('uber');
    expect(resolveBrand('UBER EATS')).toBe('ubereats');
    expect(resolveBrand('IKEA')).toBe('ikea');
  });
  it('encontra bancos e corretoras, inclusive em rótulos "Banco · Tipo"', () => {
    expect(resolveBrand('Activobank')).toBe('activobank');
    expect(resolveBrand('Activobank · Conta a Ordem')).toBe('activobank');
    expect(resolveBrand('Trade Republic · Poupanca')).toBe('traderepublic');
    expect(resolveBrand('Revolut · Cartão de Crédito')).toBe('revolut');
    expect(resolveBrand('XTB')).toBe('xtb');
  });
  it('devolve null sem marca conhecida', () => {
    expect(resolveBrand('Padaria Central Lda')).toBeNull();
    expect(resolveBrand('')).toBeNull();
    expect(resolveBrand(undefined)).toBeNull();
  });
  it('BPI não é BP', () => {
    expect(resolveBrand('BPI')).toBe('bpi');
    expect(resolveBrand('BP ALVALADE')).toBe('bp');
  });
});

describe('brands: resolveAsset', () => {
  it('mapeia tickers conhecidos e cai para resolveBrand', () => {
    expect(ASSET_BRANDS.VWCE).toBe('vanguard');
    expect(resolveAsset('VWCE')).toBe('vanguard');
    expect(resolveAsset('aapl')).toBe('apple');
    expect(resolveAsset('MSFT')).toBe('microsoft');
    expect(resolveAsset('Apple')).toBe('apple');
    expect(resolveAsset('ZZZZ')).toBeNull();
  });
});

describe('brands: hashHue', () => {
  it('é estável e fica em 0..359', () => {
    expect(hashHue('Padaria Central')).toBe(hashHue('Padaria Central'));
    expect(hashHue('Padaria Central')).not.toBe(hashHue('Talho Sousa'));
    for (const n of ['a', 'Padaria', 'x'.repeat(50), '']) {
      const h = hashHue(n);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});
