'use strict';


const $ = (id) => document.getElementById(id);
const PAGE_TINTS = {
  media: '#8b5cf6',
  timer: '#f5a524',
  identify: '#22d3ee',
  system: '#3b82f6',
  clock: '#e2e8f0',
  clipboard: '#34d399',
  notes: '#fbbf24',
  tasks: '#2dd4bf',
  discord: '#5865f2',
  roblox: '#ff6b6b',
};

const island = $('island');

let islandTheme = 'auto';
let islandSurface = 'frosted';
let islandAccent = '#7aa2f7';
let islandScene = 'on';

const ISLAND_SURFACES = ['frosted', 'minimal'];
const ISLAND_ACCENTS = ['#7aa2f7', '#a78bfa', '#2dd4bf', '#4ade80', '#fbbf24', '#fb7185', '#e2e8f0', '#94a3b8'];
const lowEndDevice = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
if (lowEndDevice) document.documentElement.classList.add('low-end');
const api = window.winIsland || {
  setMouseOver() {},
  watchOutsideClicks() {},
  watchCycleKeys() {},
  onOutsideClick() {},
  onCyclePage() {},
  mediaCommand() {},
  onMedia() {},
  onMediaArt() {},
  onPipState() {},
  onDownloads() {},
  onStats() {},
  onCursor() {},
  checkUpdates: async () => ({ state: 'error', message: 'Update checks are unavailable' }),
  installUpdate: async () => false,
  openUpdateRelease: async () => false,
  onUpdate() {},
  openExternal: async () => false,
  lyrics: async () => ({ key: '', lines: [], plain: '' }),
  discordStatus: async () => ({ running: false, window: false }),
  discordAction: async () => ({ running: false, window: false }),
  discordState: async () => null,
  discordConfig: async () => null,
  discordForget: async () => null,
  discordCommand: async () => null,
  onDiscord() {},
  robloxServerInfo: async () => ({ available: false, active: false, detected: false, known: [] }),
  robloxKill: async () => ({ ok: false, reason: 'unavailable' }),
  notesLoad: async () => ({ notes: '' }),
  notesSave: async () => ({ ok: false }),
  notificationsState: async () => ({ state: 'package-required' }),
  enableNotifications: async () => ({ ok: false }),
  dismissNotification: async () => ({ ok: false }),
  onWindowsNotification() {},
  onNotificationRemoved() {},
  onNotificationsStatus() {},
  quickAction: async () => ({ ok: false }),
};

const PAGES = ['media', 'timer', 'identify', 'system', 'clock', 'clipboard', 'notes', 'tasks', 'discord', 'roblox', 'settings'];
const RING = 2 * Math.PI * 27;
const BUBBLE_RING = 2 * Math.PI * 20;
const pad2 = (value) => String(value).padStart(2, '0');

// Writing textContent always dirties layout, so skip unchanged values.
function setText(id, value) {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}

const state = {
  hidden: false,
  open: false,
  page: 'clock',
  activity: 'clock',
  media: null,
  art: null,
  battery: { level: 1, charging: false, minutes: null, volts: null },
  stats: { cpu: 0, mem: 0, disk: 0, host: '' },
  gpu: 0,
  clock24: true,
  pageSince: 0,
  timer: {
    unit: 'm', duration: 300, remaining: 300, running: false, endsAt: 0, done: false, pomodoro: false, phase: 'focus' },
};

/* ------------------------------------------------------------------ format */

function fmtMS(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad2(minutes)}:${pad2(total % 60)}` : `${minutes}:${pad2(total % 60)}`;
}

function fmtPillTimer(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad2(minutes)}:${pad2(total % 60)}` : `${pad2(minutes)}:${pad2(total % 60)}`;
}

function fmtClock(date) {
  if (state.clock24) return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const hours = date.getHours() % 12 || 12;
  return `${hours}:${pad2(date.getMinutes())} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

/* -------------------------------------------------------------- activities */

function activities() {
  const list = [];
  // A paused timer still belongs in the bubble while it has time on it.
  if (state.timer.running || state.timer.done || state.timer.remaining < state.timer.duration) list.push('timer');
  // Plugged in is enough: a level that has not been reported yet reads as
  // 100%, which used to hide the charging face entirely.
  // The charging face is a 2 s flash: plugging in, or any percentage step,
  // brings it back with its ripple; otherwise the pill stays a clock.
  if (state.battery.charging && chargingFlashUntil > Date.now()) list.push('charging');
  // The collapsed island returns to its home clock face as soon as playback
  // pauses or stops. The Media tab itself remains available when opened.
  if (state.media && state.media.playing) list.push('media');
  list.push('clock');
  return list;
}

function timerVisible() {
  const timer = state.timer;
  return Boolean(timer.running || timer.done || timer.remaining < timer.duration);
}

function downloadsOn() {
  try {
    return dlItems.length > 0 || island.dataset.bubble === 'true';
  } catch {
    return false;
  }
}

// An active timer owns the pill unless a live activity needs the main face.
function syncActivity() {
  const list = activities();
  const rest = list.filter((name) => name !== 'timer');
  const mediaPlaying = Boolean(state.media && state.media.playing);
  const busy = mediaPlaying || rest.includes('charging') || downloadsOn();
  const showTimer = timerVisible();

  state.timerBubble = showTimer && busy;

  // Music first, then a plugged-in charger, then the timer bubble. 'clock'
  // is always in the list, so the old "is the current one still there"
  // check kept the pill on the clock face and the charging view never showed.
  if (mediaPlaying) state.activity = 'media';
  else if (rest.includes('charging')) state.activity = 'charging';
  else if (showTimer && !busy) state.activity = 'timer';
  else if (!rest.includes(state.activity)) state.activity = rest[0];

  if (state.open && !PAGES.includes(state.page)) state.page = state.activity;
}


function apply() {
  syncStatsWatch();
  syncClipboardWatch();
  if (typeof syncDlFace === 'function') syncDlFace();
  syncActivity();
  island.dataset.open = String(state.open);
  island.dataset.activity = state.activity;
  island.dataset.tmode = timerVisible() ? (state.timerBubble ? 'bubble' : 'pill') : 'off';
  island.dataset.page = state.page;
  syncSceneTint();
  document.querySelectorAll('#uTabs button[data-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.tab === state.page));
  });
  positionTabSelectorSoon();
  island.dataset.timer = state.timer.done
    ? 'done'
    : state.timer.running
      ? 'running'
      : state.timer.remaining < state.timer.duration
        ? 'paused'
        : 'idle';

}

// CPU / RAM is only shown on the clock card, so it is only sampled while open.
let statsWatching = false;

function syncStatsWatch() {
  const want = state.open && (state.page === 'clock' || state.page === 'system');
  if (want === statsWatching) return;
  statsWatching = want;
  api.watchStats(want);
}

// Everything that only makes sense while a card is up (the outside-click
// watcher, the arrow keys) is switched on and off with it.
let openWatchersOn = false;

function watchOpenState(on) {
  if (on === openWatchersOn) return;
  openWatchersOn = on;
  if (api.watchOutsideClicks) api.watchOutsideClicks(on);
  if (api.watchCycleKeys) api.watchCycleKeys(on);
}

let clipboardWatching = false;
function syncClipboardWatch() {
  const on = state.open && state.page === 'clipboard';
  if (on === clipboardWatching) return;
  clipboardWatching = on;
  if (api.watchClipboard) api.watchClipboard(on);
}

/* ------------------------------------------------------------ motion blur
   A plain CSS blur() animation runs on the compositor and is cleared by the
   browser itself: no per-frame script, and no filter being added or removed
   mid-flight (that swap is what made tab changes "snap" back). */

const LIQUID_SOFT = 'linear(0, 0.0204, 0.0729, 0.1464, 0.2321, 0.3232, 0.4146, 0.5028, 0.5852, 0.6603, 0.7272, 0.7858, 0.836, 0.8783, 0.9133, 0.9418, 0.9644, 0.982, 0.9953, 1.0051, 1.0118, 1.0162, 1.0187, 1.0198, 1.0198, 1.0191, 1.0178, 1.0162, 1.0144, 1.0126, 1)';

function smear(el) {
  unsmear(el);
}

function unsmear(el) {
  if (!el || !el.getAnimations) return;
  el.getAnimations().forEach((animation) => {
    const frames = animation.effect && animation.effect.getKeyframes ? animation.effect.getKeyframes() : [];
    if (frames.some((frame) => Object.prototype.hasOwnProperty.call(frame, 'filter'))) animation.cancel();
  });
}

function openIsland(page) {
  const wanted = page || state.activity;
  state.page = wanted === 'charging' ? 'system' : wanted;
  state.open = true;
  applyMouseOver(true);
  apply();
  renderPage();
  watchOpenState(true);
  state.pageSince = Date.now();
  if (state.page !== 'timer') smear($('card'), 'v', 6, 620);
}

function closeIsland() {
  if (lyricsOpen()) toggleLyrics(false);
  state.open = false;
  apply();
  watchOpenState(false);
  if (state.page !== 'timer') smear($('pill'), 'h', 5, 560);
}

// Cards slide in from the side they came from, so the tabs read as a strip.
// Cards travel a full width sideways, like a strip of tabs: the old one
// leaves the way it came from while the new one arrives.
let sliding = [];

// A ride that gets cut short (fast tab tapping) used to leave the old page
// pinned mid-flight, which showed up as a stray strip of an old page hanging
// outside the card, so every new ride starts from a clean slate.
function clearSlide(el) {
  if (!el) return;
  el.getAnimations().forEach((anim) => anim.cancel());
  unsmear(el);
  el.style.transform = '';
  el.style.visibility = '';
  el.style.opacity = '';
  el.style.zIndex = '';
}

function slidePages(next, previous, direction) {
  if (!direction) return;

  sliding.forEach(clearSlide);
  sliding = [];

  // no overshoot and no scaling here: either one opens a gap between the two pages
  const timing = { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' };
  const incoming = document.querySelector('.page[data-page="' + next + '"]');
  const outgoing =
    previous && previous !== next ? document.querySelector('.page[data-page="' + previous + '"]') : null;
  const rides = [];

  if (incoming) {
    incoming.style.zIndex = '3';
    rides.push(incoming.animate(
      [
        { transform: 'translateX(' + direction * 100 + '%)', opacity: 0.6 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      timing
    ));
  }

  if (outgoing) {
    // The stylesheet hides the old page the moment the attribute flips, so it
    // is pinned visible for the length of the ride.
    outgoing.style.visibility = 'visible';
    outgoing.style.opacity = '1';
    outgoing.style.zIndex = '2';

    rides.push(outgoing.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(' + -direction * 100 + '%)' },
      ],
      timing
    ));
  }

  sliding = [incoming, outgoing];

  // the tab change smears sideways, the height change smears up and down
  smear(incoming, 'h', 6, 560);
  smear(outgoing, 'h', 5, 460);

  // `finished` rejects when a ride is cancelled, hence the catch: cleanup has
  // to happen either way.
  Promise.all(rides.map((ride) => ride.finished.catch(() => {}))).then(() => {
    if (sliding[0] !== incoming && sliding[1] !== outgoing) return;
    clearSlide(incoming);
    clearSlide(outgoing);
  });
}

function setPage(page) {
  const from = PAGES.indexOf(state.page);
  const to = PAGES.indexOf(page);
  const previous = state.page;

  state.page = page;
  state.open = true;
  if (page !== 'media' && typeof setVolOpen === 'function') setVolOpen(false);
  if (page === 'clock' || page === 'clipboard') renderClipboard();
  apply();
  renderPage();

  if (from !== -1 && to !== -1 && from !== to) {
    if (page === 'timer' || previous === 'timer') {
      sliding.forEach(clearSlide);
      sliding = [];
      const incoming = document.querySelector('.page[data-page="' + page + '"]');
      if (incoming && incoming.animate) {
        incoming.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], {
          duration: 180,
          easing: 'ease-out',
        });
      }
    } else {
      slidePages(page, previous, to > from ? 1 : -1);
    }
  }
  state.pageSince = Date.now();
}


let notesLoaded = false;
let notesLoading = false;
let notesRevision = 0;
let notesSaveTimer = 0;
let notesSaveChain = Promise.resolve();

async function loadNotes() {
  if (notesLoaded || notesLoading) return;
  notesLoading = true;
  try {
    const result = await api.notesLoad();
    const editor = $('notesEditor');
    if (editor) {
      editor.value = String(result && result.notes || '');
      editor.disabled = false;
    }
    notesLoaded = true;
    setText('notesStatus', 'Saved on this PC');
  } catch {
    const editor = $('notesEditor');
    if (editor) editor.disabled = false;
    setText('notesStatus', 'Could not load notes');
  } finally {
    notesLoading = false;
  }
}

function renderNotes() {
  loadNotes();
}

function scheduleNotesSave() {
  notesRevision += 1;
  setText('notesStatus', 'Saving…');
  clearTimeout(notesSaveTimer);
  const revision = notesRevision;
  const contents = $('notesEditor').value;
  notesSaveTimer = setTimeout(() => {
    notesSaveChain = notesSaveChain.catch(() => {}).then(() => api.notesSave(contents));
    notesSaveChain.then((result) => {
      if (revision !== notesRevision) return;
      setText('notesStatus', result && result.ok ? 'Saved on this PC' : 'Could not save notes');
    }).catch(() => {
      if (revision === notesRevision) setText('notesStatus', 'Could not save notes');
    });
  }, 350);
}

$('notesEditor').addEventListener('input', scheduleNotesSave);

let activeIslandAlert = null;
let islandAlertTimer = 0;
let robloxJoinTick = 0;
let lastRobloxJoin = null;
let islandAlertQueue = [];
// Timers for the notification card's in/out smear.
let alertEnterTimer = 0;
let alertExitTimer = 0;

function clearIslandAlert() {
  clearInterval(robloxJoinTick);
  clearTimeout(islandAlertTimer);
  islandAlertTimer = 0;
  const alert = $('islandAlert');
  island.dataset.alertAction = 'false';
  activeIslandAlert = null;

  // The card fades out with its own smear while the island contracts, so the
  // collapse reads as motion instead of a cut back to the idle pill.
  island.dataset.alert = 'false';
  if (alert && !alert.hidden) {
    island.dataset.alertMotion = 'out';
    clearTimeout(alertExitTimer);
    alertExitTimer = setTimeout(() => {
      alert.hidden = true;
      if (island.dataset.alert !== 'true') island.dataset.alertMotion = '';
    }, 220);
  } else {
    island.dataset.alertMotion = '';
  }

  if (islandAlertQueue.length) {
    const next = islandAlertQueue.shift();
    clearTimeout(alertExitTimer);
    alertExitTimer = setTimeout(() => showIslandAlert(next), 110);
  }
}

function showIslandAlert(item, queue = true) {
  if (!item) return;
  if (activeIslandAlert && queue) {
    if (item.replace && activeIslandAlert.kind === item.kind) {
      // Keep one update card and refresh its progress while downloading.
    } else if (activeIslandAlert.persistent) {
      islandAlertQueue.unshift(activeIslandAlert);
      if (islandAlertQueue.length > 40) islandAlertQueue.pop();
      activeIslandAlert = null;
    } else {
      islandAlertQueue.push(item);
      if (islandAlertQueue.length > 40) islandAlertQueue.shift();
      return;
    }
  }
  clearTimeout(islandAlertTimer);
  clearTimeout(alertExitTimer);
  activeIslandAlert = item;
  const alert = $('islandAlert');
  const icon = $('alertIcon');
  const image = $('alertImage');
  alert.dataset.kind = item.kind || 'notification';
  alert.hidden = false;
  island.dataset.alert = 'true';
  island.dataset.alertKind = item.kind || 'notification';
  island.dataset.alertMotion = 'in';
  island.dataset.alertAction = item.action ? 'true' : 'false';
  setText('alertSource', item.source || 'Windows notification');
  setText('alertTitle', item.title || 'Notification');
  setText('alertBody', item.body || '');
  const action = $('alertAction');
  action.hidden = !item.action;
  setText('alertAction', item.action || 'Allow access');
  action.onclick = item.actionHandler
    ? async () => { clearIslandAlert(); await item.actionHandler(); }
    : null;
  if (item.iconUrl) {
    image.hidden = false;
    image.src = item.iconUrl;
    image.onerror = () => { image.hidden = true; icon.classList.remove('has-image'); };
    icon.classList.add('has-image');
  } else {
    image.hidden = true;
    image.removeAttribute('src');
    icon.classList.remove('has-image');
    const symbol = item.kind === 'bluetooth' ? 'i-bluetooth' : item.kind === 'discord-call' ? 'i-discord' : item.kind === 'update' ? 'i-repeat' : 'i-bell';
    icon.querySelector('use').setAttribute('href', `#${symbol}`);
  }
  clearTimeout(alertEnterTimer);
  alertEnterTimer = setTimeout(() => {
    if (island.dataset.alert === 'true') island.dataset.alertMotion = '';
  }, 480);
  islandAlertTimer = item.persistent ? 0 : setTimeout(clearIslandAlert, item.duration || 6500);
}

$('alertDismiss').addEventListener('click', clearIslandAlert);

