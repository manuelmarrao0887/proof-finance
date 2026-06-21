# Proof. Finance — Estudo de funcionalidades (roadmap)

Data: 2026-06-21. Objetivo: o que falta para ser a melhor app de gestão financeira pessoal.

## O que a app JÁ tem (não duplicar)

- **Despesas**: manual, importar extrato (Excel/CSV via IA), recorrentes (materializar no mês), partilhadas (split), tags, notas, categorias, regras de auto-categorização, dedupe, pesquisa.
- **Receitas**: recorrentes + pontuais, por mês, fonte.
- **Contas & saldos**: contas-modelo + próprias, atualizar saldo por foto (IA), histórico de leituras, **saldo vivo** (manual desconta, importado não), editar = saldo atual (settle), remover contas.
- **Resumo**: liquidez por conta (com **PIN/FaceID**), ativos, dívida, poupança do mês, taxa, health score, fundo de emergência, projeção de tesouraria, deteção de subscrições.
- **Metas** de poupança, **Empréstimo** (capital/dívida/pagamento), **Calendário**, **Gráficos** (evolução), **Orçamento** por categoria, **AI assistant** (analisa documentos → ações).
- **Plataforma**: PWA iPhone (standalone, safe-areas), login Google, sync Firestore, tema claro/escuro, backup/restore JSON, IA via backend (key no servidor).

## Gaps vs apps de topo — priorizado

Legenda: valor (★1-3), esforço (S/M/L).

### Tier 1 — maior impacto, esforço razoável

1. **Orçamentos que funcionam (envelopes / por categoria com rollover)** ★3 · M
   YNAB-style: definir orçamento mensal por categoria, ver gasto vs limite em tempo real (já há `lm` em bdg), **rollover** do que sobra/falta para o mês seguinte, alertas ao ultrapassar. Hoje há limites mas sem ciclo mensal real nem rollover.

2. **Lembretes de contas a pagar (bills) + notificações** ★3 · M
   A partir das recorrentes/calendário: "X vence em 3 dias". Push via PWA (Notifications API) ou badge no calendário. Evita falhar pagamentos.

3. **Relatórios & insights mensais** ★3 · M
   Ecrã "Relatório do mês": top categorias, variação vs mês anterior, maiores despesas, % por categoria, tendência 6-12 meses. Hoje os gráficos são só evolução patrimonial.

4. **Net worth ao longo do tempo (timeline real)** ★3 · S/M
   Já há `dynSnaps`; falta um gráfico claro de património (ativos − dívida) mês a mês + variação. Liga ao que já existe.

### Tier 2 — diferenciadores

5. **Multi-moeda real** ★2 · M
   Já há `fxRates`; falta UI para contas/despesas noutra moeda convertidas ao EUR com taxa atual (útil p/ Revolut/Wise/cripto).

6. **Investimentos detalhados** ★2 · L
   Posições (ativo, quantidade, preço médio, valor atual), P&L, alocação. Hoje as contas de investimento são só um saldo. Integra com a categoria Investimentos.

7. **Objetivos com auto-alocação** ★2 · M
   "Reservar X€/mês para esta meta", barra de progresso com data estimada, sugestão com base na poupança média.

8. **Dívidas / plano de amortização** ★2 · M
   Estender o Empréstimo: vários créditos, simulador de amortização (snowball/avalanche), juros, data de quitação.

### Tier 3 — qualidade & confiança

9. **Onboarding guiado** ★2 · S — primeiros passos (criar conta, importar 1º extrato, definir orçamento).
10. **Exportar CSV/PDF de relatórios** ★1 · S — além do backup JSON.
11. **Notificações de anomalias** ★2 · M — "gastaste 2× a média em Restauração". Reusa detectSubscriptions/health.
12. **Open Banking (sync automático)** ★3 · L — GoCardless/Tink/SaltEdge p/ PT. Elimina importar à mão. Maior valor, maior esforço/risco (custos, KYC).
13. **Household / partilhado** ★1 · L — várias pessoas na mesma conta.

## Recomendação (próximos)

Sequência de maior ROI sem dependências externas:
1. **Orçamentos mensais com rollover + alertas** (Tier 1.1)
2. **Relatórios & insights do mês** (Tier 1.3)
3. **Lembretes de contas** (Tier 1.2)
4. **Net worth timeline** (Tier 1.4)

Open Banking (12) é o maior salto competitivo mas é um projeto à parte (custos, compliance) — decisão de produto, não só técnica.

## Próximo passo

Escolher 1-3 destes → escrevo o plano de implementação (writing-plans) e executo. UI dos novos ecrãs guiada por ui-ux-pro-max + web-design-guidelines.
