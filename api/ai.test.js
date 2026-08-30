import { describe, it, expect } from 'vitest';
import {
  MODEL_TIERS,
  MAX_TOKENS_CAP,
  MAX_TOOL_CALLS,
  resolveModel,
  capToolCalls,
  sanitizeRequest,
} from './ai.js';

describe('resolveModel', () => {
  it('resolve os dois tiers conhecidos', () => {
    expect(resolveModel('fast')).toBe('google/gemini-3.5-flash-lite');
    expect(resolveModel('strong')).toBe('google/gemini-3.7-flash');
  });
  it('cai em fast para tier desconhecido, vazio ou ausente', () => {
    expect(resolveModel('gpt-5')).toBe(MODEL_TIERS.fast);
    expect(resolveModel('')).toBe(MODEL_TIERS.fast);
    expect(resolveModel(undefined)).toBe(MODEL_TIERS.fast);
  });
  it('nao aceita um id de modelo cru vindo do cliente', () => {
    expect(resolveModel('google/gemini-3.7-flash')).toBe(MODEL_TIERS.fast);
  });
});

describe('capToolCalls', () => {
  it('corta acima do limite', () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i }));
    const out = capToolCalls({ role: 'assistant', tool_calls: calls });
    expect(out.tool_calls).toHaveLength(MAX_TOOL_CALLS);
    expect(out.tool_calls[0].id).toBe('t0');
  });
  it('deixa passar mensagens sem tool_calls', () => {
    const msg = { role: 'assistant', content: 'ola' };
    expect(capToolCalls(msg)).toBe(msg);
  });
});

describe('sanitizeRequest', () => {
  const base = { messages: [{ role: 'user', content: 'ola' }] };

  it('devolve o modelo do tier e as mensagens', () => {
    const out = sanitizeRequest({ ...base, tier: 'strong' });
    expect(out.model).toBe(MODEL_TIERS.strong);
    expect(out.messages).toEqual(base.messages);
  });
  it('limita max_tokens ao teto', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 99999 }).max_tokens).toBe(MAX_TOKENS_CAP);
  });
  it('impoe um minimo de 256 tokens', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 10 }).max_tokens).toBe(256);
  });
  it('rejeita mensagens em falta com status 400', () => {
    expect(() => sanitizeRequest({})).toThrow(/messages/);
    try {
      sanitizeRequest({ messages: [] });
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });
  it('rejeita roles desconhecidos', () => {
    expect(() => sanitizeRequest({ messages: [{ role: 'root', content: 'x' }] })).toThrow();
  });
  it('rejeita corpos gigantes com status 413', () => {
    const huge = { messages: [{ role: 'user', content: 'x'.repeat(3_000_001) }] };
    try {
      sanitizeRequest(huge);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.status).toBe(413);
    }
  });
  it('so deixa passar tools quando sao um array', () => {
    expect(sanitizeRequest({ ...base, tools: 'nope' }).tools).toBeUndefined();
    expect(sanitizeRequest({ ...base, tools: [{ type: 'function' }] }).tools).toHaveLength(1);
  });
  it('conta os tools no limite de tamanho do corpo', () => {
    const body = {
      messages: [{ role: 'user', content: 'ola' }],
      tools: [{ type: 'function', function: { name: 'x', description: 'y'.repeat(3_000_001) } }],
    };
    try {
      sanitizeRequest(body);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.status).toBe(413);
    }
  });
});
