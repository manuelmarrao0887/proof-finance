/* ════════════════════════════════════════════════════════════════════════
   Cliente do /api/t212 — mesmo padrão do lib/saltedge.js: pega o ID-token
   Firebase e chama a função serverless, que é a única que tem a chave da
   Trading212. O browser nunca a vê.

   Depois de um sync bem-sucedido, a UI tem de chamar loadUser(uid): o
   servidor escreveu com a Admin SDK e o store carrega uma vez só (não há
   onSnapshot), por isso os dados novos só aparecem ao recarregar.
   ════════════════════════════════════════════════════════════════════════ */
import { getIdToken } from '../firebase/client.js';

const ERRORS = {
  401: 'Precisas de iniciar sessão.',
  403: 'Sem acesso a esta carteira Trading212.',
  503: 'Trading212 ainda não está configurada.',
};

async function call(action, extra) {
  const token = await getIdToken();
  if (!token) throw new Error('Precisas de iniciar sessão.');
  const r = await fetch('/api/t212', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...(extra || {}) }),
  });
  let data = {};
  try {
    data = await r.json();
  } catch (e) {
    /* corpo vazio ou ilegível */
  }
  if (!r.ok) throw new Error((data && data.error) || ERRORS[r.status] || 'Erro ao falar com a Trading212.');
  return data;
}

export const t212Status = () => call('status');
export const t212Sync = () => call('sync');
export const t212CleanupManual = (ids) => call('cleanup_manual', { ids });
