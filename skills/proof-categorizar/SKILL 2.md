---
name: proof-categorizar
description: Use quando o utilizador pedir para "categorizar os extratos", "abrir os extratos e classificar", "ver que beneficiários faltam", ou puser ficheiros novos em BD/. Abre os extratos, pesquisa online quem são os beneficiários desconhecidos, decide a categoria e torna-a PERMANENTE na app (categorize.js), com testes. Nunca expõe números de conta nem escreve fora de BD/.
---

# Categorização assistida dos extratos (Proof. Finance)

Objetivo: cada extrato novo importado na app já vem **todo** classificado.
O trabalho é (1) descobrir o que a app ainda não sabe, (2) pesquisar online o que
cada beneficiário é, (3) gravar isso como regra permanente em `src/lib/categorize.js`.

## Regras invioláveis

- `BD/` está no `.gitignore` — contém extratos pessoais. **Nunca** fazer commit,
  colar conteúdo em documentação, nem imprimir números de conta/IBAN.
- Falar de valores/beneficiários só no chat com o utilizador (é o dono dos dados).
- Não inventar: se após pesquisa não for claro, **perguntar** ao utilizador. Uma
  regra errada classifica mal todos os meses seguintes.
- Transferências para **pessoas** (MB WAY P/, TRF P/ nome) não se resolvem online —
  só o utilizador sabe quem é. Agrupar e perguntar de uma vez (AskUserQuestion,
  uma pergunta por pessoa recorrente ou uma lista para responder em bloco).

## Passo a passo

1. **Descobrir o que falta**
   ```bash
   node scripts/classify-statements.mjs            # ficheiro mais recente
   node scripts/classify-statements.mjs --all      # todos os extratos em BD/
   node scripts/classify-statements.mjs --json     # para processar
   ```
   Lê a secção **BENEFICIÁRIOS DESCONHECIDOS**: cada linha tem `padrão=` (o
   texto que se usa na regra) e um exemplo do descritivo.

2. **Pesquisar cada comerciante desconhecido** (WebSearch), query tipo
   `"<nome do comerciante>" Portugal` ou `"<nome>" loja` — o objetivo é saber
   **o que vende**: restaurante? clínica? loja de bricolage? SaaS?
   Prefixos a ignorar no descritivo do banco: `COMPRA 4174`, `DD`, `ELE`,
   `CONTACTLESS`, códigos-postais e cidades no fim.

3. **Mapear para a categoria da app** (ids em `bdgDefault`, `src/lib/finance.js`):

   | id | nome | exemplos |
   |---|---|---|
   | `rest` | Restauração | restaurantes, cafés, padarias, fast-food, food delivery, vending |
   | `sup` | Supermercado | Continente, Pingo Doce, Lidl, mercearias |
   | `comp` | Compras | IKEA, Decathlon, roupa, eletrónica, bricolage |
   | `sau` | Saúde | hospitais, clínicas, farmácias, óticas, psicólogo |
   | `seg` | Seguros | seguradoras, MGEN, Medis, Segurança Social |
   | `ani` | Animais | veterinário, pet shop, seguro animal, creche do cão |
   | `tel` | Telecom | Vodafone, MEO, NOS, eSIM |
   | `car` | Carro | oficinas, peças, parques, portagens, tracking |
   | `cmb` | Combustível | postos, estações de serviço |
   | `gym` | Ginásio | ginásios, estúdios |
   | `sub` | Subscrições | Apple, Google One, Netflix, Spotify (pessoal) |
   | `neg` | Negócio | Vercel, Google Ads, monday.com, ferramentas de trabalho |
   | `laz` | Lazer | festivais, cinema, parques, museus, atividades |
   | `cas` | Prestação Casa | prestação, condomínio |
   | `emp` | Empregada | apoio doméstico |
   | `bern` | Despesas Bernardo | escola/atividades do Bernardo |
   | `out` | Outros | encargos bancários, ambíguos |

   Encargos bancários (`custo de servico`, `imposto do selo`) ficam em `out`.

4. **Tornar permanente** — em `src/lib/categorize.js`, no array `RULES`, acrescentar
   a palavra-chave **na secção certa** (a ordem importa: pessoas → casa → … → rest →
   comp → out). Palavra-chave = o `padrão=` do passo 1, em minúsculas e sem acentos,
   curto mas específico (evitar termos genéricos que apanhem outros comerciantes).
   Se for uma **pessoa**, vai para o bloco do topo "Pessoas / pagamentos específicos"
   com comentário a dizer quem é (o utilizador confirmou).

5. **Testar** — acrescentar um caso em `src/lib/categorize.test.js` no array `cases`
   com o descritivo real e o id esperado. Correr:
   ```bash
   npx vitest run src/lib/categorize.test.js
   node scripts/classify-statements.mjs --all     # cobertura deve subir
   ```

6. **Fechar** — `npm run build`, commit (`feat(import): +N comerciantes …`), push de
   `react` e deploy para `main` (padrão do repo: `git checkout -B main origin/main;
   git read-tree -u --reset react; npm run build; git add -A; git commit; git push
   origin main; git checkout react`). Dizer ao utilizador a cobertura antes/depois e
   quais ficaram por decidir.

## O que a app já faz sozinha (não repetir aqui)
- Transferências entre contas próprias (`isTransferDesc`): nome do titular, XTB,
  Trading 212, Trade Republic.
- Receitas: créditos entram como receita; `VENCIMENTO` → salário.
- Regras do próprio utilizador (`state.rules`) têm prioridade sobre `guessCategory`;
  ao corrigir uma categoria no preview do import a app aprende a regra sozinha.
