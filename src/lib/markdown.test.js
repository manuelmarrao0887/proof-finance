import { describe, it, expect } from 'vitest';
import { renderMD, esc } from './markdown.js';

describe('esc', () => {
  it('escapa os caracteres de markup', () => {
    expect(esc('<script>alert("x")&</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&lt;/script&gt;'
    );
  });
});

describe('renderMD', () => {
  it('devolve vazio para entrada vazia', () => {
    expect(renderMD('')).toBe('');
    expect(renderMD(null)).toBe('');
  });
  it('escapa HTML vindo do modelo antes de formatar', () => {
    expect(renderMD('<img src=x onerror=1>')).not.toContain('<img');
  });
  it('converte negrito', () => {
    expect(renderMD('**total**')).toContain('<b>total</b>');
  });
  it('converte codigo inline', () => {
    expect(renderMD('`sup`')).toContain('<code');
  });
  it('converte tabelas markdown em <table>', () => {
    const md = '| Cat | Valor |\n| --- | --- |\n| sup | 45,20 |';
    const out = renderMD(md);
    expect(out).toContain('<table');
    expect(out).toContain('<th');
    expect(out).toContain('45,20');
  });
  it('converte listas', () => {
    expect(renderMD('- um\n- dois')).toContain('&bull;');
  });
});