// The helper only exists in a packaged build. If the request cannot be sent,
// say so instead of silently closing the card.
async function requestNotificationAccess() {
  const sent = await api.enableNotifications().catch(() => false);
  if (sent === true || (sent && sent.ok)) return;
  showIslandAlert({
    kind: 'notification',
    source: 'WinIsland alerts',
    title: 'Notification helper is not running',
    body: 'Notification access needs the installed MSIX build. Install it and restart WinIsland.',
    persistent: true,
    replace: true,
  });
}

api.onWindowsNotification((item) => {
  if (!item) return;
  showIslandAlert({
    kind: 'notification',
    source: item.app || 'Windows notification',
    title: item.title || item.app || 'Notification',
    body: item.body || '',
    iconUrl: item.icon || '',
  });
});
api.onNotificationsStatus((status) => {
  if (!status) return;
  if (status.state === 'connected' && activeIslandAlert && activeIslandAlert.kind === 'notification' && activeIslandAlert.persistent) {
    islandAlertQueue = islandAlertQueue.filter((item) => !item.persistent || item.kind !== 'notification');
    clearIslandAlert();
  } else if (status.state === 'checking') {
    showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Enable Windows notifications', body: 'Allow access so Windows alerts can appear inside the island.', action: 'Allow access', actionHandler: requestNotificationAccess, persistent: true, replace: true });
  } else if (status.state === 'permission-needed') {
    showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Allow notifications', body: status.message || 'Tap Allow to show Windows alerts in the island and dismiss their Windows copies.', action: 'Allow access', actionHandler: requestNotificationAccess, persistent: true, replace: true });
  } else if (status.state === 'denied') {
    showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Notification access is off', body: status.message || 'Enable WinIsland under Windows notification access settings.', persistent: true, replace: true });
  } else if (status.state === 'unsupported' || status.state === 'error' || status.state === 'package-required') {
    showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Notification listener unavailable', body: status.message || (status.state === 'package-required' ? 'Install the MSIX build to enable Windows notification access.' : 'Restart WinIsland and try again.'), persistent: true, replace: true });
  }
});
api.notificationsState().then((status) => {
  if (status && ['checking', 'permission-needed', 'denied', 'unsupported', 'error', 'package-required'].includes(status.state)) {
    const label = status.state;
    if (label === 'checking') showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Enable Windows notifications', body: 'Allow access so Windows alerts can appear inside the island.', action: 'Allow access', actionHandler: requestNotificationAccess, persistent: true, replace: true });
    else if (label === 'permission-needed') showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Allow notifications', body: status.message || 'Tap Allow to show Windows alerts in the island and dismiss their Windows copies.', action: 'Allow access', actionHandler: requestNotificationAccess, persistent: true, replace: true });
    else if (label === 'denied') showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Notification access is off', body: status.message || 'Enable WinIsland under Windows notification access settings.', persistent: true, replace: true });
    else showIslandAlert({ kind: 'notification', source: 'WinIsland alerts', title: 'Notification listener unavailable', body: status.message || (label === 'package-required' ? 'Install the MSIX build to enable Windows notification access.' : 'Restart WinIsland and try again.'), persistent: true, replace: true });
  }
}).catch(() => {});
api.onBluetoothConnected((device) => showIslandAlert({
  kind: 'bluetooth', source: 'Connected', title: device && device.name || 'Bluetooth device', body: '',
}));

function renderPage() {
  if (state.page === 'media') renderMedia();
  if (state.page === 'timer') renderTimer();
  if (state.page === 'system') renderSystem();
  if (state.page === 'clock') renderClock();
  if (state.page === 'notes') renderNotes();
  if (state.page === 'tasks') renderTasks();
  if (state.page === 'discord') {
    renderDiscord();
    loadDiscord();
  }
  if (state.page === 'roblox') {
    loadRobloxInfo();
    loadRobloxRecent(true);
  }
}

/* ------------------------------------------------------------------- media */

function appName(appId) {
  if (!appId) return 'Unknown source';
  const parts = appId.split(/[\\/]/);
  const exe = parts[parts.length - 1].replace(/\.exe$/i, '');
  return exe.charAt(0).toUpperCase() + exe.slice(1);
}

function mediaPosition() {
  const media = state.media;
  if (!media) return { position: 0, duration: 0 };
  let position = media.position;
  if (media.playing) position += (Date.now() - media.receivedAt) / 1000;
  if (media.duration > 0) position = Math.min(position, media.duration);
  return { position, duration: media.duration };
}

// ---- spectrum -------------------------------------------------------------
// The bars follow the actual audio, captured from the system loopback so it
// works for any player. If capture is unavailable the CSS animation stays.

const waveBars = Array.from(document.querySelectorAll('#pillWave i'));
let waveStream = null;
let waveAnalyser = null;
let waveBins = null;
let waveFrame = 0;
let waveStarting = false;

async function startSpectrum() {
  if (waveAnalyser || waveStarting) return;
  waveStarting = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video: { mandatory: { chromeMediaSource: 'desktop' } },
    });

    stream.getVideoTracks().forEach((track) => {
      track.stop();
      stream.removeTrack(track);
    });

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    waveStream = stream;
    waveAnalyser = analyser;
    waveBins = new Uint8Array(analyser.frequencyBinCount);
    $('pillWave').classList.add('live');
    console.log('[spectrum] live');
  } catch (err) {
    console.log(`[spectrum] capture unavailable: ${err && err.message}`);
  } finally {
    waveStarting = false;
  }
}

let waveParity = 0;

function drawSpectrum() {
  waveFrame = 0;

  if (!waveAnalyser || !(state.media && state.media.playing) || state.hidden) return;

  // Thirty frames a second is plenty for five bars; the pill is rarely the
  // thing the eye is on.
  waveParity = (waveParity + 1) % (lowEndDevice ? 4 : 2);
  if (waveParity !== 0) {
    waveFrame = requestAnimationFrame(drawSpectrum);
    return;
  }

  waveAnalyser.getByteFrequencyData(waveBins);
  const total = waveBins.length;

  for (let i = 0; i < waveBars.length; i++) {
    // Spread the bars across the low/mid range the ear cares about.
    const from = Math.floor(Math.pow(i / waveBars.length, 1.5) * total * 0.62);
    const to = Math.max(from + 1, Math.floor(Math.pow((i + 1) / waveBars.length, 1.5) * total * 0.62));

    let sum = 0;
    for (let bin = from; bin < to; bin++) sum += waveBins[bin];

    const level = sum / (to - from) / 255;
    waveBars[i].style.height = `${(3 + level * 21).toFixed(1)}px`;
  }

  waveFrame = requestAnimationFrame(drawSpectrum);
}

let waveIdle = false;

function syncSpectrum() {
  const playing = !!(state.media && state.media.playing);

  if (!playing) {
    // renderPill runs several times a tick, so only touch the bars on the way down.
    if (waveIdle) return;
    waveIdle = true;
    waveBars.forEach((bar) => {
      bar.style.height = '';
    });
    return;
  }

  waveIdle = false;

  if (!waveAnalyser) {
    startSpectrum();
    return;
  }

  if (!waveFrame) waveFrame = requestAnimationFrame(drawSpectrum);
}

let pillDayKey = '';
let pillDayText = '';

let timeColorMinute = '';
function updateTimeColor(now = new Date()) {
  const minuteKey = `${now.getHours()}:${now.getMinutes()}`;
  if (minuteKey === timeColorMinute) return;
  timeColorMinute = minuteKey;
  const hour = now.getHours() + now.getMinutes() / 60;
  const sky = hour >= 6 && hour < 20 ? 'day' : 'night';
  island.dataset.sky = sky;
  const stops = [
    { at: 0, hue: 218, sat: 82, light: 52 },
    { at: 5, hue: 226, sat: 84, light: 55 },
    { at: 7, hue: 28, sat: 92, light: 56 },
    { at: 10, hue: 32, sat: 94, light: 58 },
    { at: 17, hue: 28, sat: 92, light: 56 },
    { at: 20, hue: 226, sat: 84, light: 55 },
    { at: 24, hue: 218, sat: 82, light: 52 },
  ];
  let index = 0;
  while (index < stops.length - 2 && hour > stops[index + 1].at) index++;
  const a = stops[index], b = stops[index + 1];
  const t = (hour - a.at) / (b.at - a.at);
  const mix = (key) => {
    let difference = b[key] - a[key];
    if (key === 'hue') difference = ((difference + 540) % 360) - 180;
    return Math.round((a[key] + difference * t + 360) % 360);
  };
  const root = document.documentElement.style;
  root.setProperty('--time-hue', String(mix('hue')));
  root.setProperty('--time-sat', `${mix('sat')}%`);
  root.setProperty('--time-light', `${mix('light')}%`);
}

// toLocaleString with a weekday is an ICU call; the answer only moves at midnight.
function pillDayLabel(now) {
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (key !== pillDayKey) {
    pillDayKey = key;
    pillDayText = `${now.toLocaleString('en-US', { weekday: 'short' })} ${now.getDate()}`;
  }
  return pillDayText;
}

function renderPill() {
  const now = new Date();
  updateTimeColor(now);
  island.dataset.mediaPalette = String(Boolean(state.media && state.media.playing && state.art));
  $('pillWave').classList.toggle('paused', !(state.media && state.media.playing));
  syncSpectrum();

  const lyric = state.media && state.media.playing && lyricState.index >= 0
    ? lyricState.lines[lyricState.index] && lyricState.lines[lyricState.index][1]
    : '';
  setText('pillMediaClock', lyric || fmtClock(now));
  setText('pillTimerTime', fmtPillTimer(timerRemaining()));

  setText('pillPercent', `${Math.round(state.battery.level * 100)}%`);
  setText('pillSource', batterySource());

  setText('pillClock', fmtClock(now));
  setText('pillDate', pillDayLabel(now));
}

/* ---- artwork palette ------------------------------------------------------
   The glow behind the card is taken from the playing video's thumbnail, so the
   gradient changes with whatever is on screen. */

const paletteCanvas = document.createElement('canvas');
paletteCanvas.width = 18;
paletteCanvas.height = 18;
const paletteCache = new Map();
let paletteCurrentSrc = '';

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h;

  if (max === red) h = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;

  return { h: h * 60, s, l };
}

function glow(hsl, light, alpha) {
  const saturation = Math.min(0.88, Math.max(0.22, hsl.s * 1.25 + 0.05));
  return `hsla(${Math.round(hsl.h)}, ${Math.round(saturation * 100)}%, ${Math.round(light * 100)}%, ${alpha})`;
}

function applyArtColors(src) {
  paletteCurrentSrc = src;
  if (paletteCache.has(src)) {
    const values = paletteCache.get(src);
    for (const [key, value] of Object.entries(values)) document.documentElement.style.setProperty(key, value);
    return;
  }
  const image = new Image();

  image.onload = () => {
    const context = paletteCanvas.getContext('2d');
    context.clearRect(0, 0, 18, 18);
    context.drawImage(image, 0, 0, 18, 18);

    let bits;
    try {
      bits = context.getImageData(0, 0, 18, 18).data;
    } catch {
      return;
    }

    let allR = 0, allG = 0, allB = 0, all = 0;
    let lowR = 0, lowG = 0, lowB = 0, low = 0;

    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 18; x++) {
        const i = (y * 18 + x) * 4;
        if (bits[i + 3] < 40) continue;

        allR += bits[i];
        allG += bits[i + 1];
        allB += bits[i + 2];
        all++;

        if (y >= 11) {
          lowR += bits[i];
          lowG += bits[i + 1];
          lowB += bits[i + 2];
          low++;
        }
      }
    }

    if (!all) return;

    const base = rgbToHsl(allR / all, allG / all, allB / all);
    const bottom = low ? rgbToHsl(lowR / low, lowG / low, lowB / low) : base;
    const root = document.documentElement.style;
    if (paletteCurrentSrc !== src) return;
    const colors = {
      '--glow-a': glow(bottom, Math.min(0.46, Math.max(0.26, bottom.l)), 1),
      '--glow-a-top': glow(bottom, Math.min(0.78, Math.max(0.58, bottom.l + 0.3)), 1),
      '--glow-a-soft': glow(bottom, 0.44, 0.22),
      '--glow-b': glow(base, Math.min(0.3, Math.max(0.15, base.l * 0.7)), 1),
    };
    if (paletteCache.size >= 32) paletteCache.delete(paletteCache.keys().next().value);
    paletteCache.set(src, colors);
    for (const [key, value] of Object.entries(colors)) root.setProperty(key, value);
  };

  image.src = src;
}

function clearArtColors() {
  const root = document.documentElement.style;
  ['--glow-a', '--glow-a-soft', '--glow-b'].forEach((name) => root.removeProperty(name));
}

function renderMedia() {
  const media = state.media;
  setText('mTitle', media ? media.title || 'Unknown track' : 'Nothing playing');
  setText('mArtist', media ? media.artist || appName(media.app) : 'Start a video or a song');

  const hasArt = !!state.art;
  $('mArt').style.backgroundImage = hasArt ? `url("${state.art}")` : '';
  $('mArt').classList.toggle('has-art', hasArt);
  if (hasArt) $('mediaBg').style.setProperty('--art', `url("${state.art}")`);
  else $('mediaBg').style.removeProperty('--art');

  const playing = !!(media && media.playing);
  document.body.classList.toggle('playing', playing);
  document.querySelectorAll('.m-controls [data-cmd]').forEach((button) => {
    button.classList.toggle('disabled', !media);
  });

  const repeat = media && media.repeat ? String(media.repeat) : 'None';
  const repeatOn = repeat === 'Track' || repeat === 'List';
  if ($('mRepeat')) {
    $('mRepeat').classList.toggle('on', repeatOn);
    $('mRepeat').classList.toggle('one', repeat === 'Track');
    $('mRepeat').title = repeat === 'Track' ? 'Repeat one' : repeat === 'List' ? 'Repeat all' : 'Repeat off';
  }
  if ($('mShuffle')) {
    $('mShuffle').classList.toggle('on', !!(media && media.shuffle));
    $('mShuffle').title = media && media.shuffle ? 'Shuffle on' : 'Shuffle off';
  }


  updateProgress();
  loadLyrics(media);
  renderPill();
}

let scrubbing = false;

function previewSeek(ratio) {
  const duration = (state.media && state.media.duration) || 0;
  $('mFill').style.width = `${ratio * 100}%`;
  $('mKnob').style.left = `${ratio * 100}%`;
  $('mElapsed').textContent = fmtMS(ratio * duration);
}

