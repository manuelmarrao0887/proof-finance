/* ════════════════════════════════════════════════════════════════════════
   RulesModal — React port of rRulesModal (orig 1748-1783) + addRule/deleteRule/
   applyRulesToExisting (1784-1808).

   Auto-categorization rules: a new-rule form (pattern + category) and a list of
   existing rules with delete. "Aplicar regras a despesas existentes" re-runs
   applyRules over addedExp and commits via setAddedExp.

   FIX 3: the category <select> uses sortedCats(state.bdg) (alphabetical).
   useModal('rules'). Uses addRule/deleteRule.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';
import { sortedCats } from '../lib/categories.js';
import { applyRules } from '../lib/finance.js';

export default function RulesModal() {
  const { state, actions, currentUser } = useStore();
  const { isOpen, close } = useModal('rules');
  const toast = useToast();

  const bdg = state.bdg || [];
  const rules = state.rules || [];
  const cats = useMemo(() => sortedCats(bdg), [bdg]);

  const [pattern, setPattern] = useState('');
  const [cat, setCat] = useState('');

  // Default the category select to the first (alphabetical) category on open.
  useEffect(() => {
    if (!isOpen) return;
    setPattern('');
    setCat((cats[0] && cats[0].id) || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const addRule = () => {
    const pat = pattern.trim();
    if (!pat) {
      toast('Padrao obrigatório', 'error');
      return;
    }
    const c = cat || (cats[0] && cats[0].id) || 'out';
    actions.addRule({ id: uid(), pattern: pat, cat: c, createdAt: Date.now() });
    setPattern('');
    setCat(c);
    toast('Regra criada', 'success');
  };

  const deleteRule = (id) => {
    // Original used scheduleUndo; React port deletes immediately (no undo host).
    actions.deleteRule(id);
    toast('Regra eliminada', 'success');
  };

  const applyRulesToExisting = () => {
    const s = { ...actions.getState(), currentUser };
    const list = s.addedExp || [];
    let changed = 0;
    const next = list.map((x) => {
      const newCat = applyRules(s, x.desc);
      if (newCat && newCat !== x.cat) {
        changed++;
        return { ...x, cat: newCat };
      }
      return x;
    });
    if (changed > 0) {
      actions.setAddedExp(next);
      toast(changed + ' despesas recategorizadas', 'success');
    } else {
      toast('Nada para mudar', 'success');
    }
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onClose={close} title="Regras">
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55, marginBottom: 18 }}>
        Se uma descrição contiver o padrao definido, a categoria sera aplicada automaticamente a novas despesas e importacoes.
      </div>

      {/* New rule form */}
      <div className="cd" style={{ padding: 14, marginBottom: 18, background: 'var(--elevated)' }}>
        <div className="lb" style={{ marginBottom: 10 }}>Nova regra</div>
        <input
          id="ruPat"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="Ex: pingo doce, spotify, uber"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            id="ruCat"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', borderRadius: 8, fontSize: 14 }}
          >
            {cats.map((b) => (
              <option key={b.id} value={b.id}>{b.nm}</option>
            ))}
          </select>
          <button type="button" onClick={addRule} style={{ padding: '10px 16px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
            Adicionar
          </button>
        </div>
      </div>

      {/* Existing rules */}
      {rules.length === 0 ? (
        <div className="empty" style={{ padding: '20px 0', color: 'var(--fg-subtle)', textAlign: 'center', fontSize: 13 }}>
          Sem regras ainda
        </div>
      ) : (
        <>
          <div className="lb" style={{ marginBottom: 10 }}>
            {rules.length} regra{rules.length === 1 ? '' : 's'}
          </div>
          {rules.map((r) => {
            const c = bdg.find((b) => b.id === r.cat);
            return (
              <div key={r.id} className="rw" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    se contem "<span className="m">{r.pattern}</span>"
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>&rarr; {c ? c.nm : r.cat}</div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteRule(r.id)}
                  className="icon-btn"
                  style={{ width: 30, height: 30, color: 'var(--danger)' }}
                  aria-label="Eliminar regra"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={applyRulesToExisting}
            style={{ width: '100%', padding: '12px 0', marginTop: 18, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}
          >
            Aplicar regras a despesas existentes
          </button>
        </>
      )}
    </Sheet>
  );
}
