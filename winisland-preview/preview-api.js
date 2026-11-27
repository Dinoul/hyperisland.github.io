'use strict';

(() => {
const noop = () => {};
let statsListener = null;
let statsTimer = 0;
const previewStorage = new Map([['wi.onboarded', '1']]);

try {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => previewStorage.get(String(key)) ?? null,
      setItem: (key, value) => previewStorage.set(String(key), String(value)),
      removeItem: (key) => previewStorage.delete(String(key)),
      clear: () => previewStorage.clear(),
    },
  });
} catch {
  // Sandboxed browser contexts may not allow replacing the storage property.
}

function sampleStats() {
  const time = Date.now() / 5000;
  return {
    cpu: Math.round(18 + Math.sin(time) * 8),
    gpu: Math.round(12 + Math.cos(time * 0.8) * 5),
    mem: Math.round(46 + Math.sin(time * 0.55) * 3),
    disk: 24,
    host: 'Preview PC',
    uptime: 7380,
  };
}

const responses = {
  checkUpdates: () => ({ state: 'idle' }),
  discordConfig: () => null,
  discordCredentials: () => null,
  discordState: () => null,
  discordStatus: () => ({ running: false, window: false }),
  getClipboardHistory: () => [],
  getVolume: () => 0.62,
  getWeather: () => null,
  listTasks: () => ({ items: [] }),
  lyrics: () => ({ key: '', lines: [], plain: '' }),
  notesLoad: () => ({ notes: '' }),
  notesSave: () => ({ ok: true }),
  notificationsState: () => ({ state: 'connected' }),
  robloxRecent: () => [],
  robloxServerInfo: () => ({ available: false, active: false, detected: false, known: [] }),
  sampleGpu: () => sampleStats().gpu,
};

window.winIsland = new Proxy(Object.create(null), {
  get(_target, name) {
    if (typeof name !== 'string') return undefined;
    if (name === 'onStats') {
      return (callback) => {
        statsListener = callback;
        if (typeof callback === 'function') callback(sampleStats());
      };
    }
    if (name === 'watchStats') {
      return (watch) => {
        clearInterval(statsTimer);
        if (watch && statsListener) {
          statsTimer = setInterval(() => statsListener(sampleStats()), 1800);
        }
      };
    }
    if (name.startsWith('on') || name.startsWith('watch') || name === 'setMouseOver' || name === 'mediaCommand') {
      return noop;
    }
    return (...args) => Promise.resolve(
      Object.hasOwn(responses, name) ? responses[name](...args) : false,
    );
  },
});

const island = document.getElementById('island');
let lastPreviewMode = '';

function previewMode() {
  return island?.dataset.open === 'true' ? 'open' : 'compact';
}

function announcePreviewMode() {
  const mode = previewMode();
  if (mode === lastPreviewMode) return;
  lastPreviewMode = mode;
  if (mode === 'open') {
    document.documentElement.style.transition = 'none';
    document.documentElement.style.backgroundColor = 'transparent';
  }
  window.parent.postMessage({
    type: 'winisland-preview-state',
    mode,
  }, '*');
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || !event.data) return;
  if (event.data.type === 'winisland-preview-theme') {
    const background = event.data.background;
    if (typeof background === 'string' && CSS.supports('color', background)) {
      if (background === 'transparent') {
        document.documentElement.style.transition = 'none';
      } else {
        document.documentElement.style.removeProperty('transition');
      }
      document.documentElement.style.backgroundColor = background;
    }
  } else if (event.data.type === 'winisland-preview-request-state') {
    announcePreviewMode();
  }
});

if (island) {
  new MutationObserver(announcePreviewMode).observe(island, {
    attributes: true,
    attributeFilter: ['data-open'],
  });
}
window.addEventListener('load', announcePreviewMode);
})();