function seekRatio(event) {
  const track = $('mTrack');
  if (!track || !state.media || !state.media.duration) return null;
  const rect = track.getBoundingClientRect();
  if (!rect.width) return null;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

let lastProgressPaint = -1;

function updateProgress() {
  if (scrubbing) return;

  const { position, duration } = mediaPosition();
  const ratio = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  const percent = Math.round(ratio * 1000) / 10;

  // Repainting the bar four times a second for a tenth of a percent is waste.
  if (percent !== lastProgressPaint) {
    lastProgressPaint = percent;
    $('mFill').style.width = `${percent}%`;
    $('mKnob').style.left = `${percent}%`;
  }

  setText('mElapsed', fmtMS(position));
  setText('mTotal', duration > 0 ? fmtMS(duration) : '0:00');
}

/* ------------------------------------------------------------------- timer */

const TIMER_UNITS = [
  { id: 's', seconds: 1, label: 'sec' },
  { id: 'm', seconds: 60, label: 'min' },
  { id: 'h', seconds: 3600, label: 'hr' },
];

function timerUnit() {
  return TIMER_UNITS.find((unit) => unit.id === state.timer.unit) || TIMER_UNITS[1];
}

function fmtTimer(total) {
  const seconds = Math.max(0, Math.round(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

// Steps the timer by one selected unit, clamped to a sensible day.
function stepTimer(direction, times = 1) {
  const timer = state.timer;
  const step = timerUnit().seconds * direction * times;
  const limit = 24 * 3600;

  if (timer.running) {
    timer.remaining = Math.min(limit, Math.max(0, timerRemaining() + step));
    timer.endsAt = Date.now() + timer.remaining * 1000;
    timer.duration = Math.max(timer.duration, timer.remaining);
  } else {
    timer.duration = Math.min(limit, Math.max(0, timer.duration + step));
    timer.remaining = timer.duration;
    timer.done = false;
  }

  renderTimer(direction);
  apply();
}

function cycleUnit() {
  const index = TIMER_UNITS.findIndex((unit) => unit.id === state.timer.unit);
  const next = TIMER_UNITS[(index + 1) % TIMER_UNITS.length];
  state.timer.unit = next.id;
  $('tUnit').textContent = next.label;
}

function timerRemaining() {
  return state.timer.running ? Math.max(0, (state.timer.endsAt - Date.now()) / 1000) : state.timer.remaining;
}

// Rebuilds the clock face as single characters so a step only animates the
// digit that actually moved.
function paintTimerDigits(shown, direction) {
  const time = $('tTime');
  time.classList.toggle('long', shown.length > 5);

  const chars = Array.from(shown);

  if (time.children.length !== chars.length) {
    time.textContent = '';
    chars.forEach((char) => {
      const digit = document.createElement('span');
      digit.className = 'd';
      digit.textContent = char;
      time.appendChild(digit);
    });
    return;
  }

  chars.forEach((char, index) => {
    const digit = time.children[index];
    if (digit.textContent === char) return;

    digit.textContent = char;
    if (!direction) return;

    // A rising value drops in from below, a falling one from above.
    const from = direction > 0 ? 0.42 : -0.42;
    digit.animate(
      [
        { transform: `translateY(${from}em)`, opacity: 0.3, filter: 'blur(5px)' },
        { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' },
      ],
      { duration: 190, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }
    );
  });
}

function renderTimer(direction = 0) {
  const timer = state.timer;
  const remaining = timerRemaining();
  const ratio = timer.duration > 0 ? Math.max(0, Math.min(1, remaining / timer.duration)) : 0;
  const shown = fmtTimer(remaining);
  const time = $('tTime');

  if (time.textContent !== shown) paintTimerDigits(shown, direction);

  $('tUnit').textContent = timerUnit().label;
  $('tLabel').textContent = timer.done
    ? "Time's up"
    : timer.pomodoro
      ? timer.phase === 'break'
        ? 'Break'
        : 'Focus'
      : 'Timer';

  const pomoChip = $('tPomodoro');
  if (pomoChip) pomoChip.classList.toggle('on', timer.pomodoro);
  $('tArc').style.strokeDashoffset = String(RING * (1 - ratio));
  $('tBubbleArc').style.strokeDashoffset = String(BUBBLE_RING * (1 - ratio));
  // No digits on the bubble: the ring is the progress; the pill beside it has the time.
  $('tBubble').setAttribute('aria-label', `Timer, ${shown} left`);

  document.querySelectorAll('#tPresets button').forEach((button) => {
    // During a pomodoro cycle the presets are not what is running.
    button.classList.toggle('sel', !timer.pomodoro && Number(button.dataset.min) * 60 === timer.duration);
  });

  renderPill();
}

function toggleTimer() {
  const timer = state.timer;
  if (timer.done) {
    resetTimer();
    return;
  }
  if (timer.running) {
    timer.remaining = timerRemaining();
    timer.running = false;
  } else {
    if (timer.remaining <= 0) timer.remaining = timer.duration;
    timer.endsAt = Date.now() + timer.remaining * 1000;
    timer.running = true;
    // The pill keeps whatever it was showing (music, clock); the timer has its
    // own bubble beside it.
  }
  syncActivity();
  apply();
  renderTimer();
  state.pageSince = Date.now();
}



function resetTimer() {
  const timer = state.timer;
  timer.running = false;
  timer.done = false;
  timer.pomodoro = false;
  timer.phase = 'focus';
  timer.remaining = timer.duration;
  syncActivity();
  apply();
  renderTimer();
}

// 25 minutes of focus, then 5 off, until the cycle is switched off.
function togglePomodoro() {
  const timer = state.timer;
  timer.pomodoro = !timer.pomodoro;
  timer.phase = 'focus';
  timer.done = false;
  timer.running = false;
  timer.duration = timer.pomodoro ? 25 * 60 : 5 * 60;
  timer.remaining = timer.duration;
  syncActivity();
  apply();
  renderTimer();
  state.pageSince = Date.now();
}

function selectPreset(minutes) {
  const timer = state.timer;
  timer.pomodoro = false;
  timer.phase = 'focus';
  timer.duration = minutes * 60;
  timer.remaining = timer.duration;
  timer.running = false;
  timer.done = false;
  syncActivity();
  apply();
  renderTimer(minutes > 0 ? 1 : 0);
}

let audio;
function chime() {
  try {
    audio = audio || new AudioContext();
    const start = audio.currentTime;
    [880, 1174.66, 1567.98].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + index * 0.17;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.6);
    });
  } catch {
    /* audio is optional */
  }
}

function tickTimer() {
  const timer = state.timer;

  if (!timer.running) return;

  if (timerRemaining() <= 0 && timer.pomodoro) {
    // Roll straight into the other half of the cycle instead of stopping.
    timer.phase = timer.phase === 'focus' ? 'break' : 'focus';
    timer.duration = (timer.phase === 'break' ? 5 : 25) * 60;
    timer.remaining = timer.duration;
    timer.endsAt = Date.now() + timer.duration * 1000;
    timer.done = false;
    timer.running = true;
    chime();
    syncActivity();
    apply();
    renderTimer();
    return;
  }

  if (timerRemaining() <= 0) {
    timer.running = false;
    timer.done = true;
    timer.remaining = 0;
    chime();
    state.activity = 'timer';
    state.page = 'timer';
    state.open = true;
    apply();
  }
  renderTimer();
}

/* --------------------------------------------------------------- charging */

let batteryPoll = 0;
let powerWatchStarted = false;

function batterySource() {
  const battery = state.battery;
  if (!battery.charging) return 'BAT';
  const volts = Number(battery.volts);
  return Number.isFinite(volts) && volts > 0 ? `${volts.toFixed(2)}V` : 'AC';
}

// One long-running probe: it is what notices the charger going in or out
// even when Chromium's battery events stay quiet.
function startPowerWatch() {
  if (powerWatchStarted) return;
  powerWatchStarted = true;
  if (api.watchPower) api.watchPower(true);
}

const CHARGING_FLASH_MS = 4000;
let chargingFlashUntil = 0;
let chargingFlashTimer = 0;

function flashCharging() {
  chargingFlashUntil = Date.now() + CHARGING_FLASH_MS;
  clearTimeout(chargingFlashTimer);
  chargingFlashTimer = setTimeout(() => {
    chargingFlashUntil = 0;
    syncActivity();
    apply();
    renderPill();
  }, CHARGING_FLASH_MS);
}

// Unplugging kills the face and its ripple immediately instead of waiting for
// the flash to run out.
function stopChargingFlash() {
  if (!chargingFlashUntil) return;
  chargingFlashUntil = 0;
  clearTimeout(chargingFlashTimer);
}

async function watchBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();

    // Chromium's battery events can arrive late or not at all on some machines,
    // so the level is sampled too: every step of the charge reaches the pill.
    const update = () => {
      const level = Math.round(battery.level * 1000) / 1000;
      const charging = Boolean(battery.charging);
      const minutes = Number.isFinite(battery.chargingTime) ? Math.round(battery.chargingTime / 60) : null;
      if (level === state.battery.level && charging === state.battery.charging && minutes === state.battery.minutes) return;
      const wasCharging = state.battery.charging;
      const previousLevel = state.battery.level;
      state.battery = { level, charging, minutes, volts: charging ? state.battery.volts : null };
      if (charging && (charging !== wasCharging || level !== previousLevel)) flashCharging();
      else if (!charging && wasCharging) stopChargingFlash();
      syncActivity();
      apply();
      renderPill();
      startPowerWatch();
    };

    ['levelchange', 'chargingchange', 'chargingtimechange'].forEach((event) => battery.addEventListener(event, update));
    update();
    startPowerWatch();
    clearInterval(batteryPoll);
    batteryPoll = setInterval(update, 5000);
  } catch {
    /* battery info is optional */
  }
}

if (api.onPowerStatus) {
  api.onPowerStatus((power) => {
    if (!power) return;

    const volts = Number(power.volts) > 0 ? Number(power.volts) : null;
    const charging = typeof power.charging === 'boolean' ? power.charging : state.battery.charging;
    const percent = Number(power.percent);
    const level = Number.isFinite(percent) && percent > 0 ? percent / 100 : state.battery.level;

    if (volts === state.battery.volts && charging === state.battery.charging && level === state.battery.level) {
      renderPill();
      return;
    }

    const wasCharging = state.battery.charging;
    const previousLevel = state.battery.level;
    state.battery = { ...state.battery, volts, charging, level };
    if (charging && (charging !== wasCharging || level !== previousLevel)) flashCharging();
    else if (!charging && wasCharging) stopChargingFlash();
    syncActivity();
    apply();
    renderPill();
  });
}

/* ------------------------------------------------------------ clock/calendar */

function setSys(key, value) {
  const shown = Math.max(0, Math.min(100, Math.round(value || 0)));
  setText(`sys${key}`, `${shown}%`);
  const bar = $(`sys${key}Bar`);
  if (bar) bar.style.width = `${shown}%`;
}

const SYS_METER_RGB = {
  cpu: '125, 180, 255',
  gpu: '185, 162, 255',
  ram: '111, 240, 176',
  disk: '255, 196, 138',
};

// The card is washed with the same four colours as the bars, each sitting in
// its own corner and brightening as that reading climbs.
function paintSystemBg(cpu, gpu, ram, disk) {
  const page = document.querySelector('.page-system');
  if (!page) return;

  const glow = (rgb, value, x, y) => {
    const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / 100));
    const alpha = (0.07 + ratio * 0.42).toFixed(2);
    return `radial-gradient(95% 135% at ${x}% ${y}%, rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, 0) 62%)`;
  };

  page.style.setProperty(
    '--sys-bg',
    [
      glow(SYS_METER_RGB.cpu, cpu, 10, 2),
      glow(SYS_METER_RGB.gpu, gpu, 90, 28),
      glow(SYS_METER_RGB.ram, ram, 16, 104),
      glow(SYS_METER_RGB.disk, disk, 86, 100),
      'linear-gradient(160deg, color-mix(in srgb, #101725 62%, transparent) 0%, '
        + 'color-mix(in srgb, #0a0e16 58%, transparent) 62%, '
        + 'color-mix(in srgb, #07080d 55%, transparent) 100%)',
    ].join(', ')
  );
}

function fmtUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function batteryText() {
  const level = Math.round((state.battery.level || 0) * 100);
  return state.battery.charging ? `${level}% · charging` : `${level}% · battery`;
}

function renderSystem() {
  setSys('Cpu', state.stats.cpu);
  setSys('Gpu', state.gpu);
  setSys('Ram', state.stats.mem);
  setSys('Disk', state.stats.disk);
  paintSystemBg(state.stats.cpu, state.gpu, state.stats.mem, state.stats.disk);
  renderSpark();
  setText('sysHost', state.stats.host || 'this PC');
  setText('sysUptime', `Up ${fmtUptime(state.stats.uptime)}`);
  setText('sysBatt', batteryText());
  renderPill();
}

let tasksLoading = false;

async function renderTasks() {
  if (tasksLoading) return;
  tasksLoading = true;
  let data;
  try { data = await api.listTasks(); } catch { data = null; }
  tasksLoading = false;

  const list = $('tkList');
  if (!list) return;
  const scroll = list.scrollTop;
  list.innerHTML = '';

  const items = (data && data.items) || [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'tk-row';
    empty.textContent = 'No processes';
    list.append(empty);
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'tk-row';

    const name = document.createElement('span');
    name.className = 'tk-name';
    name.textContent = item.name || item.executable || 'Process';
    name.title = `${item.executable || item.name || 'Process'} · PID ${item.id}`;

    const mem = document.createElement('span');
    mem.className = 'tk-mem';
    mem.textContent = `${item.mem} MB`;

    const end = document.createElement('button');
    end.className = 'tk-kill';
    end.textContent = '✕';
    end.title = `End ${item.name}`;
    end.addEventListener('click', async () => {
      end.disabled = true;
      end.textContent = '…';
      let result;
      try { result = await api.killTask(item.id); } catch { result = { ok: false, error: 'Could not ask Windows to end this process.' }; }
      if (result && result.ok) {
        setTimeout(renderTasks, 350);
      } else {
        end.disabled = false;
        end.textContent = '✕';
        end.title = result && result.error || 'Windows could not end this process. It may need administrator access.';
      }
    });

    row.append(name, mem, end);
    list.append(row);
  }

  list.scrollTop = scroll;
}

// The clock card keeps a short version of the list and the clipboard tab shows
// the whole thing; both are filled from the same read.
function clipboardRow(entry) {
  const isImage = entry.kind === 'image' && entry.image;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = isImage ? 'cb-item img' : 'cb-item';

  if (isImage) {
    const picture = document.createElement('img');
    picture.src = entry.image.startsWith('data:') ? entry.image : 'data:image/png;base64,' + entry.image;
    picture.alt = 'Copied image';
    row.appendChild(picture);
  } else {
    row.textContent = String(entry.text || '').trim();
    row.title = entry.text || '';
  }

  row.addEventListener('click', async () => {
    if (isImage) {
      const url = entry.image.startsWith('data:') ? entry.image : 'data:image/png;base64,' + entry.image;
      await api.copyImage(url);
    } else {
      await api.copyText(entry.text || '');
    }

    row.classList.add('copied');
    pulseBlur(row);
    setTimeout(() => row.classList.remove('copied'), 1100);
  });

  return row;
}

function fillClipboard(list, items, limit) {
  if (!list) return;

  list.textContent = '';
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cb-empty';
    empty.textContent = 'Nothing copied yet';
    list.appendChild(empty);
    return;
  }

  items.slice(0, limit).forEach((item) => {
    const entry = typeof item === 'string' ? { kind: 'text', text: item } : item || {};
    list.appendChild(clipboardRow(entry));
  });
}

async function renderClipboard() {
  if (!$('cbList') && !$('cbPageList')) return;

  const items = await api.getClipboardHistory();
  fillClipboard($('cbList'), items, 8);
  fillClipboard($('cbPageList'), items, 60);
}

function weatherIcon(code) {
  if (code === 0) return '☀';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄';
  if (code <= 82) return '🌦';
  if (code <= 86) return '🌨';
  return '⛈';
}

let weatherAsked = false;
let weatherFetchedAt = 0;
let weatherRetryAt = 0;

function renderWeather() {
  const el = $('clkWeather');
  if (!el || !state.weather) return;

  el.textContent = `${weatherIcon(state.weather.code)} ${state.weather.temp}°`;
  el.title = state.weather.city || 'Weather';
}

function loadWeather(force = false) {
  if (weatherAsked || (!force && Date.now() - weatherFetchedAt < 60 * 1000) || Date.now() < weatherRetryAt) return;
  weatherAsked = true;

  api.getWeather(force || Boolean(state.weather)).then((data) => {
    if (!data) {
      weatherAsked = false;
      weatherRetryAt = Date.now() + 15 * 1000;
      return;
    }
    state.weather = data;
    weatherFetchedAt = Date.now();
    weatherRetryAt = 0;
    renderWeather();
  }).catch(() => {
    weatherAsked = false;
    weatherRetryAt = Date.now() + 15 * 1000;
  }).finally(() => { weatherAsked = false; });
}

let clockDayKey = '';

