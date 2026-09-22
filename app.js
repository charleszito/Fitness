import { runFirstRunImportIfNeeded } from './import.js';
import { metaGet, metaSet } from './db.js';
import { todayStr, sessionForDate } from './program.js';
import { mountToday } from './today.js';
import { mountWorkout } from './workout.js';
import { mountCheckin } from './checkin.js';
import { mountDashboard } from './dashboard.js';
import { mountPlan } from './plan.js';
import { initTimerUI, setTimerCollapsedForTab } from './timer-ui.js';
import { setWakeLockEnabled } from './timer.js';
import { loadBlocksIntoCache } from './blocks-data.js';
import { applyTheme } from './theme.js';

const TABS = ['today', 'workout', 'checkin', 'dashboard', 'plan'];
let currentTab = 'today';

async function boot() {
  await runFirstRunImportIfNeeded();
  await loadBlocksIntoCache();
  const wakeLockEnabled = await metaGet('wakeLockEnabled', true);
  setWakeLockEnabled(wakeLockEnabled);
  await applyTheme();

  initTimerUI();
  applyIpadLayout();
  window.addEventListener('resize', applyIpadLayout);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.tab));
  });

  window.addEventListener('nav', (e) => navigate(e.detail.tab, e.detail));

  await navigate('today');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

async function navigate(tab, opts = {}) {
  currentTab = tab;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  const tabbar = document.getElementById('tabbar');
  const showTabbar = tab !== 'workout';
  tabbar.classList.toggle('hidden', !showTabbar);
  document.body.classList.toggle('tabbar-visible', showTabbar);
  document.body.classList.toggle('workout-mode', tab === 'workout');
  setTimerCollapsedForTab(tab === 'workout');

  const date = opts.date || todayStr();

  if (tab === 'today') {
    await mountToday(date);
    document.getElementById('screen-today').classList.add('active');
  } else if (tab === 'workout') {
    const session = opts.session || sessionForDate(date);
    await mountWorkout(date, session);
    document.getElementById('screen-workout').classList.add('active');
  } else if (tab === 'checkin') {
    await mountCheckin(date);
    document.getElementById('screen-checkin').classList.add('active');
  } else if (tab === 'dashboard') {
    await mountDashboard(date);
    document.getElementById('screen-dashboard').classList.add('active');
  } else if (tab === 'plan') {
    await mountPlan();
    document.getElementById('screen-plan').classList.add('active');
  }
}

function applyIpadLayout() {
  const isWide = window.innerWidth >= 768;
  document.getElementById('tabbar').classList.toggle('ipad-side', isWide);
  document.body.classList.toggle('has-ipad-side', isWide);
}

boot();
