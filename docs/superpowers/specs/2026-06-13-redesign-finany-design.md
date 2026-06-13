# Redesign visual completo — linguagem "Finany" — Spec

**Data:** 2026-06-13
**Estado:** Aprovado, agendado para DEPOIS da feature "atualizar-saldo-por-print" (decisão de sequência do utilizador: acabar feature primeiro).
**Âmbito:** Redesign **completo** (tokens + todos os ecrãs), só camada de apresentação. Não mexer em lógica, dados, rotas, APIs.

## Notas de contexto do projeto (real, ao contrário do que o prompt assume)

- **NÃO é Tailwind nem Next.js.** É **Vite + React 18**. A estilização é via **tokens CSS globais** em `src/styles/tokens.css` (sistema "Eclipse", monocromático) + estilos inline nos componentes que consomem `var(--token)` e classes utilitárias (`.cd`, `.hero`, `.rw`, `.lb`, `.bnav`, etc.).
- Tema claro/escuro via `html[data-theme]` com os tokens redefinidos no bloco `dark`.
- **Estratégia de implementação:** reescrever `tokens.css` (paleta/tipografia/raios/sombras) restila a app quase toda de uma vez; depois ajustar componentes assinatura. Adaptar o prompt (que assume Tailwind) a esta realidade — NÃO introduzir Tailwind.
- App é **mobile-first**, coluna central ~480px (`#app`).

## Linguagem visual pedida

### Paleta (mapear para tokens CSS, claro + dark)
- primary `#3B6FEE` · primary-dark `#2A52C9` · secondary `#7B5FE0`
- success `#3FC97A` · danger `#F25555` · warning `#F5A623`
- ink/text `#0A1633` · text-muted `#6B7280`
- bg `#FFFFFF` · surface `#F4F6FA` · border `#E6E9F0`

> Diferença-chave face ao Eclipse atual: introduzir **acento azul vivo** (hoje `--blue` mapeia para o fg monocromático) e **cores de categoria/positivo-negativo** reais; sombras suaves (hoje é "no shadow / 1px border"); raios maiores.

### Tipografia
- Fonte "Axiforma" se disponível; senão neo-grotesque limpa (Plus Jakarta Sans / Manrope / Inter), pesos 400/500. (No Vite: `@import`/`@fontface` ou ficheiros locais; não há `next/font`.)
- Escala: Head1 42/48 M · Head2 32/40 M · Head3 24/32 M · Title 18/24 M · Body L 16/24 M · Body 14/20 R · Small 12/16 R · Overline 10/16 R (maiúsculas, tracking).

### Estilo geral
- Cards raio 16–24px, botões ~12px, ícones em círculos.
- Cards `surface` + sombras suaves baixas.
- Ícones de categoria em círculo com fundo da cor da categoria a 10–15% + ícone a cor cheia.
- Espaçamento generoso, hierarquia clara.
- Valores monetários destacados (Head/Title), com sinal +/- e cor.

## Componentes reutilizáveis a criar/refatorar
`BalanceCard`, `QuickActions`, `TransactionItem`, `TransactionList`, `StatCard`,
`PaymentCard` (gradiente roxo→azul), `StockItem`, `CategoryGrid`, `BottomNav` (Home/Report/Stock/Cards),
`SegmentedControl`, `PrimaryButton`/`SecondaryButton`/`IconButton`.

> Mapear estes aos ecrãs/views existentes (OverviewView, ChartsView, ExpensesView, etc.),
> NÃO criar rotas novas inventadas. Onde o prompt fala de ecrãs que não existem (Stock,
> Cards, Send Money), confirmar com o utilizador se quer criá-los ou se são só inspiração.

## Ecrãs (mapear às rotas/views existentes)
Home/Dashboard → OverviewView; Report → ChartsView; Add Transaction → AddExpenseSheet;
Select Category → CatManager/Category picker; Onboarding → Onboarding.jsx.
Stock/Cards/Send Money: **não existem hoje** — esclarecer âmbito antes de criar.

## Requisitos técnicos
- Tokens + fonte primeiro; depois componentes base; depois ecrã a ecrã.
- Acessível (labels, foco visível, contraste AA), responsivo mobile-first.
- Sem bibliotecas de UI pesadas; componentes próprios.
- Incremental, explicar mudanças por ficheiro.
- **Perguntar antes de remover/renomear ficheiros.**

## Como proceder (ordem do utilizador)
1. Análise da estrutura atual + plano de alterações (mostrar ao utilizador).
2. Design tokens + tipografia.
3. Componentes base.
4. Ecrã a ecrã.

## Por resolver antes de começar o redesign
- Ecrãs Stock / Cards / Send Money: criar do zero (novas funcionalidades) ou ignorar? O prompt assume features que a app não tem.
- Fonte Axiforma: temos licença/ficheiros, ou fallback (Plus Jakarta Sans)?
- Manter dark mode? (a app tem) — mapear a paleta nova para dark.
