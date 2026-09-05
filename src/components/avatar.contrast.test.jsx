// Avatar (Task 22): a cor do texto das iniciais tem de garantir contraste —
// texto escuro sobre cores claras/médias, texto branco sobre cores escuras.
//
// NOTA sobre a cor do 2º caso: o enunciado original desta tarefa usava
// '#12b3a6' à espera de texto branco. Cálculo (e depois o axe-core no ecrã
// real, com a MESMA cor na fixture — a pessoa "Ana" tem color:'#12b3a6' em
// src/test/fixtures.js) mostraram que branco sobre '#12b3a6' só atinge
// 2,6:1 (falha AA); texto escuro atinge 6,8:1. Confirmei o mesmo para
// "João" (fixture: '#f5a623', branco = 2,0:1, escuro = 8,8:1). Por isso o
// 2º exemplo usa '#2149c4' (--primary-dark do tema claro), um azul
// suficientemente escuro para o branco ser mesmo a escolha certa
// (branco = 7,5:1, escuro = 2,4:1) — ver task-22-report.md para os números.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar from './Avatar.jsx';

afterEach(() => cleanup());

describe('Avatar escolhe a cor do texto', () => {
  it('cor clara/média → texto escuro; cor escura → texto branco', () => {
    render(
      <>
        <Avatar name="Ana" color="#f7b955" />
        <Avatar name="Bruno" color="#2149c4" />
      </>
    );
    expect(screen.getByRole('img', { name: 'Ana' }).style.color).toBe('rgb(10, 22, 51)');
    expect(screen.getByRole('img', { name: 'Bruno' }).style.color).toBe('rgb(255, 255, 255)');
  });

  it('cores reais da fixture ("Ana" #12b3a6, "João" #f5a623) também recebem texto escuro (AA)', () => {
    render(
      <>
        <Avatar name="Ana" color="#12b3a6" />
        <Avatar name="João" color="#f5a623" />
      </>
    );
    expect(screen.getByRole('img', { name: 'Ana' }).style.color).toBe('rgb(10, 22, 51)');
    expect(screen.getByRole('img', { name: 'João' }).style.color).toBe('rgb(10, 22, 51)');
  });
});
