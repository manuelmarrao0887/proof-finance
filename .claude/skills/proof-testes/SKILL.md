---
name: proof-testes
description: Use ao mexer no testes.html (plano de testes / mapa de dados / relatório de segurança do Proof. Finance) ou quando uma mudança de comportamento/feature exige atualizar a doc de QA. Garante que a página fica sempre acessível só com login (Firebase Auth), nunca pública.
---

# Manutenção do `testes.html` (Proof. Finance)

`testes.html` é o documento vivo de QA da app, na raiz do repo. Servido pela Vercel
no mesmo domínio da app. É um único ficheiro HTML auto-contido (CSS + JS embebidos).

## Regra de acesso (OBRIGATÓRIA)

**A página tem de estar OCULTA para clientes públicos — só acessível com sessão
iniciada.** O mecanismo já implementado:

- `<html class="locked">` por defeito + CSS `html.locked body > *:not(#gate){display:none}`.
- Overlay `#gate` ("Acesso restrito") visível enquanto bloqueado.
- No fim do `<body>`: Firebase Auth (compat, mesmo projeto/config da app) com
  `onAuthStateChanged` → se houver `user`, remove `locked`; senão mantém.
- Como é o mesmo origin da app e persistência `LOCAL`, basta ter sessão iniciada
  na app (mesmo navegador) para o conteúdo aparecer.

Ao editar o ficheiro **nunca** remover este gate. Se o Firebase falhar a carregar,
a página deve **manter-se bloqueada** (o `catch` força `locked`).

## Três tabs, dirigidas por estruturas de dados no `<script>` principal

1. **Plano de testes** — array `GROUPS` (`T1..T20`): `{ id, title, tests:[{id,title,steps[],expect}] }`.
   Estado por teste (Passou/Falhou/N/A) + nota em `localStorage`; contador, filtro, imprimir.
2. **Mapa de dados** — `LAYERS` (Entradas→Dados→Derivações→Ecrãs), `LINKS` (FK entre
   entidades), `ENTITIES` (slices persistidas com campos e ligações).
3. **Segurança** — array `SECURITY` (`{sev, status:'fixed'|'rec', title, loc, risk, fix}`)
   + `SEC_GOOD` + `SEC_ACTIONS`.

## Como atualizar

- **Nova feature / mudança de comportamento** → adicionar/editar casos no `GROUPS`
  do grupo certo (ou criar grupo `Tn`). Manter linguagem PT, passos concretos,
  resultado esperado verificável. Ver memória [[keep-testes-html-updated]].
- **Mudou o modelo de dados** → atualizar `LAYERS`/`LINKS`/`ENTITIES`.
- **Fix/risco de segurança** → atualizar a entrada em `SECURITY` (mudar `status`
  para `'fixed'` quando resolvido).

## Validar antes de commitar

O `<script>` principal tem de continuar a parsear:

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('testes.html','utf8');new Function('document','window','localStorage','confirm',h.match(/<script>([\s\S]*?)<\/script>/)[1]);console.log('JS OK')"
```

Depois: commit no branch `react` e deploy `sync main<-react` (ver [[always-push-github]]).
