/* ════════════════════════════════════════════════════════════════════════
   AssistantFab — botão flutuante ("chat bubble") do assistente de IA,
   presente em TODAS as páginas.

   Onde vive na árvore importa mais do que parece: ".fadeUp" (usado por 14
   views) anima `transform`, e com `animation-fill-mode: both` o elemento
   fica com um transform não-`none` PARA SEMPRE — o que o torna containing
   block de qualquer descendente `position: fixed`. Um botão fixed lá dentro
   passaria a posicionar-se relativamente a essa view (não ao viewport) e
   saltaria de posição sempre que a view remontasse/re-animasse (ex.: ao
   voltar de um sheet — o bug que o utilizador reportou). Por isso este
   componente é montado como irmão direto de <main>/<BottomNav>, fora de
   qualquer .fadeUp, e NUNCA condicionalmente — fica sempre no DOM, em todas
   as tabs e com qualquer modal aberto ou fechado.

   Fica visualmente escondido quando um sheet abre porque o seu z-index (70)
   é inferior ao do .bnav (80) e MUITO inferior ao do .sheet-overlay (150) —
   o próprio backdrop do sheet cobre-o. Isto evita ter de montar/desmontar o
   botão consoante o estado dos modais, que é precisamente o que causaria o
   salto de layout ao voltar (remount = nova animação .fadeUp/.fadeIn).
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { useUI } from '../store/ui.jsx';
import { useDevice } from '../store/device.jsx';
import Icon from './Icon.jsx';

export default function AssistantFab() {
  const { open } = useUI();
  const { mode } = useDevice();
  const isDesktop = mode === 'desktop';

  // O #app tem max-width:480px e fica centrado em ecrãs largos (ver
  // tokens.css). Um `position:fixed; right:16px` simples ancorar-se-ia ao
  // canto do viewport, não ao canto da coluna da app — por isso o wrapper
  // fixed replica o mesmo clamp/centragem, e o botão fica absoluto dentro
  // dele. Em modo desktop a shell ocupa a largura toda, por isso sem clamp.
  //
  // `top:0; bottom:0` é obrigatório aqui, não decorativo: um elemento
  // position:fixed sem top/bottom cai no algoritmo de "static position" —
  // como o único filho é position:absolute (não contribui para a altura do
  // pai), a altura colapsa a 0 e o wrapper fica onde calhar no fluxo normal
  // em vez de ancorado ao viewport. Sem isto o botão renderiza fora do ecrã
  // (confirmado com getBoundingClientRect a ~2600px do topo em 390×844).
  const wrapStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    maxWidth: isDesktop ? 'none' : '480px',
    margin: '0 auto',
    pointerEvents: 'none',
    zIndex: 70,
  };

  const btnStyle = {
    position: 'absolute',
    right: 16,
    bottom: isDesktop
      ? 'calc(var(--safe-bottom) + 24px)'
      : 'calc(var(--nav-h) + var(--safe-bottom) + 16px)',
    pointerEvents: 'auto',
  };

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        className="assistant-fab"
        style={btnStyle}
        onClick={() => open('assistant')}
        aria-label="Abrir assistente de IA"
      >
        <Icon name="chat" size={22} />
      </button>
    </div>
  );
}
