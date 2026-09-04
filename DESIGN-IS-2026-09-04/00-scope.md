# 00 — Âmbito da auditoria

**Data:** 2026-09-04
**Alvo:** Proof Finance (React 18 + Vite PWA, branch `react` @ 3f6805d, produção em proof-finance-22h4pcbwc-proof-team.vercel.app)
**Superfície auditada:** todas as 15 tabs (overview, expenses, goals, cal, income, rec, charts, loan, ai, report, invest, transfers, cards, tax, groups) e 7 modais (action, more, add, transfer, cardpay, stmt, settings), em 4 variantes (rich, empty, hidden, dark) a 390px, mais desktop 1440px. Screenshots em `scratchpad/audit/`.
**Utilizador primário:** o próprio autor, particular em Portugal, telemóvel primeiro, consulta diária curta.
**Tarefa primária:** saber quanto posso gastar este mês e registar uma despesa em menos de 10 segundos.
**Tarefas secundárias:** ver para onde foi o dinheiro, acompanhar metas, gerir cartão de crédito, dividir despesas com amigos.
**Restrições:** tokens existentes em `src/styles/tokens.css`, sem dependências novas, PT-PT, sem pedidos externos para dados sensíveis, Firestore com subcoleções.
**Referências:** Revolut, Monzo, N26, Wise, YNAB, Copilot Money, Finary; shots Dribbble Nixtio/Shakuro/Awe/Finora trazidos pelo utilizador.
**Frameworks aplicadas:** Dieter Rams (10 princípios, scorecard 0–3), Nielsen (10 heurísticas), WCAG 2.2 AA, Vercel Web Interface Guidelines, Apple HIG + Material 3 (convenções mobile), padrões fintech (Baymard, playbooks Monzo/Revolut/YNAB), economia comportamental (Kahneman, Thaler, Fogg), Gestalt + Refactoring UI, Jobs-to-be-done.
