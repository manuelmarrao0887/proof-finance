import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../firebase/client.js', () => ({
  getIdToken: () => Promise.resolve('tok-123'),
}));

import { toOpenAIContent, chat, callAIRaw, TIER_FOR_MODEL, buildAIContext } from './ai.js';

function mockFetchOnce(payload, ok = true, status = 200) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    })
  );
}

beforeEach(() => {
  global.fetch = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('toOpenAIContent', () => {
  it('passa texto por uma string simples quando e o unico bloco', () => {
    expect(toOpenAIContent('ola')).toBe('ola');
  });
  it('traduz um bloco de texto', () => {
    expect(toOpenAIContent([{ type: 'text', text: 'ola' }])).toEqual([{ type: 'text', text: 'ola' }]);
  });
  it('traduz uma imagem base64 para image_url com data URI', () => {
    const out = toOpenAIContent([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
    ]);
    expect(out[0].type).toBe('image_url');
    expect(out[0].image_url.url).toBe('data:image/jpeg;base64,AAA');
  });
  it('traduz um PDF para o bloco file', () => {
    const out = toOpenAIContent([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } },
    ]);
    expect(out[0].type).toBe('file');
    expect(out[0].file.file_data).toBe('data:application/pdf;base64,BBB');
    expect(out[0].file.filename).toBe('documento.pdf');
  });
});

describe('TIER_FOR_MODEL', () => {
  it('manda modelos de documento para strong', () => {
    expect(TIER_FOR_MODEL('claude-sonnet-5')).toBe('strong');
    expect(TIER_FOR_MODEL('claude-opus-5')).toBe('strong');
  });
  it('manda o resto para fast', () => {
    expect(TIER_FOR_MODEL('claude-haiku-4-5')).toBe('fast');
    expect(TIER_FOR_MODEL(undefined)).toBe('fast');
  });
});

describe('chat', () => {
  it('envia messages, tools e tier com o ID-token', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 5 } });
    const msgs = [{ role: 'user', content: 'ola' }];
    const out = await chat(msgs, { tools: [{ type: 'function' }], tier: 'strong', maxTokens: 1000 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/ai');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
    const body = JSON.parse(opts.body);
    expect(body.messages).toEqual(msgs);
    expect(body.tier).toBe('strong');
    expect(body.tools).toHaveLength(1);
    expect(body.max_tokens).toBe(1000);
    expect(out.usage.total_tokens).toBe(5);
  });

  it('traduz erros conhecidos do upstream para PT', async () => {
    mockFetchOnce({ error: 'upstream', status: 402 }, false, 402);
    await expect(chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/creditos/i);
  });

  it('traduz 429 para uma mensagem de excesso de pedidos', async () => {
    mockFetchOnce({ error: 'upstream', status: 429 }, false, 429);
    await expect(chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/pedidos/i);
  });
});

describe('callAIRaw (compatibilidade)', () => {
  it('devolve a forma antiga com content[] de blocos de texto', async () => {
    mockFetchOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { total_tokens: 9 },
    });
    const d = await callAIRaw('analisa isto', 'sys', 'claude-haiku-4-5', 2000);
    expect(d.content).toEqual([{ type: 'text', text: '{"ok":true}' }]);
    expect(d.usage.total_tokens).toBe(9);
  });

  it('poe o system prompt como primeira mensagem', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'x' } }] });
    await callAIRaw('cmd', 'as instrucoes', 'claude-haiku-4-5', 500);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'as instrucoes' });
    expect(body.messages[1].role).toBe('user');
  });
});

describe('buildAIContext', () => {
  const state = {
    addedExp: [
      { id: 'e1', desc: 'Pingo Doce', amount: 45.2, cat: 'sup', date: new Date().toISOString().slice(0, 10) },
    ],
    bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500 }],
    incomes: [], recurring: [], customAccts: [], dynAccts: null, dynSnaps: [], rules: [],
    people: [{ id: 'p1', name: 'Ana' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1'] }],
    groupEntries: [],
  };

  it('inclui a data de hoje em ISO', () => {
    expect(buildAIContext(state).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('inclui agregados patrimoniais', () => {
    const c = buildAIContext(state);
    expect(typeof c.netWorth).toBe('number');
    expect(typeof c.totalAssets).toBe('number');
  });
  it('inclui orcamento do mes com gasto', () => {
    const c = buildAIContext(state);
    expect(c.budget.find((b) => b.id === 'sup').spent).toBe(45.2);
  });
  it('inclui contagens em vez de listas de despesas', () => {
    const c = buildAIContext(state);
    expect(c.counts.expenses).toBe(1);
    expect(JSON.stringify(c)).not.toContain('Pingo Doce');
  });
  it('inclui nomes de grupos e pessoas com os ids', () => {
    const c = buildAIContext(state);
    expect(c.groups).toContainEqual({ id: 'gr1', name: 'Algarve' });
    expect(c.people).toContainEqual({ id: 'p1', name: 'Ana' });
  });
  it('fica bem abaixo de 8000 caracteres', () => {
    expect(JSON.stringify(buildAIContext(state)).length).toBeLessThan(8000);
  });
  it('aguenta um estado vazio', () => {
    expect(() => buildAIContext({})).not.toThrow();
  });
});
