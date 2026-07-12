# Integração Trading 212 — estudo de viabilidade

Data: 2026-06-22. Objetivo: sincronizar a carteira T212 (posições, cash, retornos) para a vista **Investimentos**, com análise quase em tempo real.

> Nota: os docs (https://docs.trading212.com/api) são uma SPA — não foram lidos automaticamente. Os detalhes abaixo são do conhecimento geral da API T212 e **devem ser confirmados nos docs** antes de implementar.

## O que a API oferece (a confirmar nos docs)

- **Auth:** API key pessoal, gerada na app T212 (Definições → API). Enviada no header `Authorization`. Há **scopes read-only** (metadata, portfolio, histórico) — usar os mínimos.
- **Ambientes:** demo e live (base URLs distintas, ex.: `live.trading212.com/api/v0/…`).
- **Endpoints úteis:**
  - **Carteira / posições abertas** — ticker, quantidade, preço médio, preço atual, P&L (ppl), P&L cambial. → mapeia direto para as nossas `positions`.
  - **Cash da conta** — livre, investido, total, P&L. → liquidez/património.
  - **Pies** (carteiras automáticas) — composição e progresso. → alocação/metas.
  - **Histórico** de ordens, dividendos, transações; instrumentos (metadata).
- **Limites:** rate limits **apertados** (ex.: poucos pedidos por segundo, alguns endpoints ~1 pedido/vários segundos). API em **beta**.

## Restrições que obrigam a backend

1. **CORS:** a API T212 **não permite chamadas diretas do browser**. Tem de passar por um **proxy no servidor** (função Vercel, como o `/api/ai`).
2. **Segurança da key:** a key T212 é sensível e **por utilizador** (cada um tem a sua) → não pode ser uma env var única do servidor nem ficar exposta no cliente. Tem de ser guardada com cuidado (Firestore, idealmente cifrada) e usada só no proxy.
3. **Rate limits:** "tempo real" = **refresh on-demand + cache**, não streaming (a API pública é REST, sem websockets). Botão "Sincronizar" + cache de alguns minutos; nunca polling agressivo.

## Arquitetura proposta

```
App (Investimentos) → /api/t212 (Vercel, verifica ID-token Firebase)
   → lê a key T212 do user (config) → chama live.trading212.com/api/v0/…
   → devolve portfolio/cash → mapeia para `positions` + liquidez
```

- **Função `api/t212.js`** (à imagem de `api/ai.js`): verifica o token Firebase, lê a key T212 do utilizador, faz proxy ao endpoint pedido (portfolio/cash/pies), trata rate limits/erros.
- **Config do utilizador:** campo "Ligar Trading 212" nas Definições → cola a API key (read-only). Guardada em `state.t212Key` (mesma reserva de segurança da Anthropic — ver abaixo).
- **Mapeamento:** `portfolio[]` → `positions[]` (ticker→asset, quantity→qty, averagePrice→avgPrice, currentPrice→currentPrice, ppl→P&L). Marcar como `source:'t212'` (não editáveis à mão; substituídas a cada sync).
- **UX:** botão "Sincronizar T212" na vista Investimentos + "última sincronização há X". Cache para respeitar limites.

## O que isto te dá

- Posições, **preço atual e P&L reais** sem inserir à mão.
- **Retornos** (P&L €/%, por posição e total) e **cash** atualizados.
- Base para **estimativas** (evolução, alocação, contribuição para metas).

## Esforço / risco

- **Esforço:** Médio-Alto (proxy + config + mapeamento + cache/limites). Reaproveita o padrão `/api/ai` e a vista Investimentos já feita.
- **Config tua:** gerar a API key T212 (read-only) na app T212 (sais do standby de config, como na IA).
- **Riscos:** API em beta (pode mudar); rate limits (UX de sync, não live); segurança da key (ver decisão). Sem suporte oficial garantido.

## Decisão de segurança da key (importante)

A key T212 dá acesso de leitura à tua carteira. Opções:
- (a) Guardar em Firestore como hoje a Anthropic (cómodo, mas a key fica no doc). 
- (b) Não persistir: pedir a key só na sessão (re-introduzes), proxy usa-a no pedido.
- (c) Cifrar no servidor. Recomendado: **read-only key + (a) ou (b)** consoante o teu conforto.

## Recomendação

**Viável e alinhado** com a vista Investimentos. É um projeto backend (proxy + config), tal como a IA. Próximo passo se avançares: confirmar nos docs os paths/headers/limites exatos → implementar `api/t212` + botão "Ligar Trading 212" + sync para `positions`.
