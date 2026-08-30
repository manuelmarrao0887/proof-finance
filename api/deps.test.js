/* Guarda de regressão para a autenticação do proxy /api/ai.
 *
 * O `firebase-admin` verifica o ID-token através de `jwks-rsa`, que é CommonJS
 * e faz `require('jose')`. O `jose` a partir da v6 é ESM puro: num runtime Node
 * sem `require(esm)` isso rebenta com ERR_REQUIRE_ESM, o `verifyIdToken` falha
 * e o proxy devolve 401 a TODOS os pedidos — que o cliente mostra como
 * "Precisas de iniciar sessao para usar a IA.", mesmo com o utilizador
 * autenticado e o token válido.
 *
 * Aconteceu em produção a 2026-08-30. O `package.json` fixa `jose` na v5
 * (dual CJS/ESM) através de `overrides`. Estes testes falham se esse override
 * desaparecer ou se o `jose` voltar a resolver para o build ESM.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');

// Resolve `jose` exatamente como o jwks-rsa o faz: por require(), a partir do
// CommonJS dele.
function resolveJoseAsJwksRsaDoes() {
  return require_.resolve('jose', { paths: [path.join(ROOT, 'node_modules/jwks-rsa/src')] });
}

describe('dependencias do proxy /api/ai', () => {
  it('jwks-rsa carrega por require() sem rebentar', () => {
    expect(() => require_('jwks-rsa')).not.toThrow();
  });

  it('require("jose") resolve para um ficheiro CommonJS, nao ESM', () => {
    const entry = resolveJoseAsJwksRsaDoes();
    const head = readFileSync(entry, 'utf8').slice(0, 800);
    // Um build ESM comeca por import/export de topo; o CJS nao.
    const isESM = /^\s*(import|export)\s/m.test(head);
    expect(isESM, `jose resolveu para ESM (${entry}) — require() vai falhar em Node sem require(esm)`).toBe(false);
  });

  it('jose fica abaixo da v6 (a v6 e ESM-only)', () => {
    const pkg = require_(path.join(path.dirname(resolveJoseAsJwksRsaDoes()), '../../../package.json'));
    expect(pkg.name).toBe('jose');
    expect(Number(pkg.version.split('.')[0])).toBeLessThan(6);
  });

  it('a v5 do jose mantem as funcoes que o jwks-rsa usa', () => {
    const jose = require_(resolveJoseAsJwksRsaDoes());
    expect(typeof jose.importJWK).toBe('function');
    expect(typeof jose.exportSPKI).toBe('function');
  });

  it('o override esta declarado no package.json', () => {
    const pkg = require_(path.join(ROOT, 'package.json'));
    expect(pkg.overrides && pkg.overrides.jose).toBeTruthy();
  });
});