function renderClock() {
  const now = new Date();
  setText('clkTime', fmtClock(now));
  paintWorldTimes();

  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (dayKey !== clockDayKey) {
    clockDayKey = dayKey;
    setText('clkDate', now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  loadWeather();
  setText('clkStats', `CPU ${state.stats.cpu}% · RAM ${state.stats.mem}%`);
  renderPill();
}

/* ------------------------------------------------------------------- discord */

let discord = { running: false, window: false };
let dcRpc = null;
let discordBusy = false;
let discordAsked = 0;
let wasDiscordInCall = false;
const dcRows = new Map();
const dcChat = [];
const dcChatNodes = new Map();
const DC_CHAT_MAX = 3;
const DC_CHAT_TTL = 12000;

// Messages from the voice channel's own text chat ("text in voice") plus any
// message a person in the call sends there. They peel in from the left edge of
// the Discord tab and expire on their own.
function renderDiscordChat() {
  const box = $('dcChat');
  if (!box) return;

  const inCall = Boolean(dcRpc && dcRpc.status === 'connected' && dcRpc.channel);
  if (state.page !== 'discord' || !inCall || dcChat.length === 0) {
    box.hidden = true;
    box.textContent = '';
    dcChatNodes.clear();
    return;
  }

  box.hidden = false;
  const live = new Set(dcChat.map((message) => message.key));
  for (const [key, node] of dcChatNodes) {
    if (live.has(key)) continue;
    node.remove();
    dcChatNodes.delete(key);
  }

  dcChat.forEach((message) => {
    if (dcChatNodes.has(message.key)) return;

    const node = document.createElement('div');
    node.className = message.mine ? 'dc-msg me' : 'dc-msg';

    const dot = document.createElement('span');
    dot.className = 'dc-msg-dot';
    dot.textContent = (message.author || '?').trim().charAt(0).toUpperCase() || '?';

    const author = document.createElement('span');
    author.className = 'dc-msg-author';
    author.textContent = message.mine ? 'You' : message.author || 'Discord';

    const text = document.createElement('span');
    text.className = 'dc-msg-text';
    text.textContent = message.content;

    node.append(dot, author, text);
    box.appendChild(node);
    dcChatNodes.set(message.key, node);
  });
}

function pushDiscordChat(message) {
  if (!message || !message.content) return;
  const key = String(message.id || Date.now());
  if (dcChat.some((item) => item.key === key)) return;

  dcChat.push({ ...message, key });
  while (dcChat.length > DC_CHAT_MAX) dcChat.shift();
  renderDiscordChat();

  setTimeout(() => {
    const at = dcChat.findIndex((item) => item.key === key);
    if (at === -1) return;
    dcChat.splice(at, 1);
    renderDiscordChat();
  }, DC_CHAT_TTL);
}

if (api.onDiscordMessage) api.onDiscordMessage(pushDiscordChat);


const DC_STATUS_TEXT = {
  setup: 'Not linked',
  'needs-auth': 'Ready to connect',
  connecting: 'Connecting…',
  authorizing: 'Approve in Discord',
  connected: 'Connected',
  closed: 'Closed',
  error: 'Error',
};

function dcMode() {
  const status = dcRpc ? dcRpc.status : 'closed';
  if (status === 'setup') return 'setup';
  if (status === 'connected' && dcRpc.channel) return 'call';
  return 'idle';
}

function renderDiscord() {
  const rpc = dcRpc;
  const status = rpc ? rpc.status : discord.running ? 'connecting' : 'closed';
  const mode = dcMode();
  island.dataset.dc = mode;
  renderDiscordChat();

  setText('dcStateText', DC_STATUS_TEXT[status] || 'Closed');
  const chip = $('dcState');
  if (chip) chip.classList.toggle('on', status === 'connected');

  $('dcSetup').hidden = mode !== 'setup';
  $('dcLive').hidden = mode === 'setup';
  if (mode === 'setup') {
    if (rpc && rpc.clientId && !$('dcClientId').value) $('dcClientId').value = rpc.clientId;
    const err = rpc && rpc.error ? rpc.error : '';
    setText('dcSetupMsg', err);
    return;
  }

  const inCall = status === 'connected' && rpc.channel;
  let name = 'Discord';
  let sub = '';

  if (status === 'connected') {
    name = inCall ? rpc.channel.name : 'Not in a call';
    sub = inCall ? rpc.members.length + (rpc.members.length === 1 ? ' person' : ' people') + ' here' : 'Join a voice channel to see who is in it';
    if (rpc.error) sub = rpc.error;
    else if (inCall && rpc.chatAccess === false) sub = 'Reconnect to read in-call messages';
  } else if (status === 'authorizing') {
    name = 'Approve the request';
    sub = 'Credentials saved · approve in Discord';
  } else if (status === 'error') {
    name = 'Could not connect';
    const error = rpc.error || 'Try again';
    sub = /authoriz|refus|denied/i.test(error)
      ? `${error}. Check that Discord for Windows and the Developer Portal use the same account, that the current Client ID and Secret match, and that the saved redirect is exactly http://localhost. Discord may restrict RPC voice access for the application.`
      : error;
  } else if (status === 'connecting') {
    name = 'Connecting…';
    sub = 'Credentials saved on this PC';
  } else if (status === 'needs-auth') {
    name = 'Connect Discord';
    sub = 'Saved credentials · click Connect to authorize';
  } else {
    name = 'Discord is closed';
    sub = 'Open it to see your call';
  }

  setText('dcName', name);
  setText('dcSub', sub);
  $('dcSub').classList.toggle('err', status === 'error' || Boolean(rpc && rpc.error));

  const live = status === 'connected';
  const connectButton = $('dcConnect');
  connectButton.hidden = !live && !(rpc && rpc.hasConfig && (status === 'needs-auth' || status === 'error'));
  connectButton.disabled = live;
  connectButton.classList.toggle('connected', live);
  connectButton.querySelector('span').textContent = live ? 'Connected' : 'Connect';
  const mute = $('dcMute');
  const deaf = $('dcDeaf');
  const leave = $('dcLeave');
  mute.classList.toggle('on', live && rpc.mute);
  deaf.classList.toggle('on', live && rpc.deaf);
  mute.querySelector('span').textContent = live && rpc.mute ? 'Unmute' : 'Mute';
  deaf.querySelector('span').textContent = live && rpc.deaf ? 'Undeafen' : 'Deafen';
  leave.disabled = !inCall;
  // Mute and deafen fall back to Discord's own shortcuts when the link is off.
  mute.disabled = false;
  deaf.disabled = false;

  renderDcMembers(inCall ? rpc.members : []);
}

function renderDcMembers(list) {
  const box = $('dcMembers');
  const seen = new Set();

  list.forEach((member) => {
    seen.add(member.id);
    let row = dcRows.get(member.id);

    if (!row) {
      row = document.createElement('div');
      row.className = 'dc-member';
      row.innerHTML = '<span class="dc-avatar"></span><span class="dc-mname"></span><span class="dc-flags"></span><span class="dc-user-controls"><span class="dc-user-volume"></span><button type="button" data-voice-action="volume-down" aria-label="Turn volume down">−</button><button type="button" data-voice-action="volume-up" aria-label="Turn volume up">+</button><button type="button" class="dc-user-mute" data-voice-action="mute" aria-label="Mute member"><svg class="ic"><use href="#i-mute" /></svg></button></span>';
      row.querySelectorAll('[data-voice-action]').forEach((button) => {
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
            if (row.dataset.voiceBusy === 'true') return;
            row.dataset.voiceBusy = 'true';
          const controls = Array.from(row.querySelectorAll('[data-voice-action]'));
          controls.forEach((item) => { item.disabled = true; });
          try {
            const next = await api.discordUserVoice(row.dataset.userId, button.dataset.voiceAction);
            if (next) dcRpc = next;
          } catch (error) {
            if (dcRpc) dcRpc.error = error.message || 'Discord did not accept that voice setting';
            } finally {
              delete row.dataset.voiceBusy;
              renderDiscord();
          }
        });
      });
      dcRows.set(member.id, row);
      box.appendChild(row);
    }

    row.dataset.userId = member.id;
    row.classList.toggle('speaking', member.speaking);
    const label = member.name + (member.me ? ' (you)' : '');
    const nameEl = row.children[1];
    if (nameEl.textContent !== label) nameEl.textContent = label;

    const avatar = row.children[0];
    const url = member.avatar ? 'url("' + member.avatar + '")' : '';
    if (avatar.dataset.src !== member.avatar) {
      avatar.dataset.src = member.avatar;
      avatar.style.backgroundImage = url;
    }

    const flags = row.children[2];
    const sig = (member.deaf ? 'd' : member.muted ? 'm' : '');
    if (flags.dataset.sig !== sig) {
      flags.dataset.sig = sig;
      flags.innerHTML = sig
        ? '<svg class="ic"><use href="#' + (sig === 'd' ? 'i-headset' : 'i-mute') + '" /></svg>'
        : '';
    }

    const controls = row.querySelector('.dc-user-controls');
    const volume = Math.max(0, Math.min(200, Math.round(Number(member.localVolume) || 0)));
    const volumeEl = row.querySelector('.dc-user-volume');
    volumeEl.textContent = `${volume}%`;
    volumeEl.title = `This PC only · ${volume}%`;
    controls.hidden = Boolean(member.me);
    const localMute = row.querySelector('[data-voice-action="mute"]');
    localMute.classList.toggle('on', Boolean(member.localMuted));
    localMute.setAttribute('aria-label', member.localMuted ? `Unmute ${member.name} on this PC` : `Mute ${member.name} on this PC`);
    localMute.title = member.localMuted ? 'Unmute on this PC' : 'Mute on this PC';
    const down = row.querySelector('[data-voice-action="volume-down"]');
    const up = row.querySelector('[data-voice-action="volume-up"]');
    down.setAttribute('aria-label', `Lower ${member.name} volume`);
    up.setAttribute('aria-label', `Raise ${member.name} volume`);
    down.title = 'Lower volume by 20%';
    up.title = 'Raise volume by 20%';
    const voiceBusy = row.dataset.voiceBusy === 'true';
    down.disabled = Boolean(member.me) || volume <= 0 || voiceBusy;
    up.disabled = Boolean(member.me) || volume >= 200 || voiceBusy;
    localMute.disabled = Boolean(member.me) || voiceBusy;
  });

  dcRows.forEach((row, id) => {
    if (seen.has(id)) return;
    dcRows.delete(id);
    row.remove();
  });
}

async function loadDiscord() {
  if (discordBusy || Date.now() - discordAsked < 4000) return;
  discordBusy = true;
  discordAsked = Date.now();

  if (!dcRpc && api.discordState) dcRpc = await api.discordState();

  // Only ask PowerShell about the window while the link is down.
  if (!dcRpc || dcRpc.status !== 'connected') {
    const next = await api.discordStatus();
    if (next) discord = { running: !!next.running, window: !!next.window };
  }

  discordBusy = false;
  renderDiscord();
}

async function discordAction(action, button) {
  if (button) button.classList.add('busy');

  try {
    if (action === 'open') {
      const next = await api.discordAction('open');
      if (next) discord = { running: !!next.running, window: !!next.window };
    } else if (action === 'retry') {
      const next = await api.discordCommand('retry');
      if (next) dcRpc = next;
    } else if (dcRpc && dcRpc.status === 'connected') {
      const next = await api.discordCommand(action);
      if (next) dcRpc = next;
    } else if (action === 'mute' || action === 'deafen') {
      const next = await api.discordAction(action);
      if (next) discord = { running: !!next.running, window: !!next.window };
    }
  } finally {
    if (button) {
      button.classList.remove('busy');
      pulseBlur(button);
    }
  }

  renderDiscord();
}

let dcCredentialSaveTimer = 0;
let dcCredentialSaveVersion = 0;
let dcCredentialSaveDirty = false;
let dcCredentialSaveChain = Promise.resolve();

async function persistDcCredentials(version) {
  const cfg = { clientId: $('dcClientId').value, secret: $('dcSecret').value };
  const request = dcCredentialSaveChain.catch(() => null).then(() => api.discordSaveCredentials(cfg));
  dcCredentialSaveChain = request;
  try {
    const next = await request;
    if (version === dcCredentialSaveVersion) {
      dcCredentialSaveDirty = false;
      if (next) dcRpc = next;
      const failed = Boolean(next && next.error && !next.credentialsSaved);
      setText('dcSaveState', failed ? next.error : 'Saved on this PC');
      $('dcSaveState').classList.toggle('has-error', failed);
    }
    return next;
  } catch {
    if (version === dcCredentialSaveVersion) {
      setText('dcSaveState', 'Could not save yet — check the app data folder');
      $('dcSaveState').classList.add('has-error');
    }
    return null;
  }
}

function queueDcCredentialSave() {
  dcCredentialSaveVersion += 1;
  dcCredentialSaveDirty = true;
  clearTimeout(dcCredentialSaveTimer);
  setText('dcSaveState', 'Saving…');
  $('dcSaveState').classList.remove('has-error');
  const version = dcCredentialSaveVersion;
  dcCredentialSaveTimer = setTimeout(() => {
    dcCredentialSaveTimer = 0;
    persistDcCredentials(version);
  }, 450);
}

async function flushDcCredentialSave() {
  clearTimeout(dcCredentialSaveTimer);
  dcCredentialSaveTimer = 0;
  if (dcCredentialSaveDirty) return persistDcCredentials(dcCredentialSaveVersion);
  return dcCredentialSaveChain.catch(() => null);
}

function wireDiscord() {
  document.querySelectorAll('[data-dc]').forEach((button) => {
    button.addEventListener('click', () => discordAction(button.dataset.dc, button));
  });

  if (api.onDiscord) {
    api.onDiscord((snapshot) => {
      const inCall = Boolean(snapshot && snapshot.status === 'connected' && snapshot.channel);
      if (inCall && !wasDiscordInCall) {
        showIslandAlert({ kind: 'discord-call', source: 'Discord', title: 'Connected to a call', body: snapshot.channel.name || 'Voice channel' });
      }
      wasDiscordInCall = inCall;
      dcRpc = snapshot;
      if (state.page === 'discord') renderDiscord();
    });
  }
  if (api.discordState) api.discordState().then((snapshot) => (dcRpc = snapshot)).catch(() => {});
  if (api.discordCredentials) {
    api.discordCredentials().then((saved) => {
      if (!saved) return;
      if (!$('dcClientId').value) $('dcClientId').value = saved.clientId || '';
      if (!$('dcSecret').value) $('dcSecret').value = saved.secret || '';
      if (saved.clientId && saved.secret) setText('dcSaveState', 'Saved on this PC');
    }).catch(() => {});
  }

  $('dcClientId').addEventListener('input', queueDcCredentialSave);
  $('dcSecret').addEventListener('input', queueDcCredentialSave);
  $('dcClientId').addEventListener('blur', flushDcCredentialSave);
  $('dcSecret').addEventListener('blur', flushDcCredentialSave);

  $('dcSave').addEventListener('click', async () => {
    const button = $('dcSave');
    button.classList.add('busy');
    try {
      await flushDcCredentialSave();
      const next = await api.discordConfig({ clientId: $('dcClientId').value, secret: $('dcSecret').value });
      if (next) dcRpc = next;
    } catch {
      dcRpc = {
        ...(dcRpc || {}),
        status: 'setup',
        error: 'WinIsland could not save these credentials. They are still in the form; try again.',
        clientId: $('dcClientId').value,
        hasConfig: false,
        credentialsSaved: false,
      };
    } finally {
      button.classList.remove('busy');
    }
    renderDiscord();
  });

  $('dcCopyRedirect').addEventListener('click', async () => {
    const button = $('dcCopyRedirect');
    await api.copyText('http://localhost');
    button.textContent = 'Copied!';
    clearTimeout(button.copyResetTimer);
    button.copyResetTimer = setTimeout(() => { button.textContent = 'Copy'; }, 1400);
  });

  $('dcPortal').addEventListener('click', (event) => api.openExternal('https://discord.com/developers/applications', event.isTrusted));

  $('dcReset').addEventListener('click', async () => {
    const next = await api.discordForget();
    if (next) dcRpc = next;
    renderDiscord();
  });
}


/* ------------------------------------------------------------------ live scene
   A small version of the Interactive Interfaces wallpaper: the sun arcs across
   the sky during the day, the moon takes over at night, and the open tab tints
   the whole thing with its own colour. */

const SCENE_PALETTES = {
  night: {
    top: '#04060c', mid: '#091120', low: '#16273c',
    inner: '#f4f8ff', outer: '#c6d3e9', glow: 'rgba(198, 216, 245, 0.42)',
    far: '#1b2c42', farDeep: '#0e1826', mid2: '#22364f', midDeep: '#111d2c',
    near: '#0a1420', nearDeep: '#04070c', stars: '0.9', ray: 'rgba(200, 220, 245, 0.35)', rayOp: '0',
  },
  dawn: {
    top: '#101a2e', mid: '#3b3550', low: '#8d6b6a',
    inner: '#ffe1c6', outer: '#f3a97e', glow: 'rgba(255, 176, 130, 0.5)',
    far: '#3a3550', farDeep: '#241f33', mid2: '#4a3f55', midDeep: '#2a2438',
    near: '#171420', nearDeep: '#0a0810', stars: '0.3', ray: 'rgba(255, 205, 160, 0.5)', rayOp: '0.4',
  },
  day: {
    top: '#1e3a63', mid: '#4f7cab', low: '#a6c6dd',
    inner: '#ffffff', outer: '#eaf3ff', glow: 'rgba(222, 240, 255, 0.58)',
    far: '#5b86ae', farDeep: '#3a5b7c', mid2: '#4a7ba3', midDeep: '#2d4f6c',
    near: '#22384c', nearDeep: '#101c26', stars: '0.05', ray: 'rgba(255, 246, 214, 0.62)', rayOp: '0.62',
  },
  black: {
    top: '#000000', mid: '#04060a', low: '#0a0d13',
    inner: '#e6edf8', outer: '#8b98ad', glow: 'rgba(150, 170, 200, 0.28)',
    far: '#0c1017', farDeep: '#05070b', mid2: '#0a0e14', midDeep: '#04060a',
    near: '#04060a', nearDeep: '#000000', stars: '0.5', ray: 'rgba(255, 255, 255, 0.2)', rayOp: '0',
  },
  dusk: {
    top: '#0d1524', mid: '#2b3a58', low: '#8a5f6b',
    inner: '#fff1e0', outer: '#f0b48a', glow: 'rgba(255, 190, 150, 0.5)',
    far: '#2b3a58', farDeep: '#182437', mid2: '#35405c', midDeep: '#1d2437',
    near: '#0d1521', nearDeep: '#05080e', stars: '0.55', ray: 'rgba(255, 178, 122, 0.5)', rayOp: '0.45',
  },
};



let sceneTimer = 0;

function scenePhaseFor(hour) {
  if (hour < 5 || hour >= 20.5) return 'night';
  if (hour < 7.5) return 'dawn';
  if (hour < 17.5) return 'day';
  return 'dusk';
}

