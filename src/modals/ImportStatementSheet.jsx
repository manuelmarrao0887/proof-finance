/* ════════════════════════════════════════════════════════════════════════
   Import statement sheet — React port of rStatement (orig 2209-2261),
   scanStmt (orig 2279-2311), toggleStSel (orig 2312), changeStCat (orig 2313),
   doImportStmt (orig 2315-2326).

   Opened via the UI `stmt` modal (useModal('stmt')). Upload a PDF / Excel(CSV) /
   image; lib/ai turns the file into content blocks + STMT_PROMPT and POSTs via
   callAI. Parsed transactions render as a checklist; debits are auto-selected.

   The 3 fixes that land here:
   - FIX 1 (same-beneficiary): changeStCat uses applySameBeneficiaryCategory(...)
     so EVERY transaction whose normalizeDesc(desc) matches the changed row gets
     the same category. A toast reports when >1 row was affected.
   - FIX 2 (no jump-to-top): every transaction is given a STABLE `_id = uid()` the
     moment stResult is set; the list always renders in original array order with
     `t._id` as the React key and is NEVER sorted on classify/select.
   - FIX 3 (alphabetical): each row's category <select> uses sortedCats(state.bdg).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, uid, normalizeStmtDate } from '../lib/format.js';
import { sortedCats } from '../lib/categories.js';
import { applySameBeneficiaryCategory, normalizeDesc, dedupeAddedExp, expenseKey } from '../lib/dedupe.js';
import {
  callAI,
  STMT_PROMPT,
  resizeImg,
  readFileB64,
  parseExcel,
  readExcelRows,
} from '../lib/ai.js';
import { applyRules } from '../lib/finance.js';
import { parseBankStatement } from '../lib/importBank.js';
import { listAccounts } from '../lib/balances.js';

// Tag each parsed transaction with a stable id + default selection, marcando
// duplicados (já existentes em addedExp) via expenseKey. Auto-seleciona só os
// débitos que NÃO são transferências e NÃO são duplicados. As linhas detetadas
// como transferência (TRF) nascem com _type='transfer' e contas De/Para pré-
// preenchidas (o utilizador ajusta) — as restantes ficam como despesa.
function prepResult(res, existingKeys, acctLabels) {
  if (!res || !res.transactions) return { result: res, sel: {} };
  const sel = {};
  const L = acctLabels || [];
  const transactions = res.transactions.map((t) => {
    const _id = uid();
    const isDup = existingKeys ? existingKeys.has(expenseKey({ desc: t.desc, amount: Math.abs(t.amount), date: t.date })) : false;
    if (t.amount < 0 && !t.isTransfer && !isDup) sel[_id] = true;
    const _type = t.isTransfer ? 'transfer' : 'expense';
    // Débito → o extrato é a conta de ORIGEM; crédito → é o DESTINO.
    const deb = t.amount < 0;
    const _from = deb ? (L[0] || '') : (L[1] || L[0] || '');
    const _to = deb ? (L[1] || L[0] || '') : (L[0] || '');
    return { ...t, _id, isDup, _type, _from, _to };
  });
  return { result: { ...res, transactions }, sel };
}

export default function ImportStatementSheet() {
  const { isOpen, close } = useModal('stmt');
  const { state, actions, currentUser } = useStore();
  const toast = useToast();

  const [stScanning, setStScanning] = useState(false);
  const [stResult, setStResult] = useState(null); // {bank, transactions:[{...,_id}]} | {error} | null
  const [stSel, setStSel] = useState({}); // { _id: true }

  const cats = useMemo(() => sortedCats(state.bdg), [state.bdg]); // FIX 3
  const acctLabels = useMemo(
    () => listAccounts({ ...state, currentUser }).map((a) => a.bank + ' · ' + a.type),
    [state, currentUser]
  );

  const resetState = useCallback(() => {
    setStScanning(false);
    setStResult(null);
    setStSel({});
  }, []);

  const onClose = useCallback(() => {
    resetState();
    close();
  }, [resetState, close]);

  // ── Upload → AI parse (orig scanStmt 2279-2311) ────────────────────────────
  const scanStmt = useCallback(
    (el) => {
      const f = el.files && el.files[0];
      if (!f) return;
      const name = f.name.toLowerCase();
      const isPDF = f.type === 'application/pdf' || name.endsWith('.pdf');
      const isXLS =
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.csv') ||
        f.type.indexOf('spreadsheet') > -1 ||
        f.type.indexOf('excel') > -1;
      setStScanning(true);
      setStResult(null);
      setStSel({});
      const apiKey = state.apiKey;
      // Chaves das despesas já existentes → deteta duplicados no preview.
      const existingKeys = new Set((state.addedExp || []).map(expenseKey));
      const onRes = (res) => {
        setStScanning(false);
        const { result, sel } = prepResult(res, existingKeys, acctLabels);
        setStResult(result);
        setStSel(sel);
      };
      if (isPDF) {
        readFileB64(f).then((b64) => {
          callAI(
            [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: STMT_PROMPT },
            ],
            undefined,
            apiKey,
            onRes
          );
        });
      } else if (isXLS) {
        // Excel: tenta parser DETERMINÍSTICO (sem IA) primeiro.
        readExcelRows(f).then((rows) => {
          const parsed = rows ? parseBankStatement(rows) : { header: false, txns: [] };
          if (parsed.header && parsed.txns.length) {
            const bankResult = {
              bank: 'Extrato',
              transactions: parsed.txns.map((t) => ({
                desc: t.desc,
                amount: t.amount, // negativo = débito → auto-selecionado
                category: applyRules({ ...state, currentUser }, t.raw) || 'out',
                date: t.date,
                isTransfer: t.isTransfer,
              })),
            };
            const { result, sel } = prepResult(bankResult, existingKeys, acctLabels);
            setStScanning(false);
            setStResult(result);
            setStSel(sel);
            return;
          }
          // Formato não reconhecido → IA (precisa de sessão; em standby).
          if (!currentUser) {
            setStScanning(false);
            setStResult({ error: 'Formato de Excel não reconhecido.' });
            return;
          }
          parseExcel(f).then((csv) => {
            if (!csv) {
              setStScanning(false);
              setStResult({ error: 'Erro ao ler ficheiro.' });
              return;
            }
            callAI(
              [{ type: 'text', text: 'Dados do extrato bancário:\n\n' + csv + '\n\n' + STMT_PROMPT }],
              undefined,
              null,
              onRes
            );
          });
        });
      } else {
        resizeImg(f, 1600).then((b64) => {
          callAI(
            [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              { type: 'text', text: STMT_PROMPT },
            ],
            undefined,
            apiKey,
            onRes
          );
        });
      }
      // Allow re-selecting the same file.
      el.value = '';
    },
    [state, currentUser, acctLabels]
  );

  // Alternar tipo de uma linha (despesa ↔ transferência), keyed por índice.
  const setRowType = useCallback((i, type) => {
    setStResult((prev) => {
      if (!prev || !prev.transactions || !prev.transactions[i]) return prev;
      const next = prev.transactions.map((t, j) => (j === i ? { ...t, _type: type } : t));
      return { ...prev, transactions: next };
    });
  }, []);

  // Definir conta De/Para de uma linha de transferência.
  const setRowAcct = useCallback((i, side, val) => {
    setStResult((prev) => {
      if (!prev || !prev.transactions || !prev.transactions[i]) return prev;
      const next = prev.transactions.map((t, j) => (j === i ? { ...t, [side === 'from' ? '_from' : '_to']: val } : t));
      return { ...prev, transactions: next };
    });
  }, []);

  // ── Toggle selection (orig toggleStSel 2312) — keyed by stable _id (FIX 2) ──
  const toggleStSel = useCallback((id) => {
    setStSel((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  // ── Change category (orig changeStCat 2313) + FIX 1 (same beneficiary) ──────
  const changeStCat = useCallback(
    (i, cat) => {
      setStResult((prev) => {
        if (!prev || !prev.transactions || !prev.transactions[i]) return prev;
        // FIX 1: apply the chosen category to EVERY row sharing the normalized
        // beneficiary description — not just this one row.
        const next = applySameBeneficiaryCategory(prev.transactions, i, cat, 'category');
        const key = normalizeDesc(prev.transactions[i].desc);
        const affected = prev.transactions.filter((t) => normalizeDesc(t.desc) === key).length;
        if (affected > 1) toast('Aplicado a ' + affected + ' linhas do mesmo beneficiario', 'success');
        // NOTE (FIX 2): we map in place — original order is preserved, no sort.
        return { ...prev, transactions: next };
      });
    },
    [toast]
  );

  // ── Commit (orig doImportStmt 2315-2326) ───────────────────────────────────
  const doImportStmt = useCallback(() => {
    if (!stResult || !stResult.transactions) return;
    const selRows = stResult.transactions.filter((t) => stSel[t._id]);
    if (selRows.length === 0) {
      toast('Nada selecionado', 'error');
      return;
    }
    // Separa linhas: transferências entre contas vs despesas normais.
    const trfRows = selRows.filter((t) => t._type === 'transfer');
    const expRows = selRows.filter((t) => t._type !== 'transfer');

    // Valida transferências (contas escolhidas, diferentes).
    for (const t of trfRows) {
      if (!t._from || !t._to) {
        toast('Escolhe as contas De/Para nas transferências', 'error');
        return;
      }
      if (t._from === t._to) {
        toast('Transferência com contas iguais: ' + (t.desc || ''), 'error');
        return;
      }
    }

    // Duplicados selecionados (só despesas têm deteção por expenseKey).
    const dupSel = expRows.filter((t) => t.isDup).length;
    if (dupSel > 0 && typeof confirm === 'function') {
      if (!confirm(dupSel + ' das selecionadas já existem (duplicadas). Importar na mesma?')) return;
    }

    // ── Despesas ──
    let added = 0;
    let skipped = 0;
    if (expRows.length) {
      const selected = expRows.map((t) => ({ desc: t.desc, amount: Math.abs(t.amount), cat: t.category || 'out', date: normalizeStmtDate(t.date), imported: true }));
      const before = (state.addedExp || []).length;
      const merged = dedupeAddedExp([...(state.addedExp || []), ...selected]);
      added = merged.length - before;
      skipped = selected.length - added;
      actions.setAddedExp(merged);
    }

    // ── Transferências ── o lado do extrato já está no saldo lido → fica saldado
    // (settledFrom em débito, settledTo em crédito); só a outra conta é ajustada.
    trfRows.forEach((t) => {
      const deb = t.amount < 0;
      actions.addTransfer({
        id: uid(),
        from: t._from,
        to: t._to,
        amount: Math.abs(t.amount),
        date: normalizeStmtDate(t.date),
        note: (t.desc || '').trim(),
        settledFrom: deb,
        settledTo: !deb,
        imported: true,
        createdAt: Date.now(),
      });
    });

    resetState();
    close();
    const parts = [];
    if (added > 0 || expRows.length) parts.push(added + ' despesa' + (added === 1 ? '' : 's'));
    if (trfRows.length) parts.push(trfRows.length + ' transferência' + (trfRows.length === 1 ? '' : 's'));
    let msg = parts.join(' · ') + ' importada' + (added + trfRows.length === 1 ? '' : 's');
    if (skipped > 0) msg += ' · ' + skipped + ' duplicada' + (skipped === 1 ? '' : 's') + ' ignorada' + (skipped === 1 ? '' : 's');
    toast(msg, 'success');
  }, [stResult, stSel, actions, state.addedExp, resetState, close, toast]);

  if (!isOpen) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  let body;
  if (!currentUser) {
    body = (
      <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 16 }}>
        <div className="lb" style={{ color: 'var(--signal)' }}>Inicia sessão para usar o importador</div>
      </div>
    );
  } else {
    const selIds = stResult && stResult.transactions ? stResult.transactions.filter((t) => stSel[t._id]) : [];
    const selCount = selIds.length;
    const selTotal = selIds.reduce((s, t) => s + Math.abs(t.amount), 0);

    body = (
      <>
        {!stResult && !stScanning && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Carrega imagem, PDF ou Excel do extrato bancário.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input id="stCam" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => scanStmt(e.target)} />
              <input id="stFile" type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => scanStmt(e.target)} />
              <button
                type="button"
                onClick={() => document.getElementById('stCam').click()}
                style={{ flex: 1, padding: 16, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600, boxShadow: 'var(--shadow)' }}
              >
                Câmara
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('stFile').click()}
                style={{ flex: 1, padding: 16, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600, boxShadow: 'var(--shadow)' }}
              >
                Ficheiro
              </button>
            </div>
            <div className="m" style={{ fontSize: 9, color: 'var(--text3)', marginTop: -8, marginBottom: 16 }}>
              Imagem / PDF / Excel / CSV
            </div>
          </>
        )}

        {stScanning && (
          <div aria-live="polite" style={{ border: '1px solid var(--border)', padding: 24, textAlign: 'center' }}>
            <div className="lb">A processar…</div>
          </div>
        )}

        {stResult && stResult.error && (
          <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 16 }}>
            <div className="lb" style={{ color: 'var(--signal)' }}>{stResult.error}</div>
          </div>
        )}

        {stResult && stResult.transactions && (
          <>
            <div className="rw" style={{ marginBottom: 12 }}>
              <div className="lb">{(stResult.bank || 'EXTRATO') + ' — ' + stResult.transactions.length + ' transações'}</div>
            </div>
            {stResult.transactions.some((t) => t.isDup) && (
              <div style={{ borderLeft: '3px solid var(--warning)', background: 'var(--orange-soft)', padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>
                <div className="lb" style={{ color: 'var(--warning)' }}>
                  {stResult.transactions.filter((t) => t.isDup).length} já existem (duplicadas) — desmarcadas. Confirma antes de importar.
                </div>
              </div>
            )}
            <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: 16 }}>
              {/* FIX 2: iterate in original array order with a stable _id key; never sort. */}
              {stResult.transactions.map((t, i) => {
                const sel = !!stSel[t._id];
                const isD = t.amount < 0;
                const bI = (state.bdg || []).find((b) => b.id === t.category);
                const desc = (t.desc || '').toLowerCase();
                let warn = false;
                if (!bI) warn = true;
                if (t.category === 'rest' && (desc.indexOf('pingo') > -1 || desc.indexOf('continente') > -1 || desc.indexOf('lidl') > -1)) warn = true;
                if (t.category === 'sup' && (desc.indexOf('mcdonald') > -1 || desc.indexOf('h3 ') > -1 || desc.indexOf('tradicional') > -1)) warn = true;
                return (
                  <div
                    key={t._id}
                    style={{
                      border: '1px solid ' + (sel ? 'var(--primary)' : 'var(--border)'),
                      borderTop: i > 0 && !sel ? 'none' : undefined,
                      background: sel ? 'var(--blue-soft)' : 'var(--bg2)',
                      padding: '10px 12px',
                    }}
                  >
                    {/* Row 1: checkbox + desc + amount */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={sel}
                        aria-label={'Selecionar ' + (t.desc || 'transação')}
                        onClick={() => toggleStSel(t._id)}
                        style={{
                          width: 44,
                          height: 44,
                          margin: '-13px 0 -13px -13px',
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 6,
                            border: '1.5px solid ' + (sel ? 'var(--primary)' : 'var(--border)'),
                            background: sel ? 'var(--primary)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {sel && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rw">
                          <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {t.desc}
                            {t.isDup && (
                              <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--warning)', background: 'var(--orange-soft)', padding: '1px 5px', borderRadius: 999, whiteSpace: 'nowrap' }}>DUPLICADO</span>
                            )}
                            {t.isTransfer && !t.isDup && (
                              <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', background: 'var(--elevated)', padding: '1px 5px', borderRadius: 999, whiteSpace: 'nowrap' }}>TRF</span>
                            )}
                          </span>
                          <span className="m" style={{ fontSize: 12, fontWeight: 600, color: isD ? 'var(--text)' : 'var(--success)' }}>
                            {(isD ? '-' : '+') + fm(Math.abs(t.amount))}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Row 2: date + tipo (despesa/transferência) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 28 }}>
                      <span className="m" style={{ fontSize: 10, color: 'var(--text3)' }}>{t.date || ''}</span>
                      <select
                        value={t._type}
                        onChange={(e) => setRowType(i, e.target.value)}
                        aria-label={'Tipo de ' + (t.desc || 'transação')}
                        style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.05em', appearance: 'none' }}
                      >
                        <option value="expense">Despesa</option>
                        <option value="transfer">Transferência</option>
                      </select>
                      {t._type !== 'transfer' && (
                        <>
                          <select
                            value={t.category || ''}
                            onChange={(e) => changeStCat(i, e.target.value)}
                            aria-label={'Categoria de ' + (t.desc || 'transação')}
                            style={{
                              flex: 1,
                              padding: '4px 8px',
                              border: '1px solid ' + (warn ? 'var(--signal)' : 'var(--border)'),
                              background: warn ? 'rgba(229,57,53,0.05)' : 'var(--bg)',
                              color: 'var(--text)',
                              fontFamily: 'var(--mono)',
                              fontSize: 11,
                              letterSpacing: '0.05em',
                              appearance: 'none',
                            }}
                          >
                            {cats.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.nm}
                              </option>
                            ))}
                          </select>
                          {warn && <span className="m" style={{ fontSize: 9, color: 'var(--signal)' }}>Verificar</span>}
                        </>
                      )}
                    </div>
                    {/* Row 3 (transferência): contas De → Para */}
                    {t._type === 'transfer' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 28 }}>
                        <select
                          value={t._from}
                          onChange={(e) => setRowAcct(i, 'from', e.target.value)}
                          aria-label={'Conta de origem de ' + (t.desc || 'transação')}
                          style={{ flex: 1, minWidth: 0, padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, appearance: 'none' }}
                        >
                          <option value="">De…</option>
                          {acctLabels.map((l) => <option key={'f' + l} value={l}>{l}</option>)}
                        </select>
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                        <select
                          value={t._to}
                          onChange={(e) => setRowAcct(i, 'to', e.target.value)}
                          aria-label={'Conta de destino de ' + (t.desc || 'transação')}
                          style={{ flex: 1, minWidth: 0, padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, appearance: 'none' }}
                        >
                          <option value="">Para…</option>
                          {acctLabels.map((l) => <option key={'t' + l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rw" style={{ marginBottom: 16 }}>
              <div className="lb">{selCount + ' Seleccionadas'}</div>
              <div className="lb" style={{ color: 'var(--text)' }}>{fm(selTotal)}</div>
            </div>
            <button
              type="button"
              onClick={doImportStmt}
              style={{
                width: '100%',
                padding: '14px 0',
                border: 'none',
                background: selCount > 0 ? 'var(--primary)' : 'var(--bg3)',
                color: selCount > 0 ? '#fff' : 'var(--text3)',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 999,
              }}
            >
              Importar selecionadas
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <Sheet open={isOpen} onClose={onClose} title="Importar extrato">
      {body}
    </Sheet>
  );
}
