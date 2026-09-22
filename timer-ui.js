import { onTimerTick, getTimerState, adjustTimer, pauseTimer, resumeTimer, skipTimer, primeAudio } from './timer.js';
import { fmtTime } from './ui.js';

const RING_CIRC = 2 * Math.PI * 52;
let collapsed = false;
let lastZeroFlash = false;

export function initTimerUI() {
  const overlay = document.getElementById('timer-overlay');
  const pill = document.getElementById('timer-pill');
  const collapseBtn = document.getElementById('timer-collapse-btn');
  const minus = document.getElementById('timer-minus15');
  const plus = document.getElementById('timer-plus15');
  const pauseBtn = document.getElementById('timer-pause');
  const skipBtn = document.getElementById('timer-skip');

  collapseBtn.addEventListener('click', () => { collapsed = true; updateVisibility(null); });
  pill.addEventListener('click', () => { collapsed = false; updateVisibility(null); });
  minus.addEventListener('click', () => { primeAudio(); adjustTimer(-15); });
  plus.addEventListener('click', () => { primeAudio(); adjustTimer(15); });
  skipBtn.addEventListener('click', () => skipTimer());
  pauseBtn.addEventListener('click', async () => {
    const state = await getTimerState();
    if (state?.paused) { resumeTimer(); } else { pauseTimer(); }
  });

  // Collapsed state is owned by app.js (setTimerCollapsedForTab), based on
  // which tab is active — not decided here, to avoid racing with it on boot.
  onTimerTick((state) => renderState(state));
  getTimerState().then((s) => renderState(s));
  setInterval(async () => renderState(await getTimerState()), 1000);
}

function renderState(state) {
  const overlay = document.getElementById('timer-overlay');
  const pill = document.getElementById('timer-pill');
  const pauseBtn = document.getElementById('timer-pause');

  if (!state) {
    overlay.classList.add('hidden');
    pill.classList.add('hidden');
    document.body.classList.remove('timer-pill-visible');
    lastZeroFlash = false;
    return;
  }

  updateVisibility(state);

  const remainingSec = state.remainingMs / 1000;
  const label = document.getElementById('timer-exercise-label');
  const nextLabel = document.getElementById('timer-next-label');
  if (label) label.textContent = state.paused ? 'Rest (paused)' : 'Rest';
  if (nextLabel) nextLabel.textContent = state.exerciseName ? `Next: ${state.exerciseName}` : '';

  const digits = document.getElementById('timer-digits');
  const ring = document.getElementById('timer-ring-fg');
  const pillTime = document.getElementById('timer-pill-time');
  const pillLabel = document.getElementById('timer-pill-label');

  const timeStr = fmtTime(remainingSec);
  if (digits) digits.textContent = timeStr;
  if (pillTime) pillTime.textContent = timeStr;
  if (pillLabel) pillLabel.textContent = state.exerciseName ? `· ${state.exerciseName}` : '';

  if (ring) {
    const frac = state.totalSec > 0 ? Math.max(0, remainingSec / state.totalSec) : 0;
    ring.setAttribute('stroke-dashoffset', String(RING_CIRC * (1 - frac)));
    ring.classList.toggle('pulse', remainingSec <= 10 && remainingSec > 0);
  }
  if (pauseBtn) pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';

  if (remainingSec <= 0 && !lastZeroFlash) {
    lastZeroFlash = true;
    flashScreen();
  }
  if (remainingSec > 0) lastZeroFlash = false;
}

function updateVisibility(state) {
  const overlay = document.getElementById('timer-overlay');
  const pill = document.getElementById('timer-pill');
  if (!state) {
    getTimerState().then((s) => updateVisibility(s));
    return;
  }
  if (collapsed) {
    overlay.classList.add('hidden');
    pill.classList.remove('hidden');
    document.body.classList.add('timer-pill-visible');
  } else {
    overlay.classList.remove('hidden');
    pill.classList.add('hidden');
    document.body.classList.remove('timer-pill-visible');
  }
}

function flashScreen() {
  const overlay = document.getElementById('timer-overlay');
  if (overlay.classList.contains('hidden')) {
    document.body.style.transition = 'background 0.15s ease';
    const original = document.body.style.background;
    document.body.style.background = 'var(--accent)';
    setTimeout(() => { document.body.style.background = original; }, 350);
  } else {
    overlay.classList.remove('flash');
    void overlay.offsetWidth;
    overlay.classList.add('flash');
  }
}

export function resetCollapse() {
  collapsed = false;
}

// Called on every tab navigation: keep the rest timer as a full overlay only
// while the workout screen itself is active, so it never traps the user on
// another tab (e.g. right after reopening the app).
export function setTimerCollapsedForTab(isWorkoutTab) {
  collapsed = !isWorkoutTab;
  updateVisibility(null);
}
