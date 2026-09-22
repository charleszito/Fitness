// Timestamp-based rest timer. Survives phone lock / app switch / tab sleep
// because it stores an end timestamp (via metaSet) rather than ticking a counter.
import { metaGet, metaSet } from './db.js';

const META_KEY = 'activeTimer';

let tickHandle = null;
let listeners = new Set();
let audioCtx = null;
let wakeLock = null;
let wakeLockEnabled = true;

export function onTimerTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(state) {
  listeners.forEach((fn) => fn(state));
}

export async function getTimerState() {
  const saved = await metaGet(META_KEY, null);
  if (!saved) return null;
  const remainingMs = saved.endAt - Date.now();
  if (remainingMs <= -60000) {
    // stale (over a minute past zero and never cleared) — drop it
    return null;
  }
  return { ...saved, remainingMs: Math.max(0, remainingMs) };
}

export async function startTimer(seconds, exerciseName) {
  const endAt = Date.now() + seconds * 1000;
  const state = { endAt, totalSec: seconds, exerciseName, paused: false, pausedRemainingMs: null };
  await metaSet(META_KEY, state);
  playedZeroAlert = false;
  requestWakeLock();
  ensureTicking();
  notify(await getTimerState());
  return state;
}

export async function adjustTimer(deltaSeconds) {
  const state = await metaGet(META_KEY, null);
  if (!state) return null;
  if (state.paused) {
    state.pausedRemainingMs = Math.max(0, state.pausedRemainingMs + deltaSeconds * 1000);
  } else {
    state.endAt += deltaSeconds * 1000;
  }
  await metaSet(META_KEY, state);
  notify(await getTimerState());
  return state;
}

export async function pauseTimer() {
  const state = await metaGet(META_KEY, null);
  if (!state || state.paused) return;
  state.paused = true;
  state.pausedRemainingMs = Math.max(0, state.endAt - Date.now());
  await metaSet(META_KEY, state);
  notify(await getTimerState());
}

export async function resumeTimer() {
  const state = await metaGet(META_KEY, null);
  if (!state || !state.paused) return;
  state.endAt = Date.now() + (state.pausedRemainingMs ?? 0);
  state.paused = false;
  await metaSet(META_KEY, state);
  ensureTicking();
  notify(await getTimerState());
}

export async function skipTimer() {
  await metaSet(META_KEY, null);
  stopTicking();
  releaseWakeLock();
  notify(null);
}

let playedZeroAlert = false;

function ensureTicking() {
  if (tickHandle) return;
  tickHandle = setInterval(async () => {
    const state = await getTimerState();
    notify(state);
    if (state && !state.paused && state.remainingMs <= 10000 && state.remainingMs > 0) {
      // pulse handled by UI via remainingMs <= 10000
    }
    if (state && !state.paused && state.remainingMs <= 0 && !playedZeroAlert) {
      playedZeroAlert = true;
      playAlertSound();
    }
    if (!state) {
      stopTicking();
      releaseWakeLock();
    }
  }, 250);
}

function stopTicking() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

// Recompute on visibility change (covers phone-lock / app-switch resume)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    const state = await getTimerState();
    notify(state);
    if (state && !state.paused) ensureTicking();
  }
});

// ---- sound ----
function playAlertSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1046.5 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  } catch (e) {
    // ignore — audio not available (e.g. no user gesture yet)
  }
}

export function primeAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* ignore */ }
}

// ---- wake lock ----
export function setWakeLockEnabled(enabled) {
  wakeLockEnabled = enabled;
  if (!enabled) releaseWakeLock();
}

async function requestWakeLock() {
  if (!wakeLockEnabled) return;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* ignore */ }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wakeLockEnabled) {
    const state = await getTimerState();
    if (state && !state.paused) requestWakeLock();
  }
});

// kick off ticking on load if a timer is already active (e.g. app reopened)
(async () => {
  const state = await getTimerState();
  if (state && !state.paused) {
    ensureTicking();
  }
})();
