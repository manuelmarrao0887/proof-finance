import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPushSupported, isStandalone, isIOS, subscribePush } from './push.js';

// jsdom não implementa serviceWorker/PushManager/maxTouchPoints, e
// `vi.restoreAllMocks()` global reseta a MOCKIMPLEMENTATION de QUALQUER
// vi.fn() no processo — incluindo o window.matchMedia que src/test/setup.js
// instala uma vez por ficheiro. Por isso cada teste aqui restaura só o que
// ele próprio mudou (spies individuais / defineProperty com o descriptor
// original), nunca restoreAllMocks/resetAllMocks.
const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function setSupport({ serviceWorker, pushManager }) {
  const swDesc = Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker');
  const pmDesc = Object.getOwnPropertyDescriptor(window, 'PushManager');
  if (serviceWorker) Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true });
  else delete window.navigator.serviceWorker;
  if (pushManager) window.PushManager = function PushManager() {};
  else delete window.PushManager;
  cleanups.push(() => {
    if (swDesc) Object.defineProperty(window.navigator, 'serviceWorker', swDesc);
    else delete window.navigator.serviceWorker;
    if (pmDesc) Object.defineProperty(window, 'PushManager', pmDesc);
    else delete window.PushManager;
  });
}

function stubNavigator({ userAgent, platform, maxTouchPoints }) {
  ['userAgent', 'platform', 'maxTouchPoints'].forEach((prop) => {
    const value = { userAgent, platform, maxTouchPoints }[prop];
    if (value === undefined) return;
    const original = Object.getOwnPropertyDescriptor(navigator, prop);
    Object.defineProperty(navigator, prop, { value, configurable: true });
    cleanups.push(() => {
      if (original) Object.defineProperty(navigator, prop, original);
      else delete navigator[prop];
    });
  });
}

describe('isPushSupported', () => {
  it('true when serviceWorker and PushManager both exist (desktop/Android Chrome)', () => {
    setSupport({ serviceWorker: true, pushManager: true });
    expect(isPushSupported()).toBe(true);
  });
  it('false when neither exists (iOS Safari in a plain tab, pre-install)', () => {
    setSupport({ serviceWorker: false, pushManager: false });
    expect(isPushSupported()).toBe(false);
  });
  it('false when only one of the two exists', () => {
    setSupport({ serviceWorker: true, pushManager: false });
    expect(isPushSupported()).toBe(false);
  });
});

describe('isIOS', () => {
  it('detects iPhone by user agent', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    expect(isIOS()).toBe(true);
  });
  it('detects iPad (real UA, not the MacIntel-disguise case)', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' });
    expect(isIOS()).toBe(true);
  });
  it('detects iPadOS 13+ disguised as MacIntel with touch points', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });
  it('a real Mac (MacIntel, no touch) is NOT iOS', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIOS()).toBe(false);
  });
  it('desktop Chrome (Windows) is NOT iOS', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', platform: 'Win32' });
    expect(isIOS()).toBe(false);
  });
  it('Android is NOT iOS', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    expect(isIOS()).toBe(false);
  });
});

describe('subscribePush — unsupported-browser messaging (regression: desktop Chrome was wrongly told to "add to home screen")', () => {
  it('on iOS without push support, tells the user to install to Home Screen', async () => {
    setSupport({ serviceWorker: false, pushManager: false });
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    await expect(subscribePush()).rejects.toThrow(/ecrã principal/);
  });

  it('on desktop Chrome without push support, gives a generic message — NEVER the iOS install hint', async () => {
    setSupport({ serviceWorker: false, pushManager: false });
    stubNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', platform: 'Win32' });
    await expect(subscribePush()).rejects.toThrow('Este navegador não suporta notificações push.');
  });

  it('does NOT require standalone/installed mode when push IS supported (desktop/Android tab)', async () => {
    setSupport({ serviceWorker: true, pushManager: true });
    stubNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', platform: 'Win32' });
    const originalNotification = global.Notification;
    global.Notification = { requestPermission: vi.fn().mockResolvedValue('denied') };
    cleanups.push(() => {
      global.Notification = originalNotification;
    });
    // Não deve rejeitar com a mensagem de instalação — chega a pedir
    // permissão nativa (e falha aí, por 'denied', não por falta de instalação
    // nem por matchMedia/standalone).
    await expect(subscribePush()).rejects.toThrow('Permissão de notificações recusada.');
  });
});

describe('isStandalone', () => {
  it('is a boolean and does not throw outside a real PWA context', () => {
    expect(typeof isStandalone()).toBe('boolean');
  });
});