function updateScene() {
  const scene = $('scene');
  if (!scene) return;

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const phase = scenePhaseFor(hour);
  const theme = islandTheme === 'auto' ? phase : (SCENE_PALETTES[islandTheme] ? islandTheme : phase);
  const palette = SCENE_PALETTES[theme];

  scene.style.setProperty('--sky-top', palette.top);
  scene.style.setProperty('--sky-mid', palette.mid);
  scene.style.setProperty('--sky-low', palette.low);
  scene.style.setProperty('--orb-inner', palette.inner);
  scene.style.setProperty('--orb-outer', palette.outer);
  scene.style.setProperty('--orb-glow', palette.glow);
  scene.style.setProperty('--ridge-far', palette.far);
  scene.style.setProperty('--ridge-far-deep', palette.farDeep);
  scene.style.setProperty('--ridge-mid', palette.mid2);
  scene.style.setProperty('--ridge-mid-deep', palette.midDeep);
  scene.style.setProperty('--ridge-near', palette.near);
  scene.style.setProperty('--ridge-near-deep', palette.nearDeep);
  scene.style.setProperty('--star-op', palette.stars);
  scene.style.setProperty('--ray-color', palette.ray || 'rgba(255, 240, 200, 0.5)');
  scene.style.setProperty('--ray-op', palette.rayOp || '0.5');
  scene.dataset.phase = phase;
  scene.dataset.theme = theme;

  const orb = scene.querySelector('.scene-orb');
  if (orb) orb.dataset.orb = theme === 'night' || theme === 'black' ? 'moon' : 'sun';

  let progress;
  let size;
  if (theme === 'night' || theme === 'black') {
    // The moon runs from 19:00 to 06:00.
    const nightHour = hour < 12 ? hour + 24 : hour;
    progress = Math.min(1, Math.max(0, (nightHour - 19) / 11));
    size = '76px';
  } else {
    // The sun runs from 06:00 to 19:00.
    progress = Math.min(1, Math.max(0, (hour - 6) / 13));
    size = theme === 'day' ? '96px' : '86px';
  }

  const x = 10 + 80 * progress;
  const y = 58 - 38 * Math.sin(Math.PI * progress);
  scene.style.setProperty('--orb-x', x.toFixed(1) + '%');
  scene.style.setProperty('--orb-y', y.toFixed(1) + '%');
  scene.style.setProperty('--orb-size', size);
}

function syncSceneTint() {
  const color = PAGE_TINTS[state.page] || '#7aa2f7';
  if (island.style.getPropertyValue('--tab-tint') === color) return;
  island.style.setProperty('--tab-tint', color);
}

function buildSceneStars() {
  const box = $('sceneStars');
  if (!box || box.childElementCount) return;
  for (let index = 0; index < 46; index += 1) {
    const star = document.createElement('i');
    if (index % 9 === 0) star.className = 'big';
    star.style.left = (Math.random() * 100).toFixed(2) + '%';
    star.style.top = (Math.random() * 100).toFixed(2) + '%';
    star.style.animationDelay = (Math.random() * 3.8).toFixed(2) + 's';
    star.style.animationDuration = (3 + Math.random() * 3).toFixed(2) + 's';
    box.appendChild(star);
  }
}

function wireScene() {
  buildSceneStars();
  updateScene();
  syncSceneTint();
  clearInterval(sceneTimer);
  sceneTimer = setInterval(updateScene, 60000);
}


function fmtUptime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
  return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

function robloxJoinLocation(info) {
  const place = [info.city, info.region, info.country].filter(Boolean).join(', ');
  if (!place) return 'Location: detecting…';
  return ('Location: ' + [info.flag, place].filter(Boolean).join(' ')).trim();
}

function robloxJoinStats(info) {
  const uptime = 'Uptime: ' + fmtUptime(Date.now() - (Number(info.joinedAt) || Date.now()));
  const count = Number(info.players) || 0;
  const slots = Number(info.maxPlayers) || 0;
  // Game-wide players against a per-server cap is not a slot count, so it is
  // only shown as a fraction when the numbers actually fit.
  const players = count > 0 && slots > 0 && count <= slots
    ? count + '/' + slots + ' players'
    : count > 0
      ? count + ' playing now'
      : '';
  return [uptime, players].filter(Boolean).join(' • ');
}

function robloxJoinBody(info) {
  return robloxJoinLocation(info) + '\n' + robloxJoinStats(info);
}

function announceRobloxJoin(info) {
  if (!info || !info.placeId) return;
  lastRobloxJoin = info;
  showIslandAlert({
    kind: 'roblox-join',
    source: 'Connected to public server',
    title: info.name || 'Roblox experience',
    body: robloxJoinBody(info),
    iconUrl: info.icon || '',
    action: 'Save game',
    actionHandler: async () => {
      try {
        await api.robloxSaveRecent(info.placeId);
      } catch {
        /* the shelf refreshes on its own */
      }
    },
    duration: 11000,
  });

  clearInterval(robloxJoinTick);
  robloxJoinTick = setInterval(() => {
    if (!activeIslandAlert || activeIslandAlert.kind !== 'roblox-join') {
      clearInterval(robloxJoinTick);
      return;
    }
    setText('alertBody', robloxJoinBody(lastRobloxJoin || {}));
  }, 1000);
}

if (api.onRobloxJoin) {
  api.onRobloxJoin((info) => {
    // With the card open the tab already shows the join; the compact alert is
    // for the collapsed island the user is actually looking at.
    if (state.open) return;
    announceRobloxJoin(info);
  });
}

/* ---------------------------------------------------------- Roblox detector */

let robloxInfoBusy = false;
let robloxInfoAt = 0;
let robloxInfo = null;
let robloxInfoTimer = 0;
let robloxRecent = [];
let robloxRecentAt = 0;
let robloxRecentBusy = false;

function robloxAgo(stamp) {
  const diff = Date.now() - (Number(stamp) || 0);
  if (!Number.isFinite(diff) || diff < 0) return 'recently';
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return Math.max(1, Math.round(diff / 60000)) + 'm ago';
  if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + 'h ago';
  return Math.round(diff / 86400000) + 'd ago';
}

function renderRobloxRecent() {
  const list = $('rbRecent');
  if (!list) return;
  list.textContent = '';

  if (!robloxRecent.length) {
    const empty = document.createElement('div');
    empty.className = 'rb-empty';
    empty.textContent = 'Games you launch or play show up here';
    list.appendChild(empty);
    return;
  }

  robloxRecent.slice(0, 6).forEach((game) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rb-recent-row';
    row.dataset.placeId = game.placeId;
    row.title = 'Play ' + game.name;

    if (game.icon) {
      const img = document.createElement('img');
      img.className = 'rb-recent-icon';
      img.src = game.icon;
      img.alt = '';
      row.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'rb-recent-icon rb-recent-fallback';
      fallback.textContent = (game.name || 'R').trim().charAt(0).toUpperCase() || 'R';
      row.appendChild(fallback);
    }

    const copy = document.createElement('span');
    copy.className = 'rb-recent-copy';
    const name = document.createElement('span');
    name.className = 'rb-recent-name';
    name.textContent = game.name;
    const meta = document.createElement('span');
    meta.className = 'rb-recent-meta';
    meta.textContent = robloxAgo(game.at);
    copy.append(name, meta);

    const play = document.createElement('span');
    play.className = 'rb-recent-play';
    play.textContent = 'Play';

    row.append(copy, play);
    list.appendChild(row);
  });
}

async function loadRobloxRecent(force = false) {
  if (robloxRecentBusy || (!force && Date.now() - robloxRecentAt < 5000)) return;
  robloxRecentBusy = true;
  try {
    const result = await api.robloxRecent();
    robloxRecent = Array.isArray(result && result.games) ? result.games : [];
    robloxRecentAt = Date.now();
    renderRobloxRecent();
  } catch {
    /* keep the last list */
  } finally {
    robloxRecentBusy = false;
  }
}

async function playRobloxGame(placeId, row) {
  if (!placeId || !row || row.classList.contains('launching')) return;
  const label = row.querySelector('.rb-recent-play');
  row.classList.add('launching');
  if (label) label.textContent = 'Opening';
  try {
    const result = await api.robloxPlay(placeId);
    if (result && result.ok) {
      setTimeout(() => loadRobloxRecent(true), 900);
    } else if (label) {
      label.textContent = 'Failed';
    }
  } catch {
    if (label) label.textContent = 'Failed';
  } finally {
    setTimeout(() => {
      row.classList.remove('launching');
      if (label) label.textContent = 'Play';
    }, 1600);
  }
}

function renderRobloxInfo() {
  const info = robloxInfo;
  const stateText = $('rbState');
  const title = $('rbCurrentTitle');
  const detail = $('rbCurrentDetail');
  const ping = $('rbCurrentPing');
  const pingLabel = $('rbPingLabel');
  const list = $('rbKnownList');
  const killButton = $('rbKill');
  if (!stateText || !title || !detail || !ping || !pingLabel || !list || !killButton) return;

  const active = Boolean(info && info.active);
  const detected = Boolean(info && info.detected && info.current);
  const hasGameName = Boolean(active && info && info.gameName);
  killButton.hidden = !active;

  // The game you are in right now: what it is, where the server is, and a way
  // to keep it on the shelf.
  const joined = $('rbJoined');
  if (joined) {
    const placeId = info && info.placeId ? String(info.placeId) : '';
    joined.hidden = !(active && placeId);
    if (active && placeId) {
      setText('rbJoinedName', (info && info.gameName) || 'Roblox experience');
      const where = [
        info.current && info.current.city,
        info.current && info.current.country,
        info.current && info.current.region,
      ].filter(Boolean).join(' · ');
      const stats = robloxJoinStats({ ...info, joinedAt: info.joinedAt || Date.now() });
      setText('rbJoinedWhere', [where || 'Waiting for a server location', stats].filter(Boolean).join(' · '));
      const img = $('rbJoinedImg');
      const tile = $('rbJoinedIcon');
      if (img && tile) {
        if (info.icon) {
          img.src = info.icon;
          img.hidden = false;
          tile.classList.add('has-image');
        } else {
          img.removeAttribute('src');
          img.hidden = true;
          tile.classList.remove('has-image');
        }
      }
      joined.dataset.placeId = placeId;
      const save = $('rbSave');
      if (save && save.dataset.placeId !== placeId) {
        save.dataset.placeId = placeId;
        save.textContent = 'Save';
        save.disabled = false;
      }
    }
  }
  stateText.textContent = detected ? 'SERVER FOUND' : active ? hasGameName ? 'IN GAME · SERVER NOT FOUND' : 'IN GAME · FINDING SERVER' : 'NOT IN GAME';
  stateText.classList.toggle('active', detected);
  title.textContent = hasGameName
    ? info.gameName
    : detected
    ? [info.current.city, info.current.country].filter(Boolean).join(', ')
    : active ? 'Roblox is running' : 'Join a Roblox game';
  detail.textContent = detected
    ? [info.current.region, 'Voidstrap server detector'].filter(Boolean).join(' · ')
    : hasGameName ? 'Current Roblox experience'
      : active ? 'Waiting for a detected game server connection' : 'Live game and server info appears here automatically';
  ping.textContent = detected && Number.isFinite(info.current.livePingMs) ? `${info.current.livePingMs} ms` : '— ms';
  pingLabel.textContent = detected && !Number.isFinite(info.current.livePingMs) ? 'no ping reply' : 'live RTT';

  list.textContent = '';
  const known = Array.isArray(info && info.known) ? info.known : [];
  if (!info || !info.available) {
    const row = document.createElement('div');
    row.className = 'rb-empty';
    row.textContent = 'Voidstrap server detector data is unavailable';
    list.appendChild(row);
    return;
  }
  if (!known.length) {
    const row = document.createElement('div');
    row.className = 'rb-empty';
    row.textContent = 'No detected server locations yet';
    list.appendChild(row);
    return;
  }
  known.slice(0, 5).forEach((server) => {
    const row = document.createElement('div');
    row.className = 'rb-row';
    const place = document.createElement('span');
    place.className = 'rb-place';
    place.textContent = [server.city, server.country].filter(Boolean).join(', ') || 'Unknown region';
    const meta = document.createElement('span');
    meta.className = 'rb-meta';
    meta.textContent = `${Number(server.seenCount) || 0} detections`;
    row.append(place, meta);
    list.appendChild(row);
  });
}

async function loadRobloxInfo(force = false) {
  if (robloxInfoBusy || (!force && Date.now() - robloxInfoAt < 2200)) return;
  robloxInfoBusy = true;
  try {
    robloxInfo = await api.robloxServerInfo();
    robloxInfoAt = Date.now();
    renderRobloxInfo();
    loadRobloxRecent();
  } catch {
    robloxInfo = { available: false, active: false, detected: false, known: [] };
    renderRobloxInfo();
  } finally {
    robloxInfoBusy = false;
  }
}

function wireRobloxInfo() {
  $('rbRefresh').addEventListener('click', () => {
    loadRobloxInfo(true);
    loadRobloxRecent(true);
  });

  const saveButton = $('rbSave');
  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const placeId = saveButton.dataset.placeId;
      if (!placeId || saveButton.disabled) return;
      saveButton.disabled = true;
      saveButton.textContent = 'Saving';
      try {
        const result = await api.robloxSaveRecent(placeId);
        if (result && result.ok) {
          saveButton.textContent = 'Saved';
          loadRobloxRecent(true);
        } else {
          saveButton.textContent = 'Failed';
          saveButton.disabled = false;
        }
      } catch {
        saveButton.textContent = 'Failed';
        saveButton.disabled = false;
      }
    });
  }

  const recentList = $('rbRecent');
  if (recentList) {
    recentList.addEventListener('click', (event) => {
      const row = event.target.closest('.rb-recent-row');
      if (!row) return;
      playRobloxGame(row.dataset.placeId, row);
    });
  }
  $('rbKill').addEventListener('click', async () => {
    const button = $('rbKill');
    const label = $('rbKillLabel');
    if (button.disabled) return;
    button.disabled = true;
    setText('rbKillLabel', 'Closing…');
    try {
      const result = await api.robloxKill();
      if (result && result.ok) {
        robloxInfo = { ...(robloxInfo || {}), active: false, detected: false, current: null };
        renderRobloxInfo();
      } else {
        setText('rbCurrentDetail', result && result.reason === 'not-running' ? 'Roblox is not running' : 'Could not close Roblox');
      }
    } catch {
      setText('rbCurrentDetail', 'Could not close Roblox');
    } finally {
      button.disabled = false;
      label.textContent = 'Kill Roblox';
      if (state.page === 'roblox' && state.open) loadRobloxInfo(true);
    }
  });
  clearInterval(robloxInfoTimer);
  robloxInfoTimer = setInterval(() => {
    if (state.page === 'roblox' && state.open) loadRobloxInfo();
  }, 3000);
}

/* ------------------------------------------------------------ system extras */

const SYS_SAMPLES = 30;
const sysSeries = { cpu: [], ram: [] };

function pushSysSample(cpu, ram) {
  sysSeries.cpu.push(Math.max(0, Math.min(100, Number(cpu) || 0)));
  sysSeries.ram.push(Math.max(0, Math.min(100, Number(ram) || 0)));
  while (sysSeries.cpu.length > SYS_SAMPLES) sysSeries.cpu.shift();
  while (sysSeries.ram.length > SYS_SAMPLES) sysSeries.ram.shift();
}

function sparkPoints(values, height, span) {
  if (!values.length) return '0,' + height;
  const list = values.length === 1 ? [values[0], values[0]] : values;

  return list
    .map((value, index) => {
      const x = ((index / (list.length - 1)) * span).toFixed(2);
      const y = (height - (value / 100) * (height - 2) - 1).toFixed(2);
      return x + ',' + y;
    })
    .join(' ');
}

function renderSpark() {
  const cpuLine = $('sysCpuLine');
  const ramLine = $('sysRamLine');
  const cpuFill = $('sysCpuFill');
  if (!cpuLine || !ramLine) return;

  const cpu = sparkPoints(sysSeries.cpu, 32, 100);
  const ram = sparkPoints(sysSeries.ram, 32, 100);

  cpuLine.setAttribute('points', cpu);
  ramLine.setAttribute('points', ram);
  if (cpuFill) cpuFill.setAttribute('points', '0,32 ' + cpu + ' 100,32');
}

/* -------------------------------------------------------------------- lyrics */

const lyricState = { key: '', lines: [], index: -2, asking: false };
const lyricPage = () => document.querySelector('.page-media');

function lyricsOpen() {
  const page = lyricPage();
  return !!(page && page.classList.contains('lyr-open'));
}

function paintLyricsBadge() {
  if (!island.dataset.lyrics) island.dataset.lyrics = 'off';
}

function setLyricsMode(mode) {
  island.dataset.lyrics = mode;
}

async function loadLyrics(media) {
  if (!media || !media.title) return;

  const key = [media.title, media.artist || '', Math.round(media.duration || 0)].join('|');
  if (lyricState.key === key) return;

  lyricState.key = key;
  lyricState.lines = [];
  lyricState.index = -2;
  setLyricsMode('off');
  paintLyricLine(true);

  if (!api.lyrics) return;

  lyricState.asking = true;
  const data = await api.lyrics({
    title: media.title,
    artist: media.artist,
    album: media.album,
    duration: media.duration,
  });
  lyricState.asking = false;

  // The track can change while the request is in the air.
  if (lyricState.key !== key || !data || !Array.isArray(data.lines) || !data.lines.length) {
    fillLyricsList();
    return;
  }

  lyricState.lines = data.lines;
  lyricState.index = -2;
  setLyricsMode(lyricsOpen() ? 'full' : 'line');
  paintLyricLine(true);
  fillLyricsList();
}

function lyricIndexAt(position) {
  const lines = lyricState.lines;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i][0] <= position + 0.18) index = i;
    else break;
  }
  return index;
}

