/* ════════════════════════════════════════════════════════════════════════
   Category manager modal — React port of rCatModal (orig 1818-1850) +
   editCat (orig 1851-1856), saveCat (orig 1857-1875), deleteCat (orig 1876-1882).

   Opened via the UI `cat` modal (useModal('cat')). Lists the budget categories,
   each with edit + (when not in use) delete; an inline add/edit form (name +
   limit) below. Uses actions.addCategory / updateCategory / deleteCategory.

   FIX 3: the list is rendered ALPHABETICALLY via sortedCats(state.bdg) — the
   original showed raw array order (orig 1827).

   "In use" (has spend in byC, an addedExp entry, or a recurring) categories
   cannot be deleted, only renamed — same guard as the original (orig 1828/1877).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fc } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { sortedCats, PICKER_ICONS, PICKER_COLORS, ICON_LABELS, COLOR_LABELS } from '../lib/categories.js';
import { byC } from '../lib/finance.js';

// Draft em branco (id/nm/lm + icon/color do seletor visual).
const BLANK = { id: '', nm: '', lm: '', icon: '', color: '' };

// In-use check (orig 1828) — preview spend (byC) OR an expense OR a recurring.
function isInUse(id, state) {
  const inByC = byC[id] && byC[id].some((v) => v > 0);
  const inExp = (state.addedExp || []).some((x) => x.cat === id);
  const inRec = (state.recurring || []).some((r) => r.cat === id);
  return !!(inByC || inExp || inRec);
}

export default function CatManagerModal() {
  const { isOpen, close } = useModal('cat');
  const { state, actions } = useStore();
  const toast = useToast();

  // Draft mirrors the original catDraft ({id,nm,lm}; editId present when editing)
  // + icon/color do seletor visual (Task 14).
  const [draft, setDraft] = useState(BLANK);
  const isEdit = !!draft.editId;

  const cats = useMemo(() => sortedCats(state.bdg), [state.bdg]); // FIX 3

  if (!isOpen) return null;

  const onClose = () => {
    setDraft(BLANK);
    close();
  };

  const editCat = (id) => {
    const b = (state.bdg || []).find((x) => x.id === id);
    if (!b) return;
    setDraft({ editId: b.id, id: b.id, nm: b.nm, lm: String(b.lm || 0), icon: b.icon || '', color: b.color || '' });
  };

  const saveCat = () => {
    const nm = (draft.nm || '').trim();
    let lm = parseFloat((draft.lm || '0').toString().replace(',', '.'));
    if (!nm) {
      toast('Nome obrigatório', 'error');
      return;
    }
    if (isNaN(lm) || lm < 0) lm = 0;
    if (draft.editId) {
      actions.updateCategory(draft.editId, { nm, lm, icon: draft.icon || '', color: draft.color || '' });
      setDraft(BLANK);
      toast('Categoria atualizada', 'success');
    } else {
      // Generate id from name (orig 1867-1868): a-z0-9, max 8 chars, de-duped.
      const bdg = state.bdg || [];
      let newId =
        nm
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 8) || 'cat' + Date.now().toString(36);
      let n = 1;
      while (bdg.find((x) => x.id === newId)) {
        newId = newId.substring(0, 7) + n;
        n++;
      }
      actions.addCategory({ id: newId, nm, lm, icon: draft.icon || '', color: draft.color || '' });
      setDraft(BLANK);
      toast('Categoria criada', 'success');
    }
  };

  const deleteCat = (id) => {
    if (isInUse(id, state)) {
      toast('Em uso — não pode eliminar', 'error');
      return;
    }
    actions.deleteCategory(id);
    if (draft.editId === id) setDraft(BLANK);
    toast('Categoria eliminada', 'success');
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border)',
    background: 'var(--elevated)',
    color: 'var(--fg)',
    borderRadius: 8,
    fontSize: 'var(--fs-input)',
    boxSizing: 'border-box',
  };

  return (
    <Sheet open={isOpen} onClose={onClose} title="Gerir categorias">
      {/* List (FIX 3 — alphabetical) */}
      <div className="lb" style={{ marginBottom: 8 }}>{'Categorias (' + cats.length + ')'}</div>
      <div style={{ maxHeight: '40dvh', overflow: 'auto', marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}>
        {cats.map((b, i) => {
          const inUse = isInUse(b.id, state);
          return (
            <div key={b.id} className="rw" style={{ padding: '10px 14px', gap: 10, borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <CategoryIcon id={b.id} size={30} bdg={cats} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.nm}</div>
                <div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                  {b.id + ' · limite ' + fc(b.lm || 0) + (inUse ? ' · em uso' : '')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => editCat(b.id)} className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Editar categoria">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                {!inUse && (
                  <button type="button" onClick={() => deleteCat(b.id)} className="icon-btn" style={{ width: 28, height: 28, color: 'var(--signal)' }} aria-label="Eliminar categoria">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / edit form */}
      <div className="cd" style={{ padding: '14px 16px', marginBottom: 14, background: 'var(--bg3)' }}>
        <div className="lb" style={{ marginBottom: 8 }}>{isEdit ? 'Editar' : 'Nova categoria'}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <input
              value={draft.nm}
              onChange={(e) => setDraft((p) => ({ ...p, nm: e.target.value }))}
              placeholder="Nome (ex: Viagens)"
              aria-label="Nome"
              style={inputStyle}
            />
          </div>
          <div style={{ width: 100 }}>
            <input
              value={draft.lm}
              onChange={(e) => setDraft((p) => ({ ...p, lm: e.target.value }))}
              placeholder="Limite"
              inputMode="decimal"
              aria-label="Limite"
              style={{ ...inputStyle, fontFamily: 'var(--mono)', fontWeight: 600, textAlign: 'center' }}
            />
          </div>
        </div>
        <div className="lb" style={{ marginBottom: 8 }}>Ícone</div>
        <div className="icon-grid">
          {PICKER_ICONS.map((ic) => (
            <button key={ic} type="button" aria-label={'Ícone ' + (ICON_LABELS[ic] || ic)} aria-pressed={draft.icon === ic} onClick={() => setDraft((p) => ({ ...p, icon: ic }))}>
              <Icon name={ic} size={18} />
            </button>
          ))}
        </div>
        <div className="lb" style={{ marginBottom: 8 }}>Cor</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {PICKER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={'Cor ' + (COLOR_LABELS[c] || c)}
              aria-pressed={draft.color === c}
              onClick={() => setDraft((p) => ({ ...p, color: c }))}
              style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: draft.color === c ? '3px solid var(--text)' : '3px solid transparent', padding: 0, cursor: 'pointer' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={saveCat}
          style={{ width: '100%', padding: '10px 0', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 'var(--r2)' }}
        >
          {isEdit ? 'Guardar' : 'Adicionar'}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => setDraft(BLANK)}
            style={{ width: '100%', padding: '8px 0', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 11, fontWeight: 600, marginTop: 4 }}
          >
            Cancelar edicao
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>
        Categorias em uso (com despesas ou recorrentes associadas) não podem ser eliminadas, apenas renomeadas.
      </div>
    </Sheet>
  );
}
