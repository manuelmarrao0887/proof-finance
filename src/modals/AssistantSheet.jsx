/* ════════════════════════════════════════════════════════════════════════
   AssistantSheet — chat do assistente, aberto a partir das Quick Actions.

   Escrever em linguagem natural ("gastei 12 no Pingo Doce", "quanto gastei em
   restaurantes este mês?"). As criações aplicam-se logo, com Anular no cartão
   da resposta; apagar e editar mostram um cartão de confirmação — só depois
   de Confirmar é que confirmPending() escreve.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback, useRef } from 'react';
import Sheet from '../components/Sheet.jsx';
import { PrimaryButton, SecondaryButton } from '../components/Buttons.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { renderMD } from '../lib/markdown.js';
import { buildAIContext } from '../lib/ai.js';
import { runAssistant, confirmPending, estimateCost, ASSISTANT_SYSTEM } from '../lib/aiChat.js';

// Guarda o estado anterior de todas as slices que uma tool pode tocar, para o
// Anular repor exatamente o que a volta alterou (ver COLLECTIONS em
// lib/aiTools.js + os creators diretos: update_balance, add_snapshot,
// add_category/add_rule, add_person/add_group_expense/delete_group_entry).
function snapshotSlices(state) {
  return {
    addedExp: state.addedExp,
    incomes: state.incomes,
    goals: state.goals,
    recurring: state.recurring,
    bdg: state.bdg,
    rules: state.rules,
    dynAccts: state.dynAccts,
    dynSnaps: state.dynSnaps,
    people: state.people,
    groups: state.groups,
    groupEntries: state.groupEntries,
  };
}

export default function AssistantSheet() {
  const { isOpen, close } = useModal('assistant');
  const { actions } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]); // {cmd, text, applied, pending, usage, undo, error}
  // Historial da conversa (formato OpenRouter) para dar contexto às voltas
  // seguintes — não é estado React porque não precisa de re-render por si só.
  const historyRef = useRef([]);

  const send = useCallback(() => {
    const cmd = text.trim();
    if (!cmd || busy) return;
    setBusy(true);
    // Snapshot ANTES de chamar o assistente — é para aqui que o Anular repõe.
    const before = snapshotSlices(actions.getState());
    runAssistant(cmd, {
      state: actions.getState(),
      actions,
      history: historyRef.current,
      systemPrompt: ASSISTANT_SYSTEM + '\n\nCONTEXTO:\n' + JSON.stringify(buildAIContext(actions.getState())),
    })
      .then((res) => {
        // Só user/assistant com conteúdo entram no histórico seguinte — os
        // tool_calls/tool results de uma volta já resolvida não interessam.
        historyRef.current = (res.messages || []).filter(
          (m) => m.role === 'user' || (m.role === 'assistant' && m.content)
        );
        setTurns((t) => [
          ...t,
          {
            cmd,
            text: res.text,
            applied: res.applied || [],
            pending: res.pending || [],
            usage: res.usage,
            undo: (res.applied || []).length ? before : null,
          },
        ]);
        setText('');
      })
      .catch((err) => {
        setTurns((t) => [...t, { cmd, error: (err && err.message) || 'Falha no assistente.' }]);
      })
      .finally(() => setBusy(false));
  }, [text, busy, actions]);

  const undo = useCallback(
    (idx) => {
      const snap = turns[idx] && turns[idx].undo;
      if (!snap) return;
      // Mesmo caminho (dispatch) de qualquer outra edição — o efeito de
      // auto-persist da store apanha isto tal como apanharia um patch normal.
      actions.patch(snap);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, undo: null, applied: [] } : x)));
      toast('Anulado', 'success');
    },
    [turns, actions, toast]
  );

  const confirm = useCallback(
    (turnIdx, pendIdx) => {
      const p = turns[turnIdx].pending[pendIdx];
      const r = confirmPending({ name: p.name, args: p.args }, { state: actions.getState(), actions });
      if (r && r.ok) toast('Feito', 'success');
      else toast('Não foi possível concluir', 'error');
      setTurns((t) =>
        t.map((x, i) => (i === turnIdx ? { ...x, pending: x.pending.filter((_, j) => j !== pendIdx) } : x))
      );
    },
    [turns, actions, toast]
  );

  const cancel = useCallback((turnIdx, pendIdx) => {
    setTurns((t) =>
      t.map((x, i) => (i === turnIdx ? { ...x, pending: x.pending.filter((_, j) => j !== pendIdx) } : x))
    );
  }, []);

  const footer = (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pergunta ou regista… (ex: gastei 12 no Pingo Doce)"
        aria-label="Mensagem para o assistente"
        rows={3}
        style={{
          width: '100%',
          padding: 12,
          border: '1px solid var(--border)',
          background: 'var(--elevated)',
          color: 'var(--fg)',
          borderRadius: 8,
          fontSize: 14,
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'var(--font)',
          marginBottom: 8,
        }}
      />
      <PrimaryButton onClick={send} disabled={busy}>
        {busy ? 'A pensar…' : 'Enviar'}
      </PrimaryButton>
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title="Assistente" footer={footer}>
      {turns.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          Escreve em linguagem natural — "gastei 12 no Pingo Doce", "quanto gastei em restaurantes este mês?".
        </div>
      ) : (
        turns.map((t, i) => (
          <div key={i} className="cd fadeUp" style={{ marginBottom: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t.cmd}</div>

            {t.error ? (
              <div role="alert" style={{ borderLeft: '3px solid var(--signal)', padding: '8px 12px', borderRadius: 8 }}>
                <div className="lb" style={{ color: 'var(--signal)' }}>{t.error}</div>
              </div>
            ) : (
              <>
                <div
                  style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: renderMD(t.text) }}
                />

                {(t.pending || []).map((p, j) => (
                  <div key={j} className="cs" style={{ padding: 14, marginTop: 10 }}>
                    <div className="lb" style={{ marginBottom: 6 }}>
                      {p.preview.action === 'delete' ? 'Apagar' : 'Alterar'} · {p.preview.kind}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{p.preview.label}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <PrimaryButton onClick={() => confirm(i, j)} style={{ flex: 1 }}>
                        Confirmar
                      </PrimaryButton>
                      <SecondaryButton onClick={() => cancel(i, j)} style={{ flex: 1, color: 'var(--text2)' }}>
                        Cancelar
                      </SecondaryButton>
                    </div>
                  </div>
                ))}

                {t.undo && (
                  <SecondaryButton onClick={() => undo(i)} style={{ marginTop: 10, color: 'var(--text2)' }}>
                    Anular
                  </SecondaryButton>
                )}

                {t.usage ? (
                  <div className="lb" style={{ marginTop: 10, color: 'var(--fg-subtle)' }}>
                    {'$' + estimateCost(t.usage).toFixed(4)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))
      )}
    </Sheet>
  );
}
