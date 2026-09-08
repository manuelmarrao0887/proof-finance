/* ════════════════════════════════════════════════════════════════════════
   Cliente do /api/saltedge — mesmo padrão de chat() em ai.js: pega o
   ID-token Firebase e chama a função serverless (que tem a App-id/Secret da
   Salt Edge; o browser nunca as vê). Ver docs/superpowers/specs/
   2026-09-09-saltedge-bank-link.md para a arquitetura completa.
   ════════════════════════════════════════════════════════════════════════ */
import { getIdToken } from '../firebase/client.js';

const ERRORS = {
  401: 'Precisas de iniciar sessão.',
  403: 'Sem acesso.',
  503: 'Ligação bancária ainda não está configurada.',
};

async function call(action, extra) {
  const token = await getIdToken();
  if (!token) throw new Error('Precisas de iniciar sessão.');
  const r = await fetch('/api/saltedge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...(extra || {}) }),
  });
  let data = {};
  try {
    data = await r.json();
  } catch (e) {
    /* corpo vazio */
  }
  if (!r.ok) throw new Error((data && data.error) || ERRORS[r.status] || 'Erro ao ligar ao banco.');
  return data;
}

export const linkStart = () => call('link_start');
export const listLinks = () => call('list_links');
export const syncLink = (connectionId) => call('sync', { connectionId });
export const unlinkLink = (connectionId) => call('unlink', { connectionId });
