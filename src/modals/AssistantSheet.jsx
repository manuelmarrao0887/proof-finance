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
import PendingActionCard from '../components/PendingActionCard.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { renderMD } from '../lib/markdown.js';
import { buildAIContext } from '../lib/ai.js';
import { runAssistant, confirmPending, estimateCost, ASSISTANT_SYSTEM } from '../lib/aiChat.js';
// WRITE_TOOL_SLICES é a fonte única (lib/aiTools.js) das slices que cada tool
// de escrita toca — não replicar essa tabela aqui. Um mapa local já divergiu
// uma vez desta fonte (add_group_expense também reflete em addedExp via
// addGroupEntry, e o mapa local só sabia de groupEntries), com um teste em
// aiTools.test.js a impedir que volte a acontecer.
import { WRITE_TOOL_SLICES } from '../lib/aiTools.js';

// Guarda o estado anterior de todas as slices que uma tool pode tocar — o
// "antes" de que o Anular precisa. Note-se que isto sozinho NÃO chega: ver
// undoSnapshotFor abaixo para o porquê de só se repor as slices que a
// PRÓPRIA volta tocou, nunca as 11 de uma vez.
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

// Devolve o subconjunto de `before` correspondente à UNIÃO das slices que
// esta lista de `applied` tocou — nunca as 11 de uma vez. Sem isto, o Anular
// de uma volta antiga sobrescreve com um valor obsoleto qualquer slice que
// uma volta mais recente (ou qualquer outra parte da app, entretanto) tenha
// alterado, apagando esse trabalho. Uma tool não reconhecida em
// WRITE_TOOL_SLICES faz devolver null — o Anular fica indisponível em vez de
// arriscar restaurar a slice errada (não deveria acontecer: aiChat.js só
// deixa entrar em `applied` tools que estão em WRITE_TOOL_SLICES).
function undoSnapshotFor(applied, before) {
  const keys = new Set();
  for (const a of applied) {
    const slices = WRITE_TOOL_SLICES[a.name];
    if (!slices) return null;
    slices.forEach((s) => keys.add(s));
  }
  const snap = {};
  keys.forEach((k) => {
    snap[k] = before[k];
  });
  return snap;
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
        const applied = res.applied || [];
        setTurns((t) => [
          // Uma volta que aplicou qualquer coisa torna obsoleto o "antes" de
          // TODAS as voltas anteriores (tocasse ou não a mesma slice) — só a
          // aplicação mais recente pode oferecer Anular, nunca duas ao mesmo
          // tempo. Um botão Anular parado a reescrever silenciosamente o
          // passado é pior do que não ter Anular nenhum.
          ...t.map((x) => (applied.length ? { ...x, undo: null } : x)),
          {
            cmd,
            text: res.text,
            applied,
            pending: res.pending || [],
            usage: res.usage,
            undo: applied.length ? undoSnapshotFor(applied, before) : null,
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
        t.map((x, i) => {
          const next = i === turnIdx ? { ...x, pending: x.pending.filter((_, j) => j !== pendIdx) } : x;
          // Uma eliminação/edição confirmada aqui pode tocar exactamente a
          // slice que o Anular de QUALQUER volta (mesmo já resolvida) ainda
          // assume como "antes" — o mesmo perigo do Gap 1, agora no caminho
          // de Confirmar em vez do de criar. É precisamente quando um
          // Anular parado é mais perigoso: perder a hipótese de anular uma
          // criação não relacionada custa muito menos do que ressuscitar em
          // silêncio um registo que o utilizador acabou de apagar.
          return r && r.ok ? { ...next, undo: null } : next;
        })
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
      {/* Anúncio para leitores de ecrã — o botão sozinho não é uma live
          region, um leitor de ecrã não repara na mudança do texto. */}
      {busy && (
        <div aria-live="polite" className="lb" style={{ marginTop: 8, color: 'var(--text3)' }}>
          A pensar…
        </div>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title="Assistente" footer={footer}>
      {/* Live region única e sempre montada: quando uma nova volta chega,
          o leitor de ecrã anuncia só o que mudou (aria-live="polite" +
          aria-atomic="false", o default) — mesmo padrão de
          ImportStatementSheet.jsx (stScanning). */}
      <div aria-live="polite">
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
                    <PendingActionCard
                      key={j}
                      preview={p.preview}
                      busy={busy}
                      onConfirm={() => confirm(i, j)}
                      onCancel={() => cancel(i, j)}
                    />
                  ))}

                  {t.undo && (
                    <SecondaryButton onClick={() => undo(i)} disabled={busy} style={{ marginTop: 10, color: 'var(--text2)' }}>
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
      </div>
    </Sheet>
  );
}
