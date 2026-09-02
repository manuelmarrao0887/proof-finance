# Menos texto, mais cara — logos, avatares e ícones — Spec

**Data:** 2026-09-02
**Estado:** Aprovado pelo utilizador ("Gosto de todas sugestões. Avança... entrega tudo").
**Artifact de conceito:** https://claude.ai/code/artifact/f47f8096-ebbe-4009-9ca1-a944c6928c8f
**Âmbito:** Dar identidade visual às listas e cartões da app: logos de comerciantes e bancos,
avatares de pessoas, ícones por meta e por categoria personalizada, cartão de crédito como
objeto, e cortes de texto redundante. Sem dependências novas, sem serviços externos.

---

## 1. Problema

A app já tem `CategoryIcon` (círculo colorido + ícone de linha), mas fora disso é texto:
"IKEA · Compras · 20 set", "Activobank · Conta a Ordem", "3 pessoas", "VWCE XTB". Os insights
são parágrafos de três linhas. O cartão de crédito é um card cinzento. Nas referências que o
utilizador trouxe (Nixtio, Shakuro, Awe, Finora, LandingFolio), cada linha tem um logo ou um
avatar e a lista lê-se sem ler.

---

## 2. Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Fonte dos logos | **Pack local** em `src/lib/brands.jsx`: ~35 marcas como SVG simplificado (letra + cor da marca), embebidas no bundle. **Zero pedidos externos** (nenhuma transação sai do dispositivo para ir buscar um logo; funciona offline no PWA). Cada marca tem `node` substituível por SVG oficial mais tarde. |
| D2 | Resolução de marca | `resolveBrand(text)` puro: normaliza (minúsculas, sem dígitos, sem pontuação, sem palavras de ruído como "compra", "pagamento", "lisboa", "lda") e procura aliases (`match: ['pingo doce', 'pingodoce']`). Devolve id ou `null`. |
| D3 | Componente único | `<MerchantLogo text cat size />`: marca → logo + **badge da categoria** (16px, canto inferior direito); sem marca → `CategoryIcon`; sem categoria → **inicial** num círculo com cor estável por hash do nome. |
| D4 | Bancos | Mesmo pack, `group: 'bank'`. `<BankLogo bank size />` resolve por `bank` da conta; fallback inicial. Usado em Resumo (Disponível), Cartões, Transferências, seletor de contas. |
| D5 | Cartão como objeto | `CardsView` renderiza o cartão com fundo escuro, logo do banco, `•••• {last4}`, rede (Mastercard/Visa em SVG) e dívida em número grande. Campos **opcionais** novos em `customAccts` (categoria "Cartão de crédito"): `last4` (4 dígitos) e `network` (`'mastercard' \| 'visa' \| ''`). `AcctModal` mostra os dois campos só para cartões. Sem `last4` mostra `••••` sem dígitos. |
| D6 | Metas com ícone | Campo opcional `icon` em `goals` (id de ícone do `Icon.jsx`). `GoalModal` ganha seletor com 8 ícones (guarda-sol, escudo, carro, avião, casa, presente, capelo, mealheiro). `color` já existe e tinge anel e barra. Sem `icon` → alvo (`goal`). |
| D7 | Categorias personalizadas | Campos opcionais `icon` e `color` em `bdg`. `catMeta(id, item?)` prefere os do item; defaults em `CAT_META`. `CatManagerModal` ganha seletor de ícone (grelha) e cor (8 swatches). Defaults corrigidos: `comp` passa de carrinho para **saco**. `cas` mantém casa (é a única categoria de casa). |
| D8 | Avatares | `<Avatar name photoURL color size />`. Cabeçalho móvel: avatar (foto Google ou inicial) + "Olá, {primeiro nome}". Chip de sync fica só com o ponto quando "Guardado"; texto só nos outros estados. Grupos: avatares sobrepostos no card do grupo; linha "quem deve" com avatar; despesas do grupo com avatar de quem pagou. Reutiliza `colorOf`/`initialsOf` já existentes em `GroupsView`. |
| D9 | Menos texto | Ver §5. Fecho do mês em tiles, insights compactos com logo, recorrentes em tiles, despesas agrupadas por dia, progresso global uma vez, chips curtos. |
| D10 | Investimentos | Logo do ativo por ticker (mapa local `ASSET_BRANDS`: VWCE→vanguard, AAPL→apple, MSFT→microsoft, …; sem match → inicial do ticker). Corretora como badge pequeno. P/L como chip colorido. |
| D11 | Sugestões em Recorrentes | Quando há menos de 3 recorrentes, fila de chips com logo (Netflix, Spotify, EDP, MEO, Vodafone, NOS). Toque abre `RecModal` com nome e categoria pré-preenchidos. |
| D12 | Inspiração LandingFolio | Adaptada aos tokens existentes, nunca copiada 1:1. bannerbear/polymail (stats) → tiles; imagespeedtest (stats) → linhas logo+valor; optimizely (logo-cloud) → chips com logo; orshot (logo-cloud) → grelha do seletor; confettihabits (demo) → saudação. |

---

## 3. Arquitetura

