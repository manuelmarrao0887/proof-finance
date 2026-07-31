/* ════════════════════════════════════════════════════════════════════════
   Patch notes — changelog versionado em código. `version` é um inteiro
   incremental (não confundir com package.json). Mais recente primeiro.
   Para lançar novas notas: adiciona uma entrada no topo com version+1.
   ════════════════════════════════════════════════════════════════════════ */

export const PATCH_NOTES = [
  {
    version: 5,
    date: '2026-07-31',
    title: 'Fiscal PT, tendências e plano do mês',
    items: [
      'Novo: Fiscal (Mais → Fiscal) — calendário do IRS, IMI, IUC e e-Fatura com os dias em falta.',
      'Novo: estimativa das deduções à coleta do IRS a partir das tuas despesas (saúde, educação, gerais e IVA), com os tetos legais.',
      'Novo: plano do mês quando o salário entra — divide o rendimento em fixas, metas e livre, e reforça as metas com um toque.',
      'Novo: mini-gráfico de tendência (6 meses) em cada categoria de despesa, com a variação face à média.',
      'Melhoria: o Resumo passa a mostrar primeiro as decisões (podes gastar, plano) e só depois os alertas.',
    ],
  },
  {
    version: 4,
    date: '2026-07-30',
    title: 'Podes gastar, insights e histórico',
    items: [
      'Novo: "Podes gastar X/dia" no Resumo — já desconta as despesas fixas por pagar.',
      'Novo: taxa de poupança e colchão de emergência em meses, calculados com a tua despesa real.',
      'Novo: avisos automáticos (categoria acima da média, orçamento estourado, cartão perto do plafond).',
      'Novo: navegação de meses (setas) nas Despesas e Receitas — acede a todo o histórico.',
      'Melhoria: Relatórios listam todos os meses com dados, não apenas os últimos seis.',
    ],
  },
  {
    version: 3,
    date: '2026-07-19',
    title: 'Cartões de crédito e importação mais inteligente',
    items: [
      'Novo: cartões de crédito — plafond mensal, dívida, disponível e pagamento a partir de outra conta.',
      'Novo: transferências entre contas (não contam como despesa nem receita).',
      'Novo: o extrato passa a importar também as receitas, não só as despesas.',
      'Novo: classificação automática por comerciante ao importar (Continente, McDonalds, Vodafone, IKEA…).',
      'Novo: categorias Compras e Despesas Bernardo.',
      'Melhoria: deteção de duplicados por dia e valor, mesmo com descrição diferente.',
    ],
  },
  {
    version: 2,
    date: '2026-07-12',
    title: 'Metas, investimentos e relatórios',
    items: [
      'Novo: metas com reserva mensal e data estimada de conclusão.',
      'Novo: investimentos detalhados com P&L e alocação da carteira.',
      'Novo: relatórios mensais por categoria.',
      'Novo: proteção dos saldos com PIN ou FaceID.',
      'Correção: despesas criadas à noite deixaram de ficar com a data do dia anterior.',
    ],
  },
  {
    version: 1,
    date: '2026-06-13',
    title: 'Atualizar saldo por print + Novidades',
    items: [
      'Novo: atualizar o saldo de uma conta a partir de um print (assistente IA).',
      'Novo: histórico de saldos datado por conta.',
      'Novo: ecrã de Novidades (patch notes).',
      'Melhoria: ícones SVG em vez de emojis.',
      'Melhoria: menos leituras ao Firebase (cache).',
    ],
  },
];

export const LATEST_PATCH_VERSION = PATCH_NOTES.reduce(
  (m, n) => (n.version > m ? n.version : m),
  0
);

// True when the user hasn't seen the latest notes yet.
export function hasUnseenNotes(lastSeenVersion) {
  return (Number(lastSeenVersion) || 0) < LATEST_PATCH_VERSION;
}
