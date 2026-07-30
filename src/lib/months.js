/* ════════════════════════════════════════════════════════════════════════
   months — navegação temporal partilhada pelas vistas.

   O modelo original mostra sempre os ÚLTIMOS 4 meses e guarda o mês escolhido
   como índice `em` (0..3, 4 = Q1). Para dar acesso ao histórico sem reescrever
   tudo, acrescenta-se um OFFSET de janela `mOff` (0 = janela a acabar no mês
   atual, −1 = janela deslocada um mês para trás, …).

     mOff=0  → [abr, mai, jun, jul]  (jul = mês atual, em=3)
     mOff=-4 → [dez, jan, fev, mar]

   Assim `em` continua a ser o índice dentro da janela e todo o código antigo
   funciona; só a origem da janela muda.
   ════════════════════════════════════════════════════════════════════════ */

export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const keyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

// Data do 1.º dia do mês na posição `em` (0..3) da janela deslocada por `mOff`.
export function monthDateAt(em, mOff, now) {
  const d = now || new Date();
  const off = Number(mOff) || 0;
  const idx = Math.min(Math.max(Number(em) || 0, 0), 3);
  return new Date(d.getFullYear(), d.getMonth() + off - (3 - idx), 1);
}

// 'YYYY-MM' do mês na posição `em` da janela.
export function monthKeyAt(em, mOff, now) {
  return keyOf(monthDateAt(em, mOff, now));
}

// As 4 chaves 'YYYY-MM' da janela (ordem cronológica).
export function windowMonthKeys(mOff, now) {
  return [0, 1, 2, 3].map((i) => monthKeyAt(i, mOff, now));
}

// As 4 etiquetas curtas da janela ('Abr','Mai','Jun','Jul').
export function windowLabels(mOff, now) {
  return [0, 1, 2, 3].map((i) => MONTH_SHORT[monthDateAt(i, mOff, now).getMonth()]);
}

// 'YYYY-MM' → 'Julho 2026'. Entrada inválida devolve ''.
export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  return MONTH_LONG[Number(m[2]) - 1] + ' ' + m[1];
}

// 'YYYY-MM' → 'Jul 26' (compacto, para cabeçalhos apertados).
export function monthLabelShort(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  return MONTH_SHORT[Number(m[2]) - 1] + ' ' + m[1].slice(2);
}

/* Offset mínimo permitido: o suficiente para chegar ao mês mais ANTIGO com
   dados (despesas ou receitas). Devolve 0 quando não há histórico — sem dados
   não faz sentido navegar para trás. Nunca positivo (não há futuro). */
export function minMonthOffset(state, now) {
  const d = now || new Date();
  const keys = [];
  ((state && state.addedExp) || []).forEach((x) => {
    if (x && x.date) keys.push(String(x.date).slice(0, 7));
  });
  ((state && state.incomes) || []).forEach((i) => {
    if (i && i.date) keys.push(String(i.date).slice(0, 7));
  });
  const valid = keys.filter((k) => /^\d{4}-\d{2}$/.test(k));
  if (!valid.length) return 0;
  const oldest = valid.sort()[0];
  const [y, m] = oldest.split('-').map(Number);
  // meses entre o mês actual e o mais antigo (negativo)
  const diff = (y - d.getFullYear()) * 12 + (m - 1 - d.getMonth());
  return Math.min(0, diff);
}

/* Meses com despesas registadas, do mais recente para o mais antigo.
   Inclui sempre o mês atual (mesmo sem despesas) para não abrir uma vista
   vazia sem opções. Limitado a `max` entradas (default 24). */
export function monthsWithData(addedExp, now, max) {
  const d = now || new Date();
  const set = new Set([keyOf(d)]);
  (addedExp || []).forEach((x) => {
    const k = String((x && x.date) || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
  });
  return Array.from(set)
    .sort()
    .reverse()
    .slice(0, max || 24);
}

// Limita um offset ao intervalo navegável [minMonthOffset, 0].
export function clampOffset(mOff, state, now) {
  const min = minMonthOffset(state, now);
  return Math.min(0, Math.max(min, Number(mOff) || 0));
}