```
src/lib/brands.jsx          pack de marcas + resolveBrand + ASSET_BRANDS + hashColor
src/components/MerchantLogo.jsx   MerchantLogo, BankLogo, Initial
src/components/Avatar.jsx         Avatar, AvatarStack
src/components/StatTiles.jsx      Tiles (eyebrow + número + legenda + ícone opcional)
src/components/Icon.jsx           +ícones: bag, landmark, person, umbrella, shieldCheck,
                                  plane, gift, graduation, piggy, calendar, check, bell
src/lib/categories.js       catMeta(id, item?) com override; comp → bag
src/lib/anomalies.js        insight ganha `subject: {desc, cat}` opcional
```

Nada muda no Firestore além de campos opcionais em itens já existentes (`last4`, `network`,
`icon`, `color`). `hydrateFromDoc` já tolera campos em falta. Sem migração.

---

## 4. Pack de marcas (v1)

**Comerciantes PT:** Netflix, Spotify, IKEA, Pingo Doce, Continente, Lidl, Auchan, Uber, Bolt,
Galp, BP, EDP, MEO, NOS, Vodafone, Amazon, Apple, Google, Zara, Worten, FNAC, Decathlon,
Fitness Hut, Glovo, Uber Eats.
**Bancos e corretoras:** ActivoBank, Millennium bcp, CGD, Santander, BPI, Novo Banco,
Bankinter, Montepio, Revolut, Wise, N26, Trade Republic, XTB, DEGIRO, Trading 212.
**Redes:** Mastercard, Visa.
**Ativos:** Vanguard, Apple, Microsoft, iShares, Tesla, Nvidia, Amazon, Google.

Cada entrada: `{ name, group, bg, fg, node, match: [aliases] }`.

---

## 5. Por ecrã

| Ecrã | Muda |
|---|---|
| Cabeçalho (Shell) | Avatar + "Olá, Manuel" no lugar de "Proof. Finance" em mobile; chip de sync só com ponto quando guardado. Desktop (Sidebar) mantém a marca. |
| Resumo · Disponível | `BankLogo` por conta; banco a negrito, tipo por baixo. |
| Resumo · Fecho do mês | `closing.top[]` (3) vira `StatTiles` com `CategoryIcon`; a frase "Onde foi: …" sai. |
| Resumo · Insights | Linha: `MerchantLogo` (se `subject`) ou ícone por `tone`, título, detalhe numa linha (`text-overflow`), "Está certo" vira botão ✓ com `aria-label`. |
| Resumo · Grupos strip | Avatares sobrepostos dos devedores. |
| Despesas · lista | `MerchantLogo` em vez de `CategoryIcon`; agrupar por dia ("Hoje", "Ontem", "31 ago"); data sai da linha; chip "transitado" vira "↻ +250 €". |
| Despesas · recorrentes do mês | `MerchantLogo`. |
| Cartões | Cartão-objeto (D5); plafond e ações em card à parte; despesas do cartão com `MerchantLogo`. |
| Recorrentes | Hero vira 3 `StatTiles` (por mês, por ano, por pagar); linhas com `MerchantLogo`, data "28 set" com ícone; sugestões (D11). |
| Metas | Ícone por meta (D6); progresso global uma vez (fica o `ContextStrip`, o card perde o cabeçalho duplicado); aviso longo vai para chip de estado (atrasada / no ritmo / a começar) e o texto completo fica num `title`. |
| Grupos | Avatares (D8). |
| Investimentos | D10. Os avisos mantêm-se; o de concentração ganha o logo do ativo. |
| Transferências | `BankLogo` de/para. |
| Nova despesa | Grelha com `comp` = saco; categorias personalizadas com o seu ícone/cor; ao escrever a descrição, `MerchantLogo` aparece no campo quando há marca. |
| Gestor de categorias | Seletor de ícone e cor (D7). |
| Modal de conta | `last4` e `network` só para cartões (D5). |
| Modal de meta | Seletor de ícone (D6). |

---

## 6. Fatias de entrega

Cada fatia: testes verdes, `npm run build`, `layout-check.mjs` limpo, commit + push.

- **A.** Pack de marcas, `resolveBrand`, `MerchantLogo`, `BankLogo`, `Initial`; aplicar em Despesas, Cartões (lista), Recorrentes (linhas), Resumo (Disponível), Investimentos, Transferências.
- **B.** Cartão-objeto + `last4`/`network` em `AcctModal`.
- **C.** `Avatar`; cabeçalho; Grupos; strip de grupos no Resumo.
- **D.** Metas com ícone; categorias personalizadas com ícone/cor; `comp` → saco; logo no campo de descrição.
- **E.** Menos texto: `StatTiles` no fecho do mês e em Recorrentes; insights compactos; despesas por dia; progresso global uma vez; chips curtos; sugestões em Recorrentes.
- **F.** `testes.html`: suite T45 com os casos manuais das fatias A–E.

---

## 7. Fora de âmbito

- Logos oficiais (licenças) e busca remota de logos.
- Fotos de membros de grupos (só iniciais + cor).
- Reordenar ou redesenhar a navegação.