function paintLyricLine(force) {
  const el = $('mLyric');
  if (!el) return;

  if (!lyricState.lines.length) {
    if (lyricState.index !== -1 || force) {
      lyricState.index = -1;
      el.textContent = '';
      el.classList.remove('has');
    }
    return;
  }

  const { position } = mediaPosition();
  const index = lyricIndexAt(position);
  if (index === lyricState.index && !force) return;

  lyricState.index = index;
  el.classList.add('has');
  el.textContent = index >= 0 ? lyricState.lines[index][1] : '♪';

  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');

  highlightLyrics(false);
}

function fillLyricsList() {
  const body = $('lyrBody');
  if (!body) return;

  body.textContent = '';

  if (!lyricState.lines.length) {
    const empty = document.createElement('div');
    empty.className = 'lyr-empty';
    empty.textContent = lyricState.key ? 'No synced lyrics for this track' : 'Play something to see lyrics';
    body.appendChild(empty);
    return;
  }

  lyricState.lines.forEach((line, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lyr-row';
    row.dataset.index = String(index);
    row.textContent = line[1];
    row.addEventListener('click', () => api.mediaCommand('seek', Math.round(line[0] * 100) / 100));
    body.appendChild(row);
  });

  highlightLyrics(true);
}

function highlightLyrics(scroll) {
  const body = $('lyrBody');
  if (!body) return;

  const rows = body.querySelectorAll('.lyr-row');
  rows.forEach((row, index) => row.classList.toggle('now', index === lyricState.index));

  if (!scroll || lyricState.index < 0) return;
  const active = rows[lyricState.index];
  if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function toggleLyrics(open) {
  const page = lyricPage();
  if (!page) return;

  const next = typeof open === 'boolean' ? open : !page.classList.contains('lyr-open');
  page.classList.toggle('lyr-open', next);

  if (next) {
    fillLyricsList();
    setLyricsMode('full');
  } else {
    setLyricsMode(lyricState.lines.length ? 'line' : 'off');
  }
}

function wireLyrics() {
  const line = $('mLyric');
  if (line) {
    line.addEventListener('click', () => toggleLyrics());
    line.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleLyrics();
      }
    });
  }

  const close = $('lyrClose');
  if (close) close.addEventListener('click', () => toggleLyrics(false));
}

/* --------------------------------------------------------------- world clock */

const WORLD_ZONES = [
  { city: 'Tokyo', zone: 'Asia/Tokyo' },
  { city: 'London', zone: 'Europe/London' },
  { city: 'New York', zone: 'America/New_York' },
  { city: 'Los Angeles', zone: 'America/Los_Angeles' },
  { city: 'Berlin', zone: 'Europe/Berlin' },
  { city: 'Paris', zone: 'Europe/Paris' },
  { city: 'Dubai', zone: 'Asia/Dubai' },
  { city: 'Singapore', zone: 'Asia/Singapore' },
  { city: 'Seoul', zone: 'Asia/Seoul' },
  { city: 'China', zone: 'Asia/Shanghai' },
  { city: 'Sydney', zone: 'Australia/Sydney' },
  { city: 'Chicago', zone: 'America/Chicago' },
  { city: 'Sao Paulo', zone: 'America/Sao_Paulo' },
];

const WORLD_KEY = 'winisland.worldClock';
let worldSlots = [];

function cityFor(zone) {
  return WORLD_ZONES.find((entry) => entry.zone === zone) || WORLD_ZONES[1];
}

function loadWorld() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(WORLD_KEY) || 'null');
  } catch {
    saved = null;
  }

  const valid = Array.isArray(saved)
    ? saved.filter((zone) => typeof zone === 'string' && WORLD_ZONES.some((entry) => entry.zone === zone))
    : [];

  worldSlots = (valid.length ? valid : ['Europe/London', 'America/New_York']).slice(0, 3);
}

function saveWorld() {
  try {
    localStorage.setItem(WORLD_KEY, JSON.stringify(worldSlots));
  } catch {
    /* a clock that forgets is still a clock */
  }
}

const zoneFormats = new Map();
let worldMinute = -1;

function zoneTime(zone) {
  try {
    let format = zoneFormats.get(zone);

    if (!format) {
      format = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      zoneFormats.set(zone, format);
    }

    return format.format(new Date());
  } catch {
    return '--:--';
  }
}

function paintWorldTimes() {
  const minute = new Date().getMinutes();
  if (minute === worldMinute) return;
  worldMinute = minute;

  document.querySelectorAll('.clk-zone').forEach((chip) => {
    const digits = chip.querySelector('.clk-zone-time');
    if (digits) setText(digits.id, zoneTime(chip.dataset.zone));
  });
}

function renderWorld() {
  const box = $('clkWorld');
  if (!box) return;

  box.textContent = '';
  worldMinute = -1;

  // China is pinned to the main card: it is always the first chip, in red, and
  // stays put while the three editable city slots are cycled.
  const china = document.createElement('div');
  china.className = 'clk-zone china';
  china.dataset.zone = 'Asia/Shanghai';
  china.title = 'China Standard Time';

  const chinaName = document.createElement('span');
  chinaName.className = 'clk-zone-name';
  chinaName.textContent = 'China';

  const chinaTime = document.createElement('span');
  chinaTime.className = 'clk-zone-time';
  chinaTime.id = 'clkZoneChina';
  chinaTime.textContent = zoneTime('Asia/Shanghai');

  china.append(chinaName, chinaTime);
  box.appendChild(china);

  worldSlots.forEach((zone, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'clk-zone';
    chip.dataset.zone = zone;
    chip.title = 'Click to change the city';

    const name = document.createElement('span');
    name.className = 'clk-zone-name';
    name.textContent = cityFor(zone).city;

    const time = document.createElement('span');
    time.className = 'clk-zone-time';
    time.id = 'clkZoneTime' + index;
    time.textContent = zoneTime(zone);

    chip.append(name, time);
    chip.addEventListener('click', () => {
      const at = WORLD_ZONES.findIndex((entry) => entry.zone === zone);
      const next = at + 1;

      // Stepping past the last city drops the chip, which is how a slot is removed.
      if (next >= WORLD_ZONES.length) worldSlots.splice(index, 1);
      else worldSlots[index] = WORLD_ZONES[next].zone;

      saveWorld();
      renderWorld();
    });

    box.appendChild(chip);
  });

  if (worldSlots.length < 3) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'clk-zone add';
    add.textContent = '+';
    add.title = 'Add a city';
    add.addEventListener('click', () => {
      const free = WORLD_ZONES.find((entry) => !worldSlots.includes(entry.zone));
      if (!free) return;
      worldSlots.push(free.zone);
      saveWorld();
      renderWorld();
    });
    box.appendChild(add);
  }
}

/* -------------------------------------------------------------- interaction */

let pointerInside = false;
// The last cursor position main reported, so resize hit-tests can be redone
// without waiting for the pointer to move again.
let lastCursorPoint = null;
// Main starts with the window click-through, so the renderer mirrors the state
// it wants instead of firing the same message over and over.
let mouseOverOn = false;
let closeTimer = 0;
let dragStartX = null;
let dragStartY = null;
let suppressClickUntil = 0;

function pulseBlur(el) {
  if (!el) return;

  el.classList.remove('mblur');
  void el.offsetWidth;
  el.classList.add('mblur');

  clearTimeout(el.blurTimer);
  el.blurTimer = setTimeout(() => el.classList.remove('mblur'), 460);
}

function applyMouseOver(on) {
  if (on === mouseOverOn) return;
  mouseOverOn = on;
  api.setMouseOver(on);
}

function hideIsland() {
  state.hidden = true;
  island.dataset.hidden = 'true';
  closeIsland();
  pointerInside = false;
  applyMouseOver(false);
}

function showIsland() {
  state.hidden = false;
  syncSpectrum();
  island.dataset.hidden = 'false';
  pointerInside = false;
  applyMouseOver(true);
  renderPill();
  if (state.page === 'clock') renderClock();
  suppressClickUntil = Date.now() + 400;
}

function inRect(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function hitIsland(x, y) {
  if (state.hidden) {
    // Hiding slides the stage off-screen, but an alert card comes back into
    // view, so its buttons still have to be clickable.
    const alertCard = $('islandAlert');
    return Boolean(alertCard && !alertCard.hidden && inRect(alertCard.getBoundingClientRect(), x, y));
  }
  if (tabDrag) return true;
  // An alert shown under an open card lives outside the island box, so it has
  // to be part of the hit test or its buttons stay click-through.
  const alertCard = $('islandAlert');
  if (alertCard && !alertCard.hidden && inRect(alertCard.getBoundingClientRect(), x, y)) return true;
  if (inRect(island.getBoundingClientRect(), x, y)) return true;
  if (state.open) {
    return inRect($('underbar').getBoundingClientRect(), x, y) || inRect($('uTabs').getBoundingClientRect(), x, y);
  }
  if (island.dataset.tmode === 'bubble' && inRect($('tBubble').getBoundingClientRect(), x, y)) return true;
  return island.dataset.bubble === 'true' && inRect($('dlBubble').getBoundingClientRect(), x, y);
}

function scheduleClose() {
  clearTimeout(closeTimer);
  // The first-run guide holds the card open until it is finished or skipped.
  if (island.dataset.guide === 'true') return;
  closeTimer = setTimeout(() => {
    // Keep Discord's connection/setup panel available while the user switches
    // to Discord or the Developer Portal. Other tabs retain auto-dismiss.
    if (state.page === 'discord') return;
    // The identify tab stays put until the close button is used.
    if (state.page === 'identify') return;
    if (document.activeElement && document.activeElement.classList.contains('dc-input')) return;
    if (!pointerInside) closeIsland();
  }, 2000);
}

function handleCursor(x, y) {
  lastCursorPoint = { x, y };
  if (state.hidden) {
    // Hidden stays hidden: hovering does nothing. The peeking edge is still
    // clickable, so it only comes back when you actually click it.
    const alertCard = $('islandAlert');
    const over = inRect(island.getBoundingClientRect(), x, y)
      || Boolean(alertCard && !alertCard.hidden && inRect(alertCard.getBoundingClientRect(), x, y));
    if (over !== pointerInside) {
      pointerInside = over;
      applyMouseOver(over);
    }
    return;
  }

  const inside = hitIsland(x, y);
  // Only the card and the underbar take clicks; the transparent margin stays
  // click-through so the windows behind it keep working.
  applyMouseOver(inside);
  if (inside === pointerInside) {
    if (inside) clearTimeout(closeTimer);
    return;
  }
  pointerInside = inside;
  if (inside) clearTimeout(closeTimer);
  else scheduleClose();
}

api.onCursor(({ x, y }) => handleCursor(x, y));

// Main only reports cursor movement, so a card that grows under a still pointer
// (an alert appearing, or the island opening) would stay click-through until
// the mouse moved. Re-run the hit test whenever the island finishes resizing.
island.addEventListener('transitionend', (event) => {
  if (event.target !== island || !lastCursorPoint) return;
  handleCursor(lastCursorPoint.x, lastCursorPoint.y);
});

// Any click that lands outside the clickable island dismisses it, the way a
// popover behaves on the rest of the desktop.
function handleOutsideClick(x, y) {
  if (!state.open) return;
  if (island.dataset.guide === 'true') return;
  // Discord setup needs to stay open while copying credentials or approving in
  // Discord. The explicit close button still closes it.
  if (state.page === 'discord') return;
  // While the identifier is up, only its close button dismisses the island.
  if (state.page === 'identify') return;
  // Win+V opens the Windows clipboard flyout outside this window. Keep the
  // setup card open while either credential field is focused so it can be pasted.
  if (document.activeElement && document.activeElement.classList.contains('dc-input')) return;
  if (hitIsland(x, y)) return;
  closeIsland();
}

if (api.onOutsideClick) api.onOutsideClick(({ x, y }) => handleOutsideClick(x, y));

// Right-click and the arrow keys walk the tab strip, wrapping at both ends.
function cyclePage(direction) {
  if (!state.open) return;
  const pages = visiblePages();
  const index = pages.indexOf(state.page);
  if (index === -1) {
    setPage(pages[0] || 'clock');
    return;
  }
  setPage(pages[(index + direction + pages.length) % pages.length]);
}

island.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  cyclePage(1);
});

if (api.onCyclePage) api.onCyclePage((direction) => cyclePage(direction));

// The glass capsule tracks the selected tab. Hovering never switches views.
const viewTabs = $('uTabs');
const tabSelector = $('tabSelector');
let tabDrag = null;
let tabJustDragged = false;
let tabSelectorFrame = 0;

function tabButton(page = state.page) {
  return viewTabs.querySelector('button[data-tab="' + page + '"]');
}

function measureTabSelector(button) {
  if (!button || !tabSelector) return;
  const barRect = viewTabs.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const left = (buttonRect.left - barRect.left) / scale - viewTabs.clientLeft - (tabSelector.offsetWidth - buttonRect.width / scale) / 2;
  const top = (buttonRect.top - barRect.top) / scale - viewTabs.clientTop - (tabSelector.offsetHeight - buttonRect.height / scale) / 2;
  tabSelector.style.left = left + 'px';
  tabSelector.style.top = top + 'px';
  tabSelector.dataset.tab = button.dataset.tab;
}

function positionTabSelectorSoon(button = tabButton()) {
  if (tabSelectorFrame) cancelAnimationFrame(tabSelectorFrame);
  tabSelectorFrame = requestAnimationFrame(() => {
    tabSelectorFrame = 0;
    if (!tabDrag) measureTabSelector(button);
  });
}

viewTabs.addEventListener('pointermove', (event) => {
  if (tabDrag) return;
  const rect = viewTabs.getBoundingClientRect();
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const maxLeft = Math.max(0, viewTabs.clientWidth - tabSelector.offsetWidth);
  const maxTop = Math.max(0, viewTabs.clientHeight - tabSelector.offsetHeight);
  const left = (event.clientX - rect.left) / scale - viewTabs.clientLeft - tabSelector.offsetWidth / 2;
  tabSelector.style.left = Math.min(maxLeft, Math.max(0, left)) + 'px';
  tabSelector.style.top = Math.max(0, maxTop / 2) + 'px';
  const hovered = event.target.closest && event.target.closest('button[data-tab]');
  if (hovered) tabSelector.dataset.tab = hovered.dataset.tab;
  viewTabs.classList.add('is-pointer-following');
});

viewTabs.addEventListener('pointerleave', () => {
  if (tabDrag) return;
  viewTabs.classList.remove('is-pointer-following');
  positionTabSelectorSoon(tabButton());
});

window.addEventListener('resize', () => positionTabSelectorSoon());

function startTabDrag(event, button) {
  // Keep the transparent Electron overlay interactive through the whole drag;
  // the cursor may leave the visible toolbar before the next hit-test tick.
  applyMouseOver(true);
  tabDrag = {
    pointerId: event.pointerId,
    captureTarget: button,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: parseFloat(tabSelector.style.left) || 0,
    startTop: parseFloat(tabSelector.style.top) || 0,
    moved: false,
  };
  try { button.setPointerCapture(event.pointerId); } catch { /* Window tracking continues without capture. */ }
}

viewTabs.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const button = event.target.closest('[data-tab]');
  if (!button || button.dataset.tab !== state.page) return;
  event.stopPropagation();
  startTabDrag(event, button);
});

window.addEventListener('pointermove', (event) => {
  if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
  // Electron can lose the native pointer-up when the overlay is click-through.
  // Clear the drag as soon as a later move confirms the button is no longer held.
  if (!(event.buttons & 1)) {
    endTabDrag();
    return;
  }
  event.stopPropagation();
  const stageScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const dx = (event.clientX - tabDrag.startX) / stageScale;
  const dy = (event.clientY - tabDrag.startY) / stageScale;
  if (Math.hypot(dx, dy) > 4) {
    tabDrag.moved = true;
    viewTabs.classList.add('is-selector-dragging');
  }
  if (!tabDrag.moved) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const button = target && target.closest ? target.closest('#uTabs button[data-tab]') : null;
  if (button) {
    if (state.page !== button.dataset.tab) setPage(button.dataset.tab);
  }

  const barRect = viewTabs.getBoundingClientRect();
  const maxLeft = Math.max(0, viewTabs.clientWidth - tabSelector.offsetWidth);
  const maxTop = Math.max(0, viewTabs.clientHeight - tabSelector.offsetHeight);
  const pointerLeft = (event.clientX - barRect.left) / stageScale - viewTabs.clientLeft - tabSelector.offsetWidth / 2;
  const left = Math.min(maxLeft, Math.max(0, pointerLeft));
  tabSelector.style.left = left + 'px';
  tabSelector.style.top = Math.max(0, maxTop / 2) + 'px';
  tabSelector.dataset.tab = button ? button.dataset.tab : state.page;
  event.preventDefault();
});

