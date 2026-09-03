/* ════════════════════════════════════════════════════════════════════════
   CardsView — gestão de cartões de crédito.
   Por cartão: plafond mensal, dívida atual (despesas − pagamentos), disponível
   (barra), lista de despesas do cartão, e ações "+ Despesa" / "Pagar dívida".
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, fmDateShort } from '../lib/format.js';
import { getAcctsLive, normAcct, CARD_CAT } from '../lib/finance.js';
import { sortedCats } from '../lib/categories.js';
import MerchantLogo, { BankLogo, BrandMark } from '../components/MerchantLogo.jsx';

export default function CardsView() {
  const { state, actions, currentUser } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fm(v));

  const live = getAcctsLive({ ...state, currentUser });
  const cards = live.filter((a) => a.c === CARD_CAT);
  const cats = sortedCats(state.bdg);
  const catName = (id) => {
    const b = cats.find((c) => c.id === id);
    return b ? b.nm : id || '—';
  };

  const label = (a) => a.b + ' · ' + a.t;

  const deleteExp = (id) => {
    if (typeof confirm === 'function' && !confirm('Remover esta despesa do cartão?')) return;
    actions.deleteExpense(id);
    toast('Despesa removida', 'success');
  };

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {cards.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sem cartões de crédito</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            Adiciona uma conta com categoria “Cartão de crédito” e define o plafond.
          </div>
          <button
            type="button"
            onClick={() => open('acct')}
            style={{ padding: '10px 18px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Novo cartão
          </button>
        </div>
      ) : (
        cards.map((a) => {
          const cardLabel = label(a);
          const plafond = a.plafond || 0;
          const used = a.used || 0;
          const available = plafond - used;
          const pct = plafond > 0 ? Math.min(100, Math.max(0, (used / plafond) * 100)) : 0;
          const over = plafond > 0 && used > plafond;
          const exps = (state.addedExp || [])
            .filter((x) => normAcct(x.acct) === normAcct(cardLabel))
            .slice()
            .sort((x, y) => (y.date || '').localeCompare(x.date || ''));
          // Pagamentos ao cartão = transferências cujo destino é este cartão.
          const pays = (state.transfers || [])
            .filter((t) => normAcct(t.to) === normAcct(cardLabel))
            .slice()
            .sort((x, y) => (y.date || '').localeCompare(x.date || ''));
          // last4/network vivem no customAcct; getAcctsLive não os propaga.
          const raw = (state.customAccts || []).find((x) => x.id === a.id) || {};
          const last4 = raw.last4 || '';
          const network = raw.network || '';

          return (
            <div key={a.id || cardLabel} className="cd" style={{ marginBottom: 16, padding: 16 }}>
              {/* O cartão como objeto: logo do banco, número mascarado, rede e dívida. */}
              <div className="ccard" aria-label={'Cartão ' + a.b}>
                <div className="rw">
                  <BankLogo bank={a.b} size={30} />
                  <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>Crédito</span>
                </div>
                <div className="ccard-num">•••• •••• •••• {last4 || '••••'}</div>
                <div className="rw" style={{ alignItems: 'flex-end' }}>
                  <div>
                    <div className="lb" style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>Dívida atual</div>
                    <div className="m" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>{mv(used)}</div>
                  </div>
                  {network ? <BrandMark id={network} size={36} /> : null}
                </div>
              </div>

              {/* Plafond e ações */}
              <div className="rw" style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {plafond > 0 ? mv(used) + ' de ' + mv(plafond) + ' de plafond' : 'Sem plafond definido — edita o cartão'}
                  {over && <span style={{ color: 'var(--signal)', fontWeight: 600 }}> · plafond excedido</span>}
                </div>
                <button type="button" onClick={() => open('acct', { id: a.id })} aria-label="Editar cartão" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  Editar
                </button>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: pct + '%', background: over ? 'var(--signal)' : pct > 80 ? 'var(--warning)' : 'var(--primary)', transition: 'width .3s' }} />
              </div>
              <div className="rw" style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 14 }}>
                <span>Disponível {mv(available)}</span>
                <span>{a.t}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => open('add', { prefill: { acct: cardLabel } })}
                  style={{ flex: 1, padding: '10px 0', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  + Despesa no cartão
                </button>
                <button
                  type="button"
                  onClick={() => open('cardpay', { cardLabel })}
                  style={{ flex: 1, padding: '10px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Pagar dívida
                </button>
              </div>

              {/* Pagamentos feitos ao cartão */}
              {pays.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="lb" style={{ fontSize: 10, marginBottom: 8 }}>
                    Pagamentos ({pays.length}) · {mv(a.paid || 0)}
                  </div>
                  {pays.slice(0, 4).map((t) => (
                    <div key={t.id} className="rw" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fmDateShort(t.date)} · de {t.from}
                      </span>
                      <span className="m" style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
                        +{mv(t.amount)}
                      </span>
                    </div>
                  ))}
                  {pays.length > 4 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                      + {pays.length - 4} outros — ver em Mais → Transferências
                    </div>
                  )}
                </div>
              )}

              {/* Registo de despesas */}
              <div className="lb" style={{ fontSize: 10, marginBottom: 8 }}>Despesas do cartão ({exps.length})</div>
              {exps.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ainda sem despesas neste cartão.</div>
              ) : (
                exps.map((x) => (
                  <div key={x.id} className="rw" style={{ padding: '8px 0', borderTop: '1px solid var(--border)', gap: 10 }}>
                    <MerchantLogo text={x.desc} cat={x.cat} size={32} bdg={cats} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.desc}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{catName(x.cat)} · {fmDateShort(x.date)}{x.imported ? ' · importada' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span className="m" style={{ fontSize: 12, fontWeight: 600 }}>-{mv(Math.abs(x.amount))}</span>
                      <button type="button" onClick={() => deleteExp(x.id)} aria-label="Remover despesa" style={{ background: 'none', border: 'none', color: 'var(--signal)', cursor: 'pointer', padding: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
