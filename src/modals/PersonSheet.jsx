/* ════════════════════════════════════════════════════════════════════════
   PersonSheet — gestão das pessoas dos grupos (contactos locais, sem conta).

   Sheet no padrão de src/modals/CatManagerModal.jsx: lista + formulário de
   adicionar/editar por baixo. useModal('person'); o payload não é usado (a
   sheet gere sempre TODAS as pessoas — não há um modo "editar uma específica"
   vindo de fora, à semelhança de CatManagerModal).

   - addPerson atribui a cor automaticamente (paleta AVATAR_COLORS, por ordem);
     aqui mostra-se uma pré-visualização dessa cor antes de guardar.
   - deletePerson devolve `false` quando a pessoa pertence a algum grupo (rede
     de segurança do store) — mostra-se o toast de bloqueio com o nome.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore, nextAvatarColor } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import Avatar from '../components/Avatar.jsx';

const EMPTY_DRAFT = { editId: null, name: '' };

/* Avatar decorativo (o nome está sempre escrito ao lado) sobre o componente
   partilhado — antes havia aqui uma cópia com outra regra de iniciais, e a
   mesma pessoa aparecia "MA" aqui e "MM" no cabeçalho. */
function PersonAvatar({ name, color, size = 30 }) {
  return <Avatar name={name} color={color || 'var(--fg-subtle)'} size={size} decorative />;
}

export default function PersonSheet() {
  const { isOpen, close } = useModal('person');
  const { state, actions } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const people = (state.people || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt'));
  const isEdit = !!draft.editId;
  // Cor que addPerson vai atribuir à próxima pessoa — mesma fórmula do store,
  // nunca reimplementada aqui (senão a pré-visualização podia divergir do
  // que fica realmente gravado).
  const nextColor = nextAvatarColor(state.people);
  const editingPerson = isEdit ? people.find((p) => p.id === draft.editId) : null;
  const previewColor = editingPerson ? editingPerson.color || nextColor : nextColor;

  const onClose = () => {
    setDraft(EMPTY_DRAFT);
    setError('');
    close();
  };

  const editPerson = (p) => {
    setDraft({ editId: p.id, name: p.name || '' });
    setError('');
  };

  const cancelEdit = () => {
    setDraft(EMPTY_DRAFT);
    setError('');
  };

  const savePerson = () => {
    const name = (draft.name || '').trim();
    if (!name) {
      setError('Escreve um nome.');
      return;
    }
    const dup = (state.people || []).some(
      (p) => p.id !== draft.editId && (p.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (dup) {
      setError('Já tens uma pessoa com esse nome.');
      return;
    }
    if (draft.editId) {
      actions.updatePerson(draft.editId, { name });
      toast('Pessoa atualizada', 'success');
    } else {
      actions.addPerson({ name });
      toast('Pessoa adicionada', 'success');
    }
    setDraft(EMPTY_DRAFT);
    setError('');
  };

  const removePerson = (p) => {
    if (typeof confirm === 'function' && !confirm('Apagar ' + p.name + '?')) return;
    const ok = actions.deletePerson(p.id);
    if (!ok) {
      toast(p.name + ' está em grupos — tira essa pessoa do grupo antes de apagar.', 'error');
      return;
    }
    if (draft.editId === p.id) {
      setDraft(EMPTY_DRAFT);
      setError('');
    }
    toast('Pessoa eliminada', 'success');
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border)',
    background: 'var(--elevated)',
    color: 'var(--fg)',
    borderRadius: 8,
    fontSize: 13,
    boxSizing: 'border-box',
  };

  return (
    <Sheet open={isOpen} onClose={onClose} title="Gerir pessoas">
      <div className="lb" style={{ marginBottom: 8 }}>{'Pessoas (' + people.length + ')'}</div>
      <div
        style={{
          maxHeight: '40dvh',
          overflow: 'auto',
          marginBottom: 18,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r2)',
        }}
      >
        {people.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>Ainda não tens pessoas.</div>
        ) : (
          people.map((p, i) => (
            <div
              key={p.id}
              className="rw"
              style={{ padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <PersonAvatar name={p.name} color={p.color} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => editPerson(p)}
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={'Editar ' + p.name}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removePerson(p)}
                  className="icon-btn"
                  style={{ width: 28, height: 28, color: 'var(--signal)' }}
                  aria-label={'Eliminar ' + p.name}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cd" style={{ padding: '14px 16px', background: 'var(--bg3)' }}>
        <div className="lb" style={{ marginBottom: 8 }}>{isEdit ? 'Editar pessoa' : 'Nova pessoa'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PersonAvatar name={draft.name} color={previewColor} />
          <div style={{ flex: 1 }}>
            <input
              value={draft.name}
              onChange={(e) => {
                setDraft((d) => ({ ...d, name: e.target.value }));
                setError('');
              }}
              placeholder="Nome"
              aria-label="Nome"
              style={inputStyle}
            />
          </div>
        </div>
        {error && <div style={{ color: 'var(--signal)', fontSize: 11, marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={savePerson}
            style={{ flex: 1, padding: '10px 0', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 'var(--r2)', cursor: 'pointer' }}
          >
            {isEdit ? 'Guardar' : 'Adicionar'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={cancelEdit}
              style={{ padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