function endTabDrag(event) {
  if (!tabDrag || (event && event.pointerId !== tabDrag.pointerId)) return;
  if (event) event.stopPropagation();
  if (tabDrag.moved) {
    tabJustDragged = true;
    viewTabs.classList.remove('is-selector-dragging');
    const pointerId = tabDrag.pointerId;
    const captureTarget = tabDrag.captureTarget;
    tabDrag = null;
    try {
      if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
    } catch { /* The browser may already have released it. */ }
    // Releasing the selector returns it to the currently selected view.
    positionTabSelectorSoon(tabButton());
    setTimeout(() => { tabJustDragged = false; }, 100);
    return;
  }
  viewTabs.classList.remove('is-selector-dragging');
  const pointerId = tabDrag.pointerId;
  const captureTarget = tabDrag.captureTarget;
  tabDrag = null;
  try {
    if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
  } catch { /* The browser may already have released it. */ }
  // A click without movement is committed by the button's click handler.
  positionTabSelectorSoon(tabButton());
}

window.addEventListener('pointerup', endTabDrag, true);
window.addEventListener('pointercancel', endTabDrag, true);


$('pill').addEventListener('click', () => {
  if (Date.now() < suppressClickUntil) return;
  if (state.hidden) {
    showIsland();
    return;
  }

  if (dlMini) {
    dlMini = false;
    $('dlFace').classList.remove('mini');
    syncDlFace();
    return;
  }

  openIsland(state.activity);
});
/* hold and swipe up, left or right to tuck the island away */
island.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  // Sliders own their own drag: arming the swipe here would tuck the island
  // away the moment the volume is slid sideways.
  if (event.target.closest && event.target.closest('.track')) {
    dragStartX = null;
    dragStartY = null;
    return;
  }

  dragStartX = event.clientX;
  dragStartY = event.clientY;
});

window.addEventListener('pointermove', (event) => {
  if (dragStartX === null || scrubbing) return;

  const across = Math.abs(event.clientX - dragStartX);
  const up = dragStartY - event.clientY;

  // There is barely any screen left above the island, so a short push up (or
  // hitting the top edge) is enough; sideways still needs a real drag.
  const pushedUp = up >= 12 || event.clientY <= 2;
  if (across < 45 && !pushedUp) return;

  dragStartX = null;
  dragStartY = null;
  suppressClickUntil = Date.now() + 400;
  hideIsland();
});

window.addEventListener('pointerup', () => {
  dragStartX = null;
  dragStartY = null;
});

api.onToggleHidden(() => (state.hidden ? showIsland() : hideIsland()));

document.querySelectorAll('#uTabs button').forEach((button) => {
  button.addEventListener('click', () => {
    if (tabJustDragged) {
      tabJustDragged = false;
      return;
    }
    setPage(button.dataset.tab);
  });
});

wireDiscord();
wireLyrics();
loadWorld();
renderWorld();

function applyIslandSettings() {
  island.dataset.theme = islandTheme;
  island.dataset.surface = islandSurface;
  const label = $('setState');
  if (label) label.textContent = islandTheme.toUpperCase() + ' · ' + islandSurface.toUpperCase();
  document.querySelectorAll('#setTheme .set-chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.theme === islandTheme));
  });
  document.querySelectorAll('#setSurface .set-chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.surface === islandSurface));
  });
  // Black owns the surfaces outright, so the colour picker steps aside.
  const colourLocked = islandTheme === 'black';
  const accentGroup = $('setAccent');
  if (accentGroup) accentGroup.classList.toggle('is-locked', colourLocked);
  document.querySelectorAll('#setAccent .set-chip').forEach((chip) => {
    chip.disabled = colourLocked;
    chip.setAttribute('aria-pressed', String(chip.dataset.accent === islandAccent));
  });
  island.style.setProperty('--accent', islandAccent);
  island.dataset.scene = islandScene;
  document.querySelectorAll('#setBackground .set-chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.background === islandScene));
  });
  updateScene();
}

function loadIslandSettings() {
  try {
    const theme = localStorage.getItem('wi.theme');
    const surface = localStorage.getItem('wi.surface');
    if (theme && SCENE_PALETTES[theme]) islandTheme = theme;
    // Older builds stored 'solid' and 'none'; map them onto the new pair.
    if (surface === 'solid') islandSurface = 'frosted';
    else if (surface === 'none') islandSurface = 'minimal';
    else if (surface && ISLAND_SURFACES.includes(surface)) islandSurface = surface;
    const accent = localStorage.getItem('wi.accent');
    if (accent && ISLAND_ACCENTS.includes(accent)) islandAccent = accent;
    const scene = localStorage.getItem('wi.scene');
    if (scene === 'off' || scene === 'on') islandScene = scene;
  } catch {
    /* defaults are fine */
  }
  applyIslandSettings();
}

function wireSettings() {
  document.querySelectorAll('#setTheme .set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      islandTheme = chip.dataset.theme === 'auto' ? 'auto' : chip.dataset.theme;
      try { localStorage.setItem('wi.theme', islandTheme); } catch { }
      applyIslandSettings();
    });
  });

  document.querySelectorAll('#setSurface .set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      islandSurface = chip.dataset.surface;
      try { localStorage.setItem('wi.surface', islandSurface); } catch { }
      applyIslandSettings();
    });
  });

  document.querySelectorAll('#setAccent .set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      islandAccent = chip.dataset.accent;
      try { localStorage.setItem('wi.accent', islandAccent); } catch { }
      applyIslandSettings();
    });
  });

  document.querySelectorAll('#setBackground .set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      islandScene = chip.dataset.background;
      try { localStorage.setItem('wi.scene', islandScene); } catch { }
      applyIslandSettings();
    });
  });
}


/* ------------------------------------------------------- tabs + first-run guide */

const SELECTABLE_TABS = [
  ['media', 'Music'],
  ['timer', 'Timer'],
  ['identify', 'Identify'],
  ['system', 'System'],
  ['clock', 'Clock'],
  ['clipboard', 'Clipboard'],
  ['notes', 'Notes'],
  ['tasks', 'Tasks'],
  ['discord', 'Discord'],
  ['roblox', 'Roblox'],
];

let enabledTabs = SELECTABLE_TABS.map((entry) => entry[0]);
let guideStep = 0;
const GUIDE_STEPS = 5;

function visiblePages() {
  return PAGES.filter((page) => page === 'settings' || enabledTabs.includes(page));
}

function saveEnabledTabs() {
  try { localStorage.setItem('wi.tabs', JSON.stringify(enabledTabs)); } catch { }
}

function syncTabsModeChips() {
  const all = SELECTABLE_TABS.every((entry) => enabledTabs.includes(entry[0]));
  document.querySelectorAll('#setTabsMode .set-chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.tabs === (all ? 'all' : 'custom')));
  });
  document.querySelectorAll('#setTabsList .set-chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(enabledTabs.includes(chip.dataset.tab)));
  });
}

function applyEnabledTabs() {
  document.querySelectorAll('#uTabs button[data-tab]').forEach((button) => {
    const page = button.dataset.tab;
    button.hidden = page === 'settings' ? false : !enabledTabs.includes(page);
  });

  if (state.page !== 'settings' && !enabledTabs.includes(state.page)) {
    const fallback = enabledTabs[0] || 'clock';
    if (state.open) setPage(fallback);
    else state.page = fallback;
  }

  positionTabSelectorSoon();
  syncTabsModeChips();
}

function toggleTab(id) {
  if (enabledTabs.includes(id)) {
    if (enabledTabs.length === 1) return;
    enabledTabs = enabledTabs.filter((tab) => tab !== id);
  } else {
    enabledTabs = SELECTABLE_TABS.map((entry) => entry[0]).filter((tab) => tab === id || enabledTabs.includes(tab));
  }
  applyEnabledTabs();
  saveEnabledTabs();
}

function buildTabToggles(container) {
  if (!container) return;
  container.textContent = '';
  SELECTABLE_TABS.forEach(([id, label]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'set-chip';
    chip.dataset.tab = id;
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(enabledTabs.includes(id)));
    chip.addEventListener('click', () => {
      toggleTab(id);
      chip.setAttribute('aria-pressed', String(enabledTabs.includes(id)));
    });
    container.appendChild(chip);
  });
}

function loadEnabledTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem('wi.tabs') || 'null');
    if (Array.isArray(raw) && raw.length) {
      const known = raw.filter((id) => SELECTABLE_TABS.some((entry) => entry[0] === id));
      if (known.length) enabledTabs = known;
    }
  } catch {
    /* all tabs stay on */
  }
  applyEnabledTabs();
}

function guideChipRow(items, isActive, onPick) {
  const row = document.createElement('div');
  row.className = 'set-chips';
  items.forEach(([value, label]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'set-chip';
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(isActive() === value));
    const locked = islandTheme === 'black' && items.some(([value]) => value.charAt(0) === '#');
    chip.disabled = locked;
    if (locked) row.classList.add('is-locked');
    chip.addEventListener('click', () => {
      if (locked) return;
      onPick(value);
      renderGuide();
    });
    row.appendChild(chip);
  });
  return row;
}

function renderGuide() {
  const body = $('guideBody');
  if (!body) return;
  body.textContent = '';
  setText('guideStep', (guideStep + 1) + ' / ' + GUIDE_STEPS);

  const title = (text) => {
    const el = document.createElement('div');
    el.className = 'guide-title';
    el.textContent = text;
    body.appendChild(el);
  };
  const copy = (text) => {
    const el = document.createElement('div');
    el.className = 'guide-copy';
    el.textContent = text;
    body.appendChild(el);
  };

  if (guideStep === 0) {
    setText('guideKicker', 'ISLAND THEME');
    title('Pick a look');
    copy('Auto follows your real clock through the day. Black keeps the island dark around the clock.');
    body.appendChild(guideChipRow(
      [['auto', 'Auto'], ['night', 'Night'], ['dawn', 'Dawn'], ['day', 'Day'], ['dusk', 'Dusk'], ['black', 'Black']],
      () => islandTheme,
      (value) => {
        islandTheme = value;
        try { localStorage.setItem('wi.theme', islandTheme); } catch { }
        applyIslandSettings();
      },
    ));
  } else if (guideStep === 1) {
    setText('guideKicker', 'ISLAND COLOR');
    title('Choose the colour');
    if (islandTheme === 'black') {
      copy('The Black theme keeps the island fully black, so there is no colour to pick. Go back if you want a tinted island.');
    } else {
      copy('This paints the open island and the collapsed pill.');
    }
    body.appendChild(guideChipRow(
      ISLAND_ACCENTS.map((hex) => [hex, hex === '#7aa2f7' ? 'Sky' : hex === '#a78bfa' ? 'Violet' : hex === '#2dd4bf' ? 'Teal' : hex === '#4ade80' ? 'Green' : hex === '#fbbf24' ? 'Amber' : hex === '#fb7185' ? 'Rose' : hex === '#e2e8f0' ? 'Ice' : 'Graphite']),
      () => islandAccent,
      (value) => {
        if (islandTheme === 'black') return;
        islandAccent = value;
        try { localStorage.setItem('wi.accent', islandAccent); } catch { }
        applyIslandSettings();
      },
    ));
  } else if (guideStep === 2) {
    setText('guideKicker', 'NOTIFICATIONS');
    title('Bring your notifications here');
    copy('WinIsland shows its own card instead of the Windows toast. Allow access once and every app is covered.');
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.className = 'set-chip';
    enable.textContent = 'Enable notifications';
    enable.addEventListener('click', async () => {
      enable.textContent = 'Asking…';
      await api.enableNotifications().catch(() => false);
      renderGuide();
    });
    body.appendChild(enable);
    const note = document.createElement('div');
    note.className = 'guide-note';
    note.textContent = 'Checking access…';
    body.appendChild(note);
    api.notificationsState().then((status) => {
      const state = String((status && status.state) || '');
      note.textContent = state === 'connected'
        ? 'Notifications are connected.'
        : state === 'denied'
          ? 'Access was denied — you can allow it later in Windows settings.'
          : 'You can also do this later from the gear tab.';
    }).catch(() => {
      note.textContent = 'You can also do this later from the gear tab.';
    });
  } else if (guideStep === 3) {
    setText('guideKicker', 'TABS');
    title('Choose your tabs');
    copy('Everything is on by default. Custom lets you hide the tabs you never open.');
    const all = SELECTABLE_TABS.every((entry) => enabledTabs.includes(entry[0]));
    body.appendChild(guideChipRow(
      [['all', 'All tabs'], ['custom', 'Custom']],
      () => (all ? 'all' : 'custom'),
      (value) => {
        if (value === 'all') {
          enabledTabs = SELECTABLE_TABS.map((entry) => entry[0]);
          applyEnabledTabs();
          saveEnabledTabs();
        }
      },
    ));
    const list = document.createElement('div');
    list.className = 'set-chips set-tabs-list';
    body.appendChild(list);
    buildTabToggles(list);
  } else {
    setText('guideKicker', 'READY');
    title('You are set');
    copy('Open the island any time — the gear tab has the theme, colour, tabs and this guide again.');
  }

  const next = $('guideNext');
  const skip = $('guideSkip');
  if (next) next.textContent = guideStep === GUIDE_STEPS - 1 ? 'Start' : 'Continue';
  if (skip) skip.hidden = guideStep === GUIDE_STEPS - 1;
}

function startGuide() {
  guideStep = 0;
  island.dataset.guide = 'true';
  const guide = $('guide');
  if (guide) guide.hidden = false;
  if (state.hidden) showIsland();
  openIsland('clock');
  renderGuide();
}

function finishGuide() {
  island.dataset.guide = 'false';
  const guide = $('guide');
  if (guide) guide.hidden = true;
  try { localStorage.setItem('wi.onboarded', '1'); } catch { }
  closeIsland();
}

function wireGuide() {
  const next = $('guideNext');
  const skip = $('guideSkip');
  if (next) {
    next.addEventListener('click', () => {
      if (guideStep >= GUIDE_STEPS - 1) {
        finishGuide();
        return;
      }
      guideStep += 1;
      renderGuide();
    });
  }
  if (skip) skip.addEventListener('click', finishGuide);

  const replay = $('setReplay');
  if (replay) replay.addEventListener('click', startGuide);

  const mode = $('setTabsMode');
  if (mode) {
    mode.addEventListener('click', (event) => {
      const chip = event.target.closest('.set-chip');
      if (!chip) return;
      if (chip.dataset.tabs === 'all') {
        enabledTabs = SELECTABLE_TABS.map((entry) => entry[0]);
        applyEnabledTabs();
        saveEnabledTabs();
      }
      syncTabsModeChips();
    });
  }

  buildTabToggles($('setTabsList'));

  let onboarded = false;
  try { onboarded = Boolean(localStorage.getItem('wi.onboarded')); } catch { }
  if (!onboarded) setTimeout(startGuide, 1200);
}

wireRobloxInfo();
loadIslandSettings();
wireSettings();
loadEnabledTabs();
wireGuide();
wireScene();
$('uClose').addEventListener('click', () => closeIsland());

let updateState = { state: 'idle' };
let updateNoticeTimer = 0;

function renderUpdateStatus(status) {
  updateState = status || { state: 'idle' };
  const button = $('uUpdate');
  const notice = $('updateNotice');
  if (!button || !notice) return;

  const labels = {
    checking: 'Checking for updates…',
    current: `Up to date · v${updateState.version || 'current'}`,
    available: `Update available · v${updateState.version}`,
    downloading: `Downloading update · ${updateState.percent || 0}%`,
    ready: `Update ready · v${updateState.version}`,
    error: 'Could not check for updates',
  };
  const stateName = updateState.state || 'idle';
  const label = labels[stateName];

  button.dataset.checking = String(stateName === 'checking' || stateName === 'downloading');
  button.title = stateName === 'ready' ? 'Restart to install update' : 'Check for updates';
  button.setAttribute('aria-label', button.title);

  if (!label) {
    clearTimeout(updateNoticeTimer);
    notice.hidden = true;
    return;
  }

  notice.textContent = label;
  notice.title = updateState.message || (stateName === 'available' ? 'Click to view the release' : label);
  notice.dataset.state = stateName;
  notice.dataset.action = stateName === 'available' ? 'release' : stateName === 'ready' ? 'install' : '';
  notice.hidden = false;
  clearTimeout(updateNoticeTimer);
  if (stateName === 'current') {
    updateNoticeTimer = setTimeout(() => { notice.hidden = true; }, 3000);
  } else if (stateName === 'available') {
    showIslandAlert({ kind: 'update', source: 'WinIsland', title: 'Update available', body: `Version ${updateState.version} is ready to install`, persistent: true, replace: true, action: 'View update', actionHandler: () => api.openUpdateRelease(updateState.url) });
  } else if (stateName === 'downloading') {
    showIslandAlert({ kind: 'update', source: 'WinIsland', title: 'Update available', body: `Downloading version ${updateState.version || ''} · ${updateState.percent || 0}%`, persistent: true, replace: true });
  } else if (stateName === 'ready') {
    showIslandAlert({ kind: 'update', source: 'WinIsland', title: 'Update ready', body: `Version ${updateState.version} will install when you restart`, persistent: true, replace: true, action: 'Restart to update', actionHandler: () => api.installUpdate() });
  }
}

$('uUpdate').addEventListener('click', async () => {
  if (updateState.state === 'ready') {
    await api.installUpdate();
    return;
  }
  renderUpdateStatus({ state: 'checking' });
  await api.checkUpdates();
});

$('updateNotice').addEventListener('click', async () => {
  if (updateState.state === 'ready') {
    await api.installUpdate();
  } else if (updateState.state === 'available' && updateState.url) {
    await api.openUpdateRelease(updateState.url);
  }
});

