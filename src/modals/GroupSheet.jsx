/* ════════════════════════════════════════════════════════════════════════
   GroupSheet — criar/editar um grupo de despesas partilhadas.

   Sheet no padrão de src/modals/GoalModal.jsx. useModal('group'); payload
   {id} (ou o próprio grupo, que também tem .id) abre em edição — sem payload
   (true) cria um grupo novo. addGroup já garante memberIds = ['me', ...] (não
   se reimplementa aqui); o chip "Tu" fica só visual, fixo e não clicável.

   Dois cuidados que não são só validação de formulário:

   - Remover um membro cujo id ainda aparece nas entradas do grupo (payerId,
     shares, fromId/toId de um acerto) quebra o invariante de soma-zero de
     computeBalances — bloqueia-se com um toast antes de tocar em memberIds.
   - O toggle "Refletir a minha parte nas Despesas", em edição, aplica-se de
     imediato via setGroupReflect (não fica à espera do "Guardar alterações")
     e avisa sempre quantos movimentos pessoais isso vai criar/apagar antes de
     confirmar.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore, ME_ID } from '../store/store.jsx';
import { useUI, useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { PrimaryButton, SecondaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';

const EMOJIS = ['🏖️', '🏠', '🎂', '🍽️', '✈️', '⛰️', '🎿', '👥'];
const TYPES = [
  { id: 'trip', label: 'Viagem' },
  { id: 'home', label: 'Casa' },
  { id: 'event', label: 'Evento' },
  { id: 'other', label: 'Outro' },
];

const EMPTY = {
  id: null,
  name: '',
  emoji: '👥',
  type: 'trip',
  currency: 'EUR',
  start: '',
  end: '',
  memberIds: [ME_ID],
  reflectMine: true,
  archived: false,
};

// Quantas entradas o toggle vai mexer, para os dois sentidos:
//   - a ligar (on=true): mesma regra de reflectExpenseFor (store.jsx) — só o
//     que tem reflect !== false e uma parte > 0 do próprio utilizador ('me'),
//     porque é isso que vai passar a ter um movimento criado.
//   - a desligar (on=false): setGroupReflect só apaga o que JÁ TEM
//     linkedExpId (mov fica sempre null com o grupo a não refletir, e só
//     `!mov && e.linkedExpId` dispara o apagar) — contar por reflect+share
//     aqui prometia mais apagões do que os que realmente aconteciam sempre
//     que uma despesa "deveria" refletir mas o movimento ligado já tinha
//     desaparecido por outra via (ex.: reconciliação de linkedExpId órfão).
function reflectableCount(entries, on) {
  return (entries || []).filter((e) => {
    if (!e || e.kind === 'settlement') return false;
    if (on === false) return !!e.linkedExpId;
    if (e.reflect === false) return false;
    const mine = (e.shares || []).find((s) => s.personId === ME_ID);
    return !!(mine && Number(mine.amount) > 0);
  }).length;
}

// Uma pessoa "presa" ao grupo: aparece nalguma entrada como pagador, parte de
// uma despesa, ou lado de um acerto. Removê-la sem apagar essas entradas
// primeiro deixava dinheiro a desaparecer de computeBalances.
function personLockedIn(entries, personId) {
  return (entries || []).some(
    (e) =>
      e.payerId === personId ||
      (e.shares || []).some((s) => s.personId === personId) ||
      e.fromId === personId ||
      e.toId === personId
  );
}

export default function GroupSheet() {
  const { state, actions } = useStore();
  const { open } = useUI();
  const { isOpen, payload, close } = useModal('group');
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY);
  // Valor (true/false) do toggle "Refletir" ainda por confirmar — null =
  // nada pendente. Ver requestReflectToggle/applyReflectToggle.
  const [reflectPending, setReflectPending] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setReflectPending(null);
    const id = payload && typeof payload === 'object' ? payload.id : null;
    if (id) {
      const g = (state.groups || []).find((x) => x.id === id);
      if (g) {
        setDraft({
          id: g.id,
          name: g.name || '',
          emoji: g.emoji || '👥',
          type: g.type || 'trip',
          currency: g.currency || 'EUR',
          start: g.start || '',
          end: g.end || '',
          memberIds: Array.isArray(g.memberIds) && g.memberIds.length ? g.memberIds : [ME_ID],
          reflectMine: g.reflectMine !== false,
          archived: !!g.archived,
        });
        return;
      }
    }
    setDraft(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  const isEdit = !!draft.id;
  const people = useMemo(
    () => (state.people || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt')),
    [state.people]
  );
  const currencies = useMemo(() => {
    const keys = Object.keys(state.fxRates || {});
    return keys.length ? keys : ['EUR'];
  }, [state.fxRates]);
  const entriesForGroup = useMemo(
    () => (state.groupEntries || []).filter((e) => e.groupId === draft.id),
    [state.groupEntries, draft.id]
  );

  if (!isOpen) return null;

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  function toggleMember(personId) {
    const inGroup = draft.memberIds.includes(personId);
    if (inGroup) {
      if (personLockedIn(entriesForGroup, personId)) {
        const name = (people.find((p) => p.id === personId) || {}).name || 'Esta pessoa';
        toast(name + ' já tem movimentos neste grupo — apaga-os primeiro para poderes remover esta pessoa.', 'error');
        return;
      }
      set('memberIds', draft.memberIds.filter((id) => id !== personId));
    } else {
      set('memberIds', [...draft.memberIds, personId]);
    }
  }

  // O toggle já não aplica de imediato num grupo existente: o clique só
  // "arma" (mostra a explicação com a contagem, inline, mais o ConfirmButton
  // — Task 8, fim do confirm() nativo); só o segundo toque no ConfirmButton
  // chama setGroupReflect. Sem entradas ligadas ao grupo (grupo novo, ainda
  // sem draft.id), continua a aplicar-se logo — não há nada para confirmar.
  function requestReflectToggle(on) {
    if (!draft.id) {
      set('reflectMine', on);
      return;
    }
    if (on === draft.reflectMine) return;
    setReflectPending(on);
  }
  function reflectMsg(on) {
    const count = reflectableCount(entriesForGroup, on);
    const noun = count === 1 ? 'movimento' : 'movimentos';
    return on ? `Isto vai criar ${count} ${noun} nas tuas Despesas.` : `Isto vai apagar ${count} ${noun} das tuas Despesas.`;
  }
  function applyReflectToggle() {
    if (reflectPending == null) return;
    const on = reflectPending;
    actions.setGroupReflect(draft.id, on);
    set('reflectMine', on);
    toast(on ? 'Despesas do grupo refletidas nas tuas Despesas' : 'Movimentos removidos das tuas Despesas', 'success');
    setReflectPending(null);
  }

  function saveGroup() {
    const name = (draft.name || '').trim();
    if (!name) {
      toast('Dá um nome ao grupo.', 'error');
      return;
    }
    if ((draft.memberIds || []).length < 2) {
      toast('Um grupo precisa de pelo menos mais uma pessoa.', 'error');
      return;
    }
    const partial = {
      name,
      emoji: draft.emoji,
      type: draft.type,
      currency: draft.currency,
      start: draft.start || null,
      end: draft.end || null,
      memberIds: draft.memberIds,
    };
    if (draft.id) {
      actions.updateGroup(draft.id, partial);
      toast('Grupo atualizado', 'success');
    } else {
      actions.addGroup({ ...partial, reflectMine: draft.reflectMine });
      toast('Grupo criado', 'success');
    }
    close();
  }

  function handleArchiveToggle() {
    if (!draft.id) return;
    const next = !draft.archived;
    actions.archiveGroup(draft.id, next);
    set('archived', next);
    toast(next ? 'Grupo arquivado' : 'Grupo reativado', 'success');
  }

  // Contagem mostrada ANTES do ConfirmButton (era o texto do confirm()
  // nativo — fica inline agora, ConfirmButton só faz o dois-toques).
  const deleteGroupCount = entriesForGroup.length;
  const deleteGroupLinkedCount = entriesForGroup.filter((e) => e.linkedExpId).length;
  function handleDeleteGroup() {
    if (!draft.id) return;
    // deleteGroup (store.jsx) apaga groups + groupEntries e, quando há
    // movimentos refletidos (linkedExpId), também addedExp — as 3 fatias têm
    // de ir no snapshot ou o Anular ressuscita entradas de grupo a apontar
    // para despesas que ficaram apagadas.
    const snap = snapshotSlices(actions.getState(), ['groups', 'groupEntries', 'addedExp']);
    actions.deleteGroup(draft.id);
    close();
    toast('Grupo eliminado', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    borderRadius: 'var(--r2)',
    fontSize: 15,
    boxSizing: 'border-box',
  };
  const selectStyle = { ...inputStyle, fontSize: 14 };

  const footer = (
    <>
      <PrimaryButton onClick={saveGroup}>{isEdit ? 'Guardar alterações' : 'Criar grupo'}</PrimaryButton>
      {isEdit && (
        <>
          {deleteGroupCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              {'Apagar remove ' + deleteGroupCount + (deleteGroupCount === 1 ? ' movimento' : ' movimentos') + ' do grupo'
                + (deleteGroupLinkedCount > 0 ? ' (incluindo ' + deleteGroupLinkedCount + (deleteGroupLinkedCount === 1 ? ' movimento' : ' movimentos') + ' nas tuas Despesas)' : '')
                + '. Não é possível desfazer.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <SecondaryButton onClick={handleArchiveToggle} style={{ flex: 1, color: 'var(--text2)' }}>
              {draft.archived ? 'Reativar' : 'Arquivar'}
            </SecondaryButton>
            <ConfirmButton label="Apagar grupo" confirmLabel="Confirmar" onConfirm={handleDeleteGroup} style={{ flex: 1 }} />
          </div>
        </>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar grupo' : 'Novo grupo'} footer={footer}>
      <div className="lb" style={{ marginBottom: 6 }}>Nome</div>
      <input
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Ex: Férias Algarve"
        aria-label="Nome"
        style={{ ...inputStyle, marginBottom: 16 }}
      />

      <div className="lb" style={{ marginBottom: 8 }}>Emoji</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => set('emoji', em)}
            aria-label={'Emoji ' + em}
            aria-pressed={draft.emoji === em}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: draft.emoji === em ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: draft.emoji === em ? 'var(--bg3)' : 'var(--surface)',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {em}
          </button>
        ))}
      </div>

      <div className="lb" style={{ marginBottom: 8 }}>Tipo</div>
      <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 'var(--r2)', padding: 3, marginBottom: 16, gap: 2 }}>
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => set('type', t.id)}
            aria-pressed={draft.type === t.id}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              borderRadius: 9,
              background: draft.type === t.id ? 'var(--bg2)' : 'transparent',
              color: draft.type === t.id ? 'var(--text)' : 'var(--text2)',
              fontSize: 12,
              fontWeight: 600,
              boxShadow: draft.type === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Moeda</div>
      <select
        value={draft.currency}
        onChange={(e) => set('currency', e.target.value)}
        aria-label="Moeda"
        style={{ ...selectStyle, marginBottom: 16 }}
      >
        {currencies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* minWidth:0 — sem isto os <input type=date> impõem a largura intrínseca
          deles e a linha passava dos 320px de ecrã (scroll horizontal). */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Início (opcional)</div>
          <input
            type="date"
            value={draft.start}
            onChange={(e) => set('start', e.target.value)}
            aria-label="Data de início"
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 14 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Fim (opcional)</div>
          <input
            type="date"
            value={draft.end}
            onChange={(e) => set('end', e.target.value)}
            aria-label="Data de fim"
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 14 }}
          />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 8 }}>Membros</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 14px',
            borderRadius: 999,
            background: 'var(--primary)',
            color: 'var(--bg)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Tu
        </span>
        {people.map((p) => {
          const active = draft.memberIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleMember(p.id)}
              aria-pressed={active}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid ' + (active ? p.color || 'var(--primary)' : 'var(--border)'),
                background: active ? p.color || 'var(--primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => open('person')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--text2)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Nova pessoa
        </button>
      </div>

      <div className="rw" style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 'var(--r2)', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Refletir a minha parte nas Despesas</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
            Cria um movimento pessoal por cada despesa deste grupo
          </div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={draft.reflectMine}
            aria-label="Refletir a minha parte nas Despesas"
            onChange={(e) => requestReflectToggle(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              cursor: 'pointer',
              inset: 0,
              background: draft.reflectMine ? 'var(--blue)' : 'var(--border)',
              borderRadius: 26,
              transition: '0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                height: 20,
                width: 20,
                left: draft.reflectMine ? 21 : 3,
                bottom: 3,
                background: '#fff',
                borderRadius: '50%',
                transition: '0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </span>
        </label>
      </div>
      {reflectPending != null && (
        <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 'var(--r2)', marginBottom: 4 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 8px' }}>{reflectMsg(reflectPending)}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConfirmButton
              label={reflectPending ? 'Ligar' : 'Desligar'}
              confirmLabel="Confirmar"
              danger={!reflectPending}
              onConfirm={applyReflectToggle}
              style={{ flex: 1 }}
            />
            <SecondaryButton onClick={() => setReflectPending(null)} style={{ flex: 1, color: 'var(--text2)' }}>
              Cancelar
            </SecondaryButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
