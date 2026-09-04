/* ════════════════════════════════════════════════════════════════════════
   accounts — resolve a conta que o utilizador nomeia numa frase ("pago pelo
   Activobank", "cartão revolut") para o rótulo canónico "Banco · Tipo" de
   uma conta existente. Puro; usado pelo assistente de IA.
   ════════════════════════════════════════════════════════════════════════ */
import { normAcct } from './finance.js';

const label = (a) => a.bank + ' · ' + a.type;

// normAcct só colapsa espaços (o separador " · " do rótulo depende disso) —
// para decidir SE o utilizador mencionou um banco, "Activo Bank" e
// "Activobank" têm de bater na mesma, por isso aqui comparamos versões sem
// nenhum espaço. Só usado no passo 2 (banco mencionado); os passos que
// comparam contra o rótulo completo ("Revolut · Cartão de Crédito") mantêm
// os espaços de normAcct, para não colidir bancos diferentes por engano.
const flat = (s) => s.replace(/\s+/g, '');

export function resolveAccountRef(text, accounts) {
  const q = normAcct(text);
  if (!q) return null;
  const list = (accounts || []).map((a) => ({ a, lab: label(a), nl: normAcct(label(a)), nb: normAcct(a.bank), nt: normAcct(a.type) }));
  if (!list.length) return null;
  // 1) rótulo completo (com ou sem " · ")
  const full = list.filter((x) => q === x.nl || q === x.nb + ' ' + x.nt || q.indexOf(x.nl) > -1);
  if (full.length === 1) return { label: full[0].lab };
  // 2) banco mencionado
  const byBank = list.filter((x) => x.nb && flat(q).indexOf(flat(x.nb)) > -1);
  if (byBank.length === 0) return null;
  if (byBank.length === 1) return { label: byBank[0].lab };
  // 3) mesmo banco, vários tipos: o tipo (ou uma palavra dele, ex. "cartao") desempata
  const byType = byBank.filter((x) => x.nt.split(' ').some((w) => w.length > 3 && q.indexOf(w) > -1));
  if (byType.length === 1) return { label: byType[0].lab };
  // 4) preferência por Liquidez
  const liq = byBank.filter((x) => normAcct(x.a.category) === 'liquidez');
  if (liq.length === 1) return { label: liq[0].lab };
  return { ambiguous: byBank.map((x) => x.lab).sort() };
}
