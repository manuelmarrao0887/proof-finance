# Proof Studio — Brand & Product Rules

Este projecto é o brandkit oficial do **Proof Studio**. Quando me pedirem para desenhar uma app, website, landing page, deck, post ou qualquer artefacto visual neste projecto, **aplica estas regras por defeito**, sem precisar de perguntar.

Sistema final consolidado: **Eclipse** — light (primário) + dark (companion).

---

## 1 · Tokens de cor

Define sempre estes tokens em CSS no topo do ficheiro. Não inventes outros cinzas, não uses hex random.

```css
/* Light (primary) */
--bg:            #fbfcfe;   /* canvas */
--surface:       #f3f6fb;   /* cards, painéis */
--elevated:      #eaeff7;   /* overlays */
--border:        #dde4ee;   /* separadores 1px */
--border-strong: #c4cee0;   /* focus rings, divisão forte */
--fg:            #0b1220;   /* texto principal */
--fg-muted:      #4a5366;   /* texto secundário, body alt */
--fg-subtle:     #8b95a8;   /* meta, captions */
--accent:        #0b1220;   /* CTA primária = preto-azulado */

/* Dark (companion) */
--bg:            #06080c;
--surface:       #0b0f17;
--elevated:      #11161f;
--border:        #1c2230;
--border-strong: #262e3e;
--fg:            #f5f7fb;
--fg-muted:      #8b95a8;
--fg-subtle:     #4a5366;
--accent:        #c8d4ea;
```

**Estados de sistema** (usar só para feedback, não decoração):
- success `#22c55e` light · `#4ade80` dark
- warning `#f59e0b`
- danger `#ef4444` light · `#f87171` dark
- info `#94a3c4` light · `#93c5fd` dark

**Regras de uso**
- Nunca usar cor saturada em backgrounds ou hero.
- Máx 3 níveis de cinza num ecrã.
- Body text em `--fg-muted`, nunca `--fg-subtle` (contraste insuficiente).
- Botões: CTA primária = `--fg` background + `--bg` text. Secundária = transparent + border.
- Hairlines a 1px usam `--border`.

---

## 2 · Tipografia

**Geist** (Google Fonts) para tudo. **Geist Mono** para metadados, labels, código, números técnicos.

