// iOS Safari amplia a página automaticamente ao focar um <input>/<textarea>/
// <select> cujo font-size computado seja inferior a 16px. O token base em
// tokens.css já garante 16px por omissão, mas muitos componentes sobrepunham
// esse valor com estilos inline menores (literais ou var(--fs-xs|sm|md), que
// valem 11/13/15px) — foi o que aconteceu no AssistantSheet (fontSize: 14 no
// <textarea>) e disparava o zoom ao abrir o assistente no iPhone, que ficava
// preso mesmo depois de fechar o sheet.
//
// Este teste lê todos os .jsx (não-teste) de src/, localiza cada elemento
// <input>/<textarea>/<select> e falha se:
//   1. tiver um fontSize numérico literal < 16 no seu style inline; ou
//   2. usar var(--fs-xs), var(--fs-sm) ou var(--fs-md) (11/13/15px); ou
//   3. espalhar (`...NOME`) um objeto de estilo top-level do mesmo ficheiro
//      cujo fontSize seja < 16 pelos mesmos critérios acima.
// Campos de montante grande (ex: monoBig / var(--fs-2xl), 28px) continuam
// válidos — só o piso de 16px é exigido.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const dir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(dir, '../');

function listJsxFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listJsxFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.jsx') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

// Extrai objetos de estilo top-level ("const NOME = { ... };") com contagem
// de chavetas balanceada. Um regex não-greedy simples (`{[\s\S]*?}`) falha
// quando um objeto de UMA linha (ex: "const monoBig = { ...inputStyle,
// fontSize: 17 };") está entre dois objetos multi-linha — a expansão lazy
// "engole" o objeto seguinte à procura do próximo "\n};".
function extractTopLevelStyleObjects(src) {
  const objects = {};
  const re = /const\s+(\w+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const start = re.lastIndex - 1; // posição do '{' de abertura
    let depth = 0;
    let i = start;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    objects[name] = src.slice(start, i);
    re.lastIndex = i;
  }
  return objects;
}

function hasFontSizeBelow16(text) {
  const literal = text.match(/fontSize:\s*'?(\d+(?:\.\d+)?)/);
  if (literal && parseFloat(literal[1]) < 16) return true;
  if (/var\(--fs-(xs|sm|md)\)/.test(text)) return true;
  return false;
}

// Elemento <input|textarea|select> até ao seu fecho ("/>" ou ">"). Um "<...>"
// isolado também ocorre dentro de arrow functions em atributos (ex:
// `onChange={(e) => ...}`), por isso o lookbehind negativo evita terminar o
// match nesse "=>" antes de chegar ao style/fontSize real do elemento.
const ELEMENT_RE = /<(input|textarea|select)\b[\s\S]*?(\/>|(?<!=)>)/g;

const files = listJsxFiles(srcRoot);

describe('inputs a 16px — fix do zoom automático do iOS Safari (T47.17)', () => {
  it('tokens.css declara --fs-input:16px', () => {
    const css = fs.readFileSync(path.resolve(srcRoot, 'styles/tokens.css'), 'utf8');
    expect(css).toMatch('--fs-input:16px');
  });

  it('nenhum <input>/<textarea>/<select> usa fontSize abaixo de 16px', () => {
    const offenders = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(srcRoot, file);

      const badObjects = new Set();
      for (const [name, body] of Object.entries(extractTopLevelStyleObjects(src))) {
        if (hasFontSizeBelow16(body)) badObjects.add(name);
      }

      const re = new RegExp(ELEMENT_RE);
      let m;
      while ((m = re.exec(src))) {
        const tag = m[0];
        let bad = hasFontSizeBelow16(tag);
        if (!bad) {
          for (const name of badObjects) {
            if (tag.includes('...' + name)) {
              bad = true;
              break;
            }
          }
        }
        if (bad) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(rel + ':' + line);
        }
      }
    }

    expect(offenders, 'ofensores (font-size < 16px em input/textarea/select):\n' + offenders.join('\n')).toEqual([]);
  });
});
