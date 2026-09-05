// Escala de espaçamento e de tipo (Task 13) — garante que os tokens estão
// declarados em tokens.css e que os ficheiros migrados não voltam a usar
// literais numéricos em fontSize/padding/margin/gap.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../');
const read = (p) =>
  fs
    .readFileSync(path.resolve(root, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const FILES = [
  'views/OverviewView.jsx',
  'views/ExpensesView.jsx',
  'views/GoalsView.jsx',
  'views/CardsView.jsx',
  'views/TransactionsView.jsx',
  'modals/AddExpenseSheet.jsx',
  'modals/GoalModal.jsx',
  'modals/AcctModal.jsx',
  'components/SpendHero.jsx',
  'components/overview/AccountsByCategory.jsx',
  'components/overview/ClosingCard.jsx',
  'components/overview/EmergencyFundCard.jsx',
  'components/overview/HealthCard.jsx',
  'components/overview/ProjectionCard.jsx',
  'components/overview/SubscriptionsCard.jsx',
];

describe('escala de design', () => {
  it('tokens declarados', () => {
    const css = read('styles/tokens.css');
    for (const t of ['--space-1', '--space-4', '--space-8', '--fs-xs', '--fs-md', '--fs-3xl']) {
      expect(css).toMatch(t + ':');
    }
  });

  for (const f of FILES) {
    it(f + ' sem fontSize/padding/margin/gap numéricos', () => {
      const src = read(f);
      expect(src.match(/fontSize:\s*\d/g) || [], 'fontSize').toEqual([]);
      expect(src.match(/(padding|margin|gap)(Top|Bottom|Left|Right)?:\s*'?\d/g) || [], 'spacing').toEqual([]);
      // Catch numeric branches in ternary expressions for spacing (second branch)
      expect(src.match(/(padding|margin|gap)(Top|Bottom|Left|Right)?:\s*[^,}\n]*\?\s*[^:\n]*:\s*'?(?!0\b)\d/g) || [], 'spacing ternary 2nd branch').toEqual([]);
      // Catch numeric branches in ternary expressions for spacing (first branch)
      expect(src.match(/(padding|margin|gap)(Top|Bottom|Left|Right)?:\s*[^,}\n]*\?\s*'?(?!0\b)\d/g) || [], 'spacing ternary 1st branch').toEqual([]);
      // Catch numeric branches in ternary expressions for fontSize (second branch)
      expect(src.match(/fontSize:\s*[^,}\n]*\?\s*[^:\n]*:\s*'?(?!0\b)\d/g) || [], 'fontSize ternary 2nd branch').toEqual([]);
      // Catch numeric branches in ternary expressions for fontSize (first branch)
      expect(src.match(/fontSize:\s*[^,}\n]*\?\s*'?(?!0\b)\d/g) || [], 'fontSize ternary 1st branch').toEqual([]);
    });
  }
});