```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Escala** (não desviar)

| Token | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| Display / H1 | 56–88px | 500 | -0.04em | 0.95 |
| H2 | 36px | 500 | -0.025em | 1.05 |
| H3 | 22px | 500 | -0.015em | 1.15 |
| Body | 15px | 400 | 0 | 1.55 |
| Small | 12px | 400 | 0 | 1.4 |
| Mono / meta | 11px | 500 | 0.1em UPPERCASE | 1.2 |

**Pesos disponíveis**: 300, 400, 500, 600, 700. Default é **500** para títulos, **400** para body. **Não usar 700/Bold** excepto em casos pontuais — a marca vive em 500.

**Regras**
- `text-wrap: balance` em títulos, `text-wrap: pretty` em parágrafos.
- Letter-spacing negativo aumenta com o tamanho (display = -0.04em).
- Metadados/labels SEMPRE em Geist Mono uppercase com tracking 0.1em+.
- Nunca centrar parágrafos longos. Títulos podem ser centrados, body não.

---

## 3 · Layout & espaçamento

**Grelha base**: 4px. Tudo é múltiplo de 4 (8, 12, 16, 20, 24, 32, 40, 48, 56, 64).

**Border radius**
- 6px — inputs, chips, pequenos botões
- 8–10px — cards pequenos
- 12px — cards grandes, painéis
- 16–18px — heroes, blocos grandes
- 999px — pills, avatars, CTA arredondados

**Shadows**: usar com extrema parcimónia. Default é **sem sombra** — usar border 1px em `--border` em vez disso. Quando precisar:
- subtle: `0 1px 2px rgba(11,18,32,0.04)`
- card: `0 4px 12px rgba(11,18,32,0.06), 0 0 0 1px rgba(11,18,32,0.04)`
- elevated: `0 8px 24px rgba(11,18,32,0.08)`

**Densidade**: sóbria, não densa. Padding generoso. Whitespace é parte do design — não preencher por preencher.

---

## 4 · Iconografia

Sistema Apple-style: **24×24 grid, 1.5px stroke, outline + filled mix**.

- Outline para navegação, ações default.
- Filled para estados activos, badges, status indicators.
- `stroke-linecap: round`, `stroke-linejoin: round`.
- Tamanhos: 14, 16, 20, 24, 32, 48px.
- Cor: `currentColor` sempre — herda do texto.

**Não usar** Lucide cru, Feather, ou icon packs coloridos. Reusar o sistema definido em `icons.jsx`.

---

## 5 · Voz & copywriting

**Pilares**: Claro · Honesto · Calmo · Provado.

**SIM**
- "Reduzimos o tempo de onboarding em 62%."
- "Vamos cortar este scope ao meio. Eis o porquê."
- "Esta feature não vale o custo de manutenção."

**NÃO** (palavras/expressões banidas)
- "Transformamos a tua visão em realidade"
- "Soluções inovadoras de ponta a ponta"
- "Apaixonado", "extraordinário", "revolucionário"
- Emojis decorativos (🚀✨💫). Emojis só se forem parte funcional da UI.
- Pontos de exclamação em copy institucional.

**Tom**: Português europeu, segunda pessoa do singular (`tu`, não `você`). Direto, sem floreado. Frases curtas.

---

## 6 · Iconografia/imagem de banco

Quando precisar de imagens:
- **Mockups** de devices (iPhone, MacBook) em ambientes minimalistas, luz dura.
- **Arquitectura** minimal — linhas, sombras geométricas, betão, vidro.
- Tudo monocromático ou preto-e-branco. Saturação próxima de zero.
- **Sem gente sorridente, sem stock corporativo, sem 3D renders coloridos, sem gradientes.**

Bancos: Unsplash (filtrado a P&B), Pexels mono, ou shoots próprios.

---

## 7 · Componentes — defaults

**Botão primário**
```css
background: var(--fg);
color: var(--bg);
padding: 12px 20px;
border-radius: 999px;
font: 500 13px/1 Geist;
border: none;
```

**Botão secundário**
```css
background: transparent;
color: var(--fg);
border: 1px solid var(--border);
padding: 12px 20px;
border-radius: 999px;
```

**Card**
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: 12px;
padding: 18–24px;
```

**Input**
```css
background: var(--elevated);
border: 1px solid var(--border);
border-radius: 8px;
padding: 8–10px 12px;
font: 400 14px Geist;
```

**Tab/chip activo** — usar fundo `--elevated` + border `--border-strong`. **Não** usar accent color saturada.

---

## 8 · Logo

**Mark** = "P" quoted (stroke 2.2u em grelha 24u, tick 3×3u no canto inferior-direito do counter).
**Wordmark** = "Proof Studio" em Geist 500, letter-spacing -0.02em.
**Lockup**: mark à esquerda, wordmark à direita, gap = 0.6× altura do mark.

- Tamanho mínimo do mark: 16px.
- Clearspace: 1× altura do mark à volta de toda a marca.
- **Não** rodar, distorcer, ou aplicar gradientes/cor única ao mark sobre fundo da mesma cor.

---

## 9 · Stack técnico preferido

Para apps web e plataformas de gestão (target principal do Proof):
- **Frontend**: React + Next.js (App Router), TypeScript.
- **Styling**: CSS variables + utility classes, ou Tailwind com os tokens acima.
- **Fonts**: `next/font` com Geist self-hosted.
- **Icons**: sistema custom (não Lucide, não Heroicons).

Para protótipos HTML neste projecto:
- React via UMD + Babel inline (ver template em `Proof Studio Brandkit.html`).
- Tokens em CSS variables no `<style>` global.
- Cada secção / componente num ficheiro `.jsx` separado, importado por ordem.

---

## 10 · Quando aplicar isto automaticamente

Aplica este sistema sem perguntar quando o pedido for:
- "faz uma landing page do Proof…"
- "desenha um dashboard…"
- "preciso de um post de IG…"
- "uma app de gestão para X cliente…"

**Pergunta antes** se:
- O cliente final tiver brand próprio (Helix, Atrium, etc) — nesse caso usa o brand do cliente, não o do Proof.
- For um exercício de exploração visual divergente — confirma se sair do sistema é desejável.

---

*Versão 1.0 · Eclipse · Maio 2026*
