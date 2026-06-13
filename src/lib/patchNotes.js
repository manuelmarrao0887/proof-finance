/* ════════════════════════════════════════════════════════════════════════
   Patch notes — changelog versionado em código. `version` é um inteiro
   incremental (não confundir com package.json). Mais recente primeiro.
   Para lançar novas notas: adiciona uma entrada no topo com version+1.
   ════════════════════════════════════════════════════════════════════════ */

export const PATCH_NOTES = [
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
