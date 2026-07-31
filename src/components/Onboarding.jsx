/* ════════════════════════════════════════════════════════════════════════
   Onboarding — new-user empty state with three CTA steps.
   Ported from renderOnboarding (orig 2991-3010).

   Only rendered for brand-new users (isNewUser). Each step opens a modal/sheet
   via useUI().open(...):
     01 → action sheet          (orig showAction=true)
     02 → goal modal w/ a blank draft payload (orig goalDraft=…; showGoal=true)
     03 → settings sheet        (orig showSet=true)
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { isNewUser } from '../lib/finance.js';

export default function Onboarding() {
  const { state, currentUser } = useStore();
  const { open } = useUI();
  const s = { ...state, currentUser };

  if (!isNewUser(s)) return null;

  /* Ordem pensada para o utilizador chegar depressa ao que a app tem de melhor:
     sem rendimento registado o cartão "Podes gastar" não funciona, por isso é o
     primeiro passo; a seguir trazer as despesas (o import faz o trabalho todo). */
  const steps = [
    {
      n: '01',
      label: 'Regista o teu rendimento mensal',
      onClick: () => open('income'),
    },
    {
      n: '02',
      label: 'Importa o extrato do banco (Excel ou CSV)',
      onClick: () => open('stmt'),
    },
    {
      n: '03',
      label: 'Adiciona as tuas contas e cartões',
      onClick: () => open('acct'),
    },
    {
      n: '04',
      label: 'Cria uma meta de poupança',
      // orig seeded goalDraft then opened the goal modal.
      onClick: () => open('goal', { name: '', target: '', current: '0', deadline: '', color: '#3b6fee' }),
    },
  ];

  return (
    <div style={{ padding: '0 20px 16px' }}>
      <div className="cd" style={{ padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em', marginBottom: 6 }}>
          Começa em quatro passos
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, marginBottom: 18 }}>
          Com o rendimento e o extrato, a app diz-te quanto podes gastar por dia e classifica as despesas sozinha. Tu defines o ritmo.
        </div>
        {steps.map((st, i) => (
          <button
            key={st.n}
            type="button"
            onClick={st.onClick}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div className="m" style={{ fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.1em', flexShrink: 0, width: 24 }}>
              {st.n}
            </div>
            <div style={{ fontSize: 14, fontWeight: 400, flex: 1, lineHeight: 1.4 }}>{st.label}</div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
