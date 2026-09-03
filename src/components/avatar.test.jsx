import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar, { AvatarStack, initialsFrom, greetingName } from './Avatar.jsx';

afterEach(() => cleanup());

describe('initialsFrom', () => {
  it('primeira e última inicial; uma palavra → duas letras; vazio → ?', () => {
    expect(initialsFrom('Manuel Sousa Marrão')).toBe('MM');
    expect(initialsFrom('Rita')).toBe('RI');
    expect(initialsFrom('')).toBe('?');
    expect(initialsFrom(null)).toBe('?');
  });
});

describe('greetingName', () => {
  it('displayName → primeiro nome; email → parte local capitalizada; nada → vazio', () => {
    expect(greetingName({ displayName: 'Manuel Marrão' })).toBe('Manuel');
    expect(greetingName({ email: 'manuel.sousa@gmail.com' })).toBe('Manuel');
    expect(greetingName({ email: 'test@example.com' })).toBe('Test');
    expect(greetingName(null)).toBe('');
    expect(greetingName({})).toBe('');
  });
});

describe('Avatar', () => {
  it('sem foto mostra iniciais com o nome acessível', () => {
    render(<Avatar name="Rita Silva" color="#f25592" />);
    const el = screen.getByRole('img', { name: 'Rita Silva' });
    expect(el.textContent).toBe('RS');
    expect(el.style.background).toContain('rgb(242, 85, 146)');
  });
  it('com foto renderiza a imagem sem alt duplicado', () => {
    const { container } = render(<Avatar name="Manuel" photoURL="https://example.com/p.jpg" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://example.com/p.jpg');
    expect(img.getAttribute('alt')).toBe('');
    expect(screen.getByRole('img', { name: 'Manuel' })).toBeTruthy();
  });
});

describe('AvatarStack', () => {
  it('mostra no máximo `max` e um contador com o resto', () => {
    const items = ['Ana', 'Bruno', 'Carla', 'Dinis', 'Eva', 'Filipe'].map((n) => ({ id: n, name: n }));
    render(<AvatarStack items={items} max={4} />);
    expect(screen.getAllByRole('img').length).toBe(5); // 4 avatares + o "+2"
    expect(screen.getByRole('img', { name: '+2 pessoas' }).textContent).toBe('+2');
  });
  it('vazio não renderiza nada', () => {
    const { container } = render(<AvatarStack items={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it('itens com o mesmo nome e sem id não geram keys duplicadas', () => {
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.map(String).join(' '));
    try {
      render(<AvatarStack items={[{ name: 'Ana' }, { name: 'Ana' }, { name: 'Rita' }]} />);
    } finally {
      console.error = orig;
    }
    expect(errors.filter((e) => /key/i.test(e))).toEqual([]);
    expect(screen.getAllByRole('img', { name: 'Ana' }).length).toBe(2);
  });
});