api.onUpdate((status) => renderUpdateStatus(status));

document.querySelectorAll('[data-cmd]').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.cmd;

    // Show the new state right away; the media bridge confirms it shortly after.
    if (command === 'playpause' && state.media) {
      state.media.playing = !state.media.playing;
      state.media.receivedAt = Date.now();
      apply();
      renderPill();
      renderMedia();
    }

    if (command === 'shuffle' && state.media) {
      state.media.shuffle = !state.media.shuffle;
      renderMedia();
    }

    if (command === 'repeat' && state.media) {
      const order = ['None', 'List', 'Track'];
      const next = (order.indexOf(String(state.media.repeat || 'None')) + 1) % order.length;
      state.media.repeat = order[next];
      renderMedia();
    }

    api.mediaCommand(command);
  });
});

let pipHintTimer = 0;

// Give a short hint when the browser can't expose its native PiP menu.
function showPipHint(result) {
  if (result && result.ok) return;

  const artist = $('mArtist');
  if (!artist || !state.media) return;

  const normal = state.media.artist || appName(state.media.app);
  clearTimeout(pipHintTimer);
  artist.textContent = 'Open a YouTube video in your browser to use PiP';
  pipHintTimer = setTimeout(() => {
    $('mArtist').textContent = normal;
  }, 5200);
}

api.onPipState((result) => showPipHint(result));

// The volume button swaps the progress bar for a system volume slider.
let volOpen = false;
let volDragging = false;
let volValue = 1;
let volRect = null;
let volTarget = null;
let volFrame = 0;

function paintVol(level) {
  volValue = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));
  $('vFill').style.width = `${volValue * 100}%`;
  $('vKnob').style.left = `${volValue * 100}%`;
  $('vPct').textContent = `${Math.round(volValue * 100)}%`;
}

function volFromEvent(event) {
  const rect = volRect || $('vTrack').getBoundingClientRect();
  if (!rect.width) return volValue;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

// Moves arrive far faster than the endpoint can take them; the thumb follows
// the pointer straight away and the system only ever hears the newest value of
// the frame, so the volume keeps up instead of trailing behind the drag.
function queueVol(level) {
  volTarget = level;
  if (volFrame) return;

  volFrame = requestAnimationFrame(() => {
    volFrame = 0;
    if (volTarget === null) return;
    api.setVolume(volTarget);
  });
}

function flushVol() {
  if (volFrame) {
    cancelAnimationFrame(volFrame);
    volFrame = 0;
  }
  if (volTarget === null) return;
  api.setVolume(volTarget);
  volTarget = null;
}

function setVolOpen(open) {
  volOpen = open;
  document.querySelector('.page-media').classList.toggle('vol-open', open);
}

async function toggleVol() {
  setVolOpen(!volOpen);
  if (!volOpen) return;

  const level = await api.getVolume();
  if (volOpen && !volDragging) paintVol(level);
}

$('mVolume').addEventListener('click', toggleVol);

$('dlBubble').addEventListener('click', (event) => {
  event.stopPropagation();
  if (!state.open) openIsland();
});

let dlItems = [];
let dlWasActive = false;
let dlMini = false;
let dlMiniTimer = 0;
let dlDoneTimer = 0;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(value / 1024)) + ' KB';
}

function formatSpeed(bytesPerSecond) {
  const value = Number(bytesPerSecond) || 0;
  if (value <= 0) return '';
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB/s';
  return Math.max(1, Math.round(value / 1024)) + ' KB/s';
}

function downloadMeta(item) {
  if (!item) return '';

  const total = item.total ? ' / ' + formatBytes(item.total) : '';
  const speed = formatSpeed(item.speed);
  return `${formatBytes(item.bytes)}${total}${speed ? ' · ' + speed : ''}`;
}

function downloadPercent(item) {
  if (!item || !item.total) return 0;
  return Math.max(0, Math.min(100, (item.bytes / item.total) * 100));
}

function paintDlBar(id, item) {
  const bar = $(id);
  if (!bar) return;

  const percent = downloadPercent(item);
  bar.style.width = percent ? percent.toFixed(1) + '%' : '0%';
}

function renderClockDownload() {
  const block = $('clkDl');
  if (!block) return;

  const active = dlItems.length > 0;
  block.hidden = !active;
  if (!active) return;

  const extra = dlItems.length > 1 ? ` · +${dlItems.length - 1}` : '';
  setText('clkDlMeta', downloadMeta(dlItems[0]) + extra);
  paintDlBar('clkDlBar', dlItems[0]);
}

function downloadName(name) {
  const suffixes = ['.crdownload', '.opdownload', '.download', '.partial', '.part'];
  const lower = name.toLowerCase();

  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) return name.slice(0, -suffix.length);
  }

  return name;
}

// Something else worth showing in the pill (music, a running timer)?
function otherActivity() {
  const playing = state.media && state.media.playing;
  const timing = state.timer && state.timer.running;
  return Boolean(playing || timing);
}

function syncDlFace() {
  const face = $('dlFace');
  const done = face && face.classList.contains('done');
  const active = dlItems.length > 0;
  // The main island always keeps its own face (music, timer, clock); a
  // download only ever rides beside it as a bubble.
  const bubble = active || Boolean(done);

  island.dataset.bubble = bubble ? 'true' : 'false';
  island.dataset.dl = 'false';
  island.classList.toggle('dl-mini', false);
}

const RING_LENGTH = 119.4;

function paintDlRing(item) {
  const ring = $('dlRing');
  if (!ring) return;

  const percent = downloadPercent(item) / 100;
  ring.style.strokeDashoffset = String(RING_LENGTH * (1 - percent));
}

// A download shows up in the closed island as a small live chip, then folds
// down to just the arrow and a count so it stays out of the way.
function applyDownloads(items) {
  const list = Array.isArray(items) ? items.filter((item) => item && item.name) : [];
  const active = list.length > 0;
  const started = active && dlItems.length === 0;

  dlItems = list;

  if (active) {
    clearTimeout(dlDoneTimer);

    $('dlName').textContent = downloadMeta(list[0]) || 'Downloading';
    $('dlCount').textContent = String(list.length);
    paintDlBar('dlBar', list[0]);
    paintDlRing(list[0]);
    setText('dlBubbleCount', String(list.length));

    if (started) {
      const face = $('dlFace');
      dlMini = false;
      face.classList.remove('mini', 'done', 'fresh');
      void face.offsetWidth;
      face.classList.add('fresh');

      clearTimeout(dlMiniTimer);
      dlMiniTimer = setTimeout(() => {
        if (dlItems.length === 0) return;
        dlMini = true;
        face.classList.add('mini');
        syncDlFace();
        pulseBlur($('pill'));
      }, 4200);
    }
  } else {
    clearTimeout(dlMiniTimer);

    if (dlWasActive) {
      const face = $('dlFace');
      dlMini = false;
      face.classList.remove('fresh', 'mini');
      face.classList.add('done');
      $('dlName').textContent = 'Saved';
      $('dlBar').style.width = '100%';
      $('dlRing').style.strokeDashoffset = '0';
      $('dlBubble').classList.add('done');

      pulseBlur(face);

      dlDoneTimer = setTimeout(() => {
        face.classList.remove('done');
        $('dlBubble').classList.remove('done');
        syncDlFace();
      }, 2600);
    }
  }

  dlWasActive = active;
  syncDlFace();
  renderClockDownload();
}

api.onDownloads((items) => applyDownloads(items));

const volTrack = $('vTrack');

volTrack.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  volDragging = true;
  // Read the track once: measuring it on every move makes the drag stutter.
  volRect = $('vTrack').getBoundingClientRect();
  try {
    volTrack.setPointerCapture(event.pointerId);
  } catch {
    /* the pointer may already be gone */
  }

  paintVol(volFromEvent(event));
  queueVol(volValue);
});

volTrack.addEventListener('pointermove', (event) => {
  if (!volDragging) return;

  // A release that happened somewhere else must not leave the slider glued to
  // the cursor.
  if (event.buttons === 0) {
    volDragging = false;
    return;
  }

  paintVol(volFromEvent(event));
  queueVol(volValue);
});

function endVolDrag(event) {
  if (!volDragging) return;
  volDragging = false;
  volRect = null;
  flushVol();
  if (volTrack.releasePointerCapture && event.pointerId !== undefined) {
    try {
      volTrack.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }
}

volTrack.addEventListener('pointerup', endVolDrag);
volTrack.addEventListener('pointercancel', endVolDrag);

// Belt and braces: any release, anywhere, ends the drag.
window.addEventListener('pointerup', () => {
  volDragging = false;
  volRect = null;
  flushVol();
});
window.addEventListener('pointercancel', () => (volDragging = false));
window.addEventListener('blur', () => (volDragging = false));

$('mShare').addEventListener('click', async () => {
  const media = state.media;
  const button = $('mShare');
  if (button.classList.contains('working')) return;

  button.classList.add('working');

  const link = await api.copyLink({
    title: media ? media.title : '',
    artist: media ? media.artist : '',
  });

  button.classList.remove('working');

  if (!link) return;
  button.classList.add('copied');
  setTimeout(() => button.classList.remove('copied'), 1100);
});

$('mTrack').addEventListener('pointerdown', (event) => {
  const ratio = seekRatio(event);
  if (ratio === null) return;
  scrubbing = true;
  previewSeek(ratio);
});

window.addEventListener('pointermove', (event) => {
  if (!scrubbing) return;
  const ratio = seekRatio(event);
  if (ratio !== null) previewSeek(ratio);
});

window.addEventListener('pointerup', (event) => {
  if (!scrubbing) return;
  scrubbing = false;
  const ratio = seekRatio(event);
  if (ratio === null) return;
  const duration = state.media.duration;
  const target = ratio * duration;
  previewSeek(ratio);
  state.media.position = target;
  state.media.receivedAt = Date.now();
  api.mediaCommand('seek', Math.round(target * 100) / 100);
});

$('tToggle').addEventListener('click', toggleTimer);
$('tUnit').addEventListener('click', () => {
  cycleUnit();
  renderTimer();
});

// Wheel over the timer card steps the time by the selected unit.
// Scrolling speeds up: the first notches move one unit, then two, four and
// eight as the wheel keeps spinning. A short pause drops back to one.
let wheelAt = 0;
let wheelBurst = 0;
document.querySelector('.page-timer').addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const now = Date.now();
    if (now - wheelAt > 240) wheelBurst = 0;
    if (now - wheelAt < 45) return;
    wheelAt = now;
    wheelBurst += 1;

    const times = wheelBurst <= 2 ? 1 : wheelBurst <= 5 ? 2 : wheelBurst <= 9 ? 4 : 8;
    stepTimer(event.deltaY < 0 ? 1 : -1, times);
  },
  { passive: false }
);
$('tCancel').addEventListener('click', resetTimer);
document.querySelectorAll('#tPresets button').forEach((button) => {
  button.addEventListener('click', () => selectPreset(Number(button.dataset.min)));
});

$('tPomodoro').addEventListener('click', () => togglePomodoro());

$('clkTimer').addEventListener('click', () => setPage('timer'));
// Song identification lives on its own tab: it records the system output, so it
// works whether or not a media session is reporting anything.
let identifying = false;
let lastMatch = null;

// Main tells us which half of the job is running, so the card never looks stuck.
if (api.onIdentifyPhase) {
  api.onIdentifyPhase((phase) => {
    if (!identifying) return;
    setText('idSub', phase === 'shazam' ? 'Asking Shazam…' : 'Capturing system audio');
  });
}

function showMatchActions(on) {
  $('idCopy').hidden = !on;
  $('idYt').hidden = !on;
}

function setIdleFace(title, sub) {
  setText('idTitle', title);
  setText('idSub', sub);
}

async function identifySong() {
  if (identifying) return;

  identifying = true;
  const button = $('idBtn');
  button.classList.add('listening');
  button.classList.remove('matched');
  button.disabled = true;
  setText('idBtnText', 'Listening…');
  setText('idSub', 'Capturing system audio');
  setText('idTitle', 'Listening…');

  let result = null;
  try {
    result = await api.identifySong();
  } catch {
    result = null;
  }

  button.classList.remove('listening');
  button.disabled = false;

  if (result && result.matched) {
    lastMatch = { title: result.title || '', artist: result.artist || '', url: result.url || '' };
    setText('idTitle', result.title || 'Unknown');
    setText('idSub', result.artist || 'Shazam match');
    setText('idBtnText', 'Listen again');
    button.classList.add('matched');
    showMatchActions(true);

    if (result.artwork) {
      const art = $('idArt');
      art.textContent = '';
      const image = new Image();
      image.src = result.artwork;
      image.alt = result.title || '';
      art.appendChild(image);
    }
  } else if (result && result.error === 'no audio') {
    setIdleFace('Nothing playing', 'Play something first');
    setText('idBtnText', 'Try again');
    button.classList.remove('matched');
  } else if (result && result.error) {
    setIdleFace('Shazam did not answer', result.error);
    setText('idBtnText', 'Try again');
    button.classList.remove('matched');
  } else {
    setIdleFace('No match', 'Play something and try again');
    setText('idBtnText', 'Try again');
    button.classList.remove('matched');
  }

  if (!(result && result.matched)) {
    lastMatch = null;
    showMatchActions(false);
  }

  identifying = false;
}

$('idBtn').addEventListener('click', identifySong);

$('tBubble').addEventListener('click', () => openIsland('timer'));

$('idCopy').addEventListener('click', async () => {
  if (!lastMatch) return;

  const label = lastMatch.artist ? `${lastMatch.title} — ${lastMatch.artist}` : lastMatch.title;
  await api.copyText(label);

  const button = $('idCopy');
  button.classList.add('copied');
  setText('idCopy', 'Copied');
  clearTimeout(button.copiedTimer);
  button.copiedTimer = setTimeout(() => {
    button.classList.remove('copied');
    setText('idCopy', 'Copy');
  }, 1200);
});

$('idYt').addEventListener('click', (event) => {
  if (!lastMatch) return;

  const query = encodeURIComponent(`${lastMatch.title} ${lastMatch.artist}`.trim());
  api.openExternal(`https://www.youtube.com/results?search_query=${query}`, event.isTrusted);
});

$('tkRun').addEventListener('click', async () => {
  const result = await api.runTask();
  if (result && result.ok) setTimeout(renderTasks, 900);
});
$('clkDate').addEventListener('click', () => setPage('tasks'));


let mediaGoneTimer = 0;

function clearMedia() {
  mediaGoneTimer = 0;
  state.media = null;
  state.art = null;
  syncActivity();
  apply();
  renderPill();
  if (state.page === 'media') renderMedia();
}

api.onMedia((media) => {
  if (!media.active) {
    // Sessions drop out for a beat between tracks; wait before hiding the card.
    if (!mediaGoneTimer) mediaGoneTimer = setTimeout(clearMedia, 1800);
    return;
  }
  clearTimeout(mediaGoneTimer);
  mediaGoneTimer = 0;

  const wasPlaying = Boolean(state.media && state.media.playing);
  state.media = media;
  if (!wasPlaying && media.playing) state.activity = 'media';
  syncActivity();
  apply();
  renderPill();
  if (state.page === 'media') renderMedia();
});

api.onMediaArt((dataUrl) => {
  if ((dataUrl || '') === state.art) return;
  state.art = dataUrl || '';
  if (state.art) applyArtColors(state.art);
  else clearArtColors();
  renderPill();
  if (state.page === 'media') renderMedia();
});

api.onStats((stats) => {
  state.stats = stats;
  if (typeof stats.gpu === 'number') state.gpu = stats.gpu;
  pushSysSample(stats.cpu, stats.mem);
  if (state.page === 'system') renderSystem();
  if (state.page === 'clock') renderClock();
  else setText('clkStats', `CPU ${stats.cpu}% · RAM ${stats.mem}%`);
});

/* ------------------------------------------------------------------- boot */

let lastClockSecond = -1;

function boot() {
  syncActivity();
  // The pill is on screen from the start, so it has to be clickable from the
  // start too.
  applyMouseOver(!state.hidden);
  apply();
  renderPill();
  renderTimer();
  renderClock();
  renderPage();
  watchBattery();

  // Every face reads the same wall clock, so one slow tick keeps the pill, the
  // clock card and the weather in step; the timer ring wants a finer one.
  // One loop drives the timer, the lyrics line, progress and the clock. It runs
  // at 4 Hz only while something is moving; a resting island ticks once a second.
  const tickLoop = () => {
    tickTimer();

    if (state.media && state.open) {
      updateProgress();
      paintLyricLine(false);
    }

    if (state.open && state.page === 'discord' && Date.now() - discordAsked > 6000) loadDiscord();

    const second = new Date().getSeconds();
    if (!state.hidden && second !== lastClockSecond) {
      lastClockSecond = second;
      renderClock();
      if (island.dataset.lyrics !== 'full') paintLyricLine(false);
    }

    const needsSmoothTicks = state.timer.running || Boolean(state.media && state.open);
    setTimeout(tickLoop, state.hidden ? 5000 : needsSmoothTicks ? (lowEndDevice ? 500 : 250) : 1000);
  };

  tickLoop();
}

boot();


