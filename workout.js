import { el, fmtTime, showToast, openSheet, closeSheet, haptic } from '../ui.js';
import { metaGet, metaSet } from '../db.js';
import {
  getExercisesForSession, getExerciseRecord, getLastPerformance, logSet, removeSet,
  addExtraSet, setRpe, setPain, undoLastSet, getExerciseNote, setExerciseNote,
  getExerciseSettings, setExerciseSettings,
} from '../workout-data.js';
import { startTimer, primeAudio } from '../timer.js';
import { rpeGuidance, dateToWeek } from '../data/program.js';

let ctx = null; // { date, session, week, exercises, order, currentIndex, startedAt, viewMode }
let durationInterval = null;
let touchStartX = null;

export async function mountWorkout(date, session) {
  const week = dateToWeek(date);
  const exercises = await getExercisesForSession(session, week);
  const saved = await metaGet('activeWorkout', null);
  let order = exercises.map((e) => e.id);
  let currentIndex = 0;
  let startedAt = Date.now();
  if (saved && saved.date === date && saved.session === session) {
    order = saved.order && saved.order.length === order.length ? saved.order : order;
    currentIndex = saved.currentIndex ?? 0;
    startedAt = saved.startedAt ?? startedAt;
  } else {
    await metaSet('activeWorkout', { date, session, week, order, currentIndex, startedAt });
  }
  ctx = { date, session, week, exercises, order, currentIndex, startedAt, viewMode: 'single' };
  render();
  startDurationTicker();
}

function orderedExercises() {
  const byId = Object.fromEntries(ctx.exercises.map((e) => [e.id, e]));
  return ctx.order.map((id) => byId[id]).filter(Boolean);
}

async function persistCtx() {
  await metaSet('activeWorkout', {
    date: ctx.date, session: ctx.session, week: ctx.week,
    order: ctx.order, currentIndex: ctx.currentIndex, startedAt: ctx.startedAt,
  });
}

function startDurationTicker() {
  clearInterval(durationInterval);
  durationInterval = setInterval(() => {
    const dEl = document.getElementById('session-duration');
    if (!dEl || !ctx) return clearInterval(durationInterval);
    dEl.textContent = fmtTime((Date.now() - ctx.startedAt) / 1000);
  }, 1000);
}

function isWide() {
  return window.matchMedia('(min-width: 768px)').matches;
}

function render() {
  const root = document.getElementById('screen-workout');
  root.innerHTML = '';
  root.appendChild(el(`
    <div class="workout-shell">
      <div class="workout-topbar">
        <button class="icon-btn" id="wk-list-toggle" aria-label="Exercise list">☰</button>
        <div style="text-align:center;">
          <div style="font-weight:800;">${ctx.session}</div>
          <div class="session-duration" id="session-duration">0:00</div>
        </div>
        <button class="icon-btn" id="wk-close" aria-label="Close">✕</button>
      </div>
      <div class="exercise-progress-dots" id="wk-dots"></div>
      <div class="workout-main" style="flex:1;min-height:0;display:flex;">
        <div class="pane-list" id="wk-sidebar"></div>
        <div id="wk-body" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
      </div>
    </div>
  `));
  document.getElementById('wk-list-toggle').addEventListener('click', () => {
    ctx.viewMode = ctx.viewMode === 'single' ? 'list' : 'single';
    render();
  });
  document.getElementById('wk-close').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('nav', { detail: { tab: 'today' } }));
  });
  renderDots();
  renderSidebarList();
  if (!isWide() && ctx.viewMode === 'list') {
    renderListView();
  } else {
    renderSingleView();
  }
}

function renderSidebarList() {
  const wrap = document.getElementById('wk-sidebar');
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = orderedExercises();
  list.forEach((exr, i) => {
    const item = el(`
      <div class="ex-list-item ${i === ctx.currentIndex ? 'current' : ''}">
        <span class="status-dot" data-dot></span>
        <div style="flex:1;min-width:0;">
          <div class="ex-list-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${exr.name}</div>
          <div class="ex-list-meta">${exr.target}</div>
        </div>
      </div>
    `);
    item.addEventListener('click', () => {
      ctx.currentIndex = i;
      persistCtx();
      render();
    });
    wrap.appendChild(item);
    getExerciseRecord(ctx.date, exr.id).then((rec) => {
      const doneCount = rec ? rec.sets.filter(Boolean).length : 0;
      if (doneCount >= exr.prescribedSets) item.querySelector('[data-dot]').classList.add('done');
    });
  });
}

function renderDots() {
  const wrap = document.getElementById('wk-dots');
  wrap.innerHTML = '';
  const list = orderedExercises();
  list.forEach((exr, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === ctx.currentIndex ? ' current' : '');
    wrap.appendChild(d);
  });
  markDoneDots();
}

async function markDoneDots() {
  const list = orderedExercises();
  const dots = document.querySelectorAll('#wk-dots .dot');
  for (let i = 0; i < list.length; i++) {
    const rec = await getExerciseRecord(ctx.date, list[i].id);
    const loggedCount = rec ? rec.sets.filter(Boolean).length : 0;
    if (loggedCount >= list[i].prescribedSets && dots[i] && i !== ctx.currentIndex) {
      dots[i].classList.add('done');
    }
  }
}

function renderListView() {
  const body = document.getElementById('wk-body');
  body.innerHTML = '';
  const wrap = el(`<div class="exercise-pane exercise-list-view"></div>`);
  const list = orderedExercises();
  list.forEach((exr, i) => {
    const item = el(`
      <div class="ex-list-item ${i === ctx.currentIndex ? 'current' : ''}">
        <span class="status-dot" data-dot></span>
        <div style="flex:1;">
          <div class="ex-list-name">${exr.name}</div>
          <div class="ex-list-meta">${exr.target} · ${exr.prescribedSets} sets prescribed</div>
        </div>
        <button class="icon-btn" data-up style="width:40px;height:40px;font-size:16px;">↑</button>
        <button class="icon-btn" data-down style="width:40px;height:40px;font-size:16px;">↓</button>
      </div>
    `);
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-up]') || e.target.closest('[data-down]')) return;
      ctx.currentIndex = i;
      ctx.viewMode = 'single';
      persistCtx();
      render();
    });
    item.querySelector('[data-up]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (i === 0) return;
      [ctx.order[i - 1], ctx.order[i]] = [ctx.order[i], ctx.order[i - 1]];
      persistCtx();
      render();
    });
    item.querySelector('[data-down]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (i === list.length - 1) return;
      [ctx.order[i + 1], ctx.order[i]] = [ctx.order[i], ctx.order[i + 1]];
      persistCtx();
      render();
    });
    wrap.appendChild(item);
    getExerciseRecord(ctx.date, exr.id).then((rec) => {
      const doneCount = rec ? rec.sets.filter(Boolean).length : 0;
      if (doneCount >= exr.prescribedSets) item.querySelector('[data-dot]').classList.add('done');
    });
  });
  body.appendChild(wrap);
}

async function renderSingleView() {
  const body = document.getElementById('wk-body');
  body.innerHTML = '';
  const list = orderedExercises();
  const exr = list[ctx.currentIndex];
  if (!exr) return;

  const record = (await getExerciseRecord(ctx.date, exr.id)) || { sets: [], rpe: null, painFlag: null, painNote: null };
  const last = await getLastPerformance(exr.id, ctx.date);
  const note = await getExerciseNote(exr.id);
  const settings = await getExerciseSettings(exr.id, exr.unit, exr.increment, exr.restSec);

  const lastLine = last ? last.sets.filter(Boolean).map((s) => formatSetShort(exr, s)).join(', ') : 'No previous data yet';

  const pane = el(`<div class="exercise-pane"></div>`);
  pane.appendChild(el(`
    <div>
      <div class="exercise-name">${exr.name}${exr._replacedFrom ? `<div style="font-size:12px;color:var(--text-faint);font-weight:600;">swapped from ${exr._replacedFrom}</div>` : ''}</div>
      <div class="exercise-target-row">
        <span class="target-chip">${exr.target}</span>
        <span class="target-chip ${exr.prescribedSets !== exr.sets ? 'sets-changed' : ''}">${exr.prescribedSets} sets this week</span>
        <span class="target-chip">${rpeGuidance(ctx.week)}</span>
      </div>
      <div class="last-time-line">Last time: ${lastLine}</div>
      <div class="top-range-hint" id="top-range-hint">Hit the top of your range on every set — add weight next time.</div>
      ${note ? `<div class="exercise-carry-note">📝 ${escapeHtml(note)}</div>` : ''}
    </div>
  `));

  const setsList = el(`<div class="sets-list" id="sets-list"></div>`);
  pane.appendChild(setsList);

  for (let i = 0; i < exr.prescribedSets; i++) {
    const loggedSet = record.sets[i] || null;
    const prefillSource = (last && last.sets[i]) || (last && last.sets[last.sets.length - 1]) || null;
    const row = buildSetRow(exr, i, loggedSet, prefillSource, settings);
    setsList.appendChild(row);
  }

  // extra-set add button
  const addSetBtn = el(`<button class="btn btn-ghost" id="add-set-btn" style="margin-top:8px;">+ Add set</button>`);
  addSetBtn.addEventListener('click', async () => {
    await addExtraSet(ctx.date, ctx.session, ctx.week, exr);
    renderSingleView();
  });
  pane.appendChild(addSetBtn);

  // RPE
  pane.appendChild(buildRpeRow(exr, record));
  // Pain
  pane.appendChild(buildPainRow(exr, record));
  // notes
  const notesBtn = el(`<button class="notes-btn" id="notes-btn">${note ? 'Edit note (carries to next session)' : '+ Add note (carries to next session)'}</button>`);
  notesBtn.addEventListener('click', () => openNoteSheet(exr, note));
  pane.appendChild(notesBtn);

  const actionsRow = el(`<div class="exercise-actions-row"></div>`);
  const settingsBtn = el(`<button class="btn" id="ex-settings-btn">⚙ Unit &amp; rest</button>`);
  settingsBtn.addEventListener('click', () => openExerciseSettingsSheet(exr, settings));
  actionsRow.appendChild(settingsBtn);
  pane.appendChild(actionsRow);

  body.appendChild(pane);
  body.appendChild(buildBottomBar(exr, record));

  checkTopRangeHint(exr, record);
  attachSwipe(pane);
}

function formatSetShort(exr, s) {
  if (s == null) return '—';
  if (exr.timed) return `${s.reps}s`;
  if (!exr.hasWeight) return `${s.reps}${exr.perSide ? '/side' : ''}`;
  const wLabel = exr.isAssisted && s.w < 0 ? `assist ${Math.abs(s.w)}` : s.w;
  return `${wLabel} × ${s.reps}`;
}

function buildSetRow(exr, index, loggedSet, prefillSource, settings) {
  const isLogged = !!loggedSet;
  const wVal = loggedSet ? loggedSet.w : (prefillSource ? prefillSource.w : (exr.hasWeight ? 0 : null));
  const repsVal = loggedSet ? loggedSet.reps : (prefillSource ? prefillSource.reps : (exr.timed ? exr.repsMax : exr.repsMax));

  const row = el(`<div class="set-row ${isLogged ? 'logged' : ''}" data-set-index="${index}"></div>`);
  const head = el(`<div class="set-row-head"><span class="set-index">Set ${index + 1}</span></div>`);
  row.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'set-fields-grid' + (exr.hasWeight ? '' : ' single');

  let weightInput = null;
  let repsInput = null;

  if (exr.hasWeight) {
    weightInput = buildStepper(wVal ?? 0, settings.increment, exr.isAssisted ? 'assist' : settings.unit, exr.isAssisted);
    grid.appendChild(weightInput.wrap);
  }

  if (exr.timed) {
    repsInput = buildHoldTimer(exr.repsMax, repsVal ?? exr.repsMax);
  } else {
    repsInput = buildStepper(repsVal ?? exr.repsMax, 1, exr.perSide ? 'reps/side' : 'reps', false);
  }
  grid.appendChild(repsInput.wrap);

  row.appendChild(grid);

  const logBtn = el(`<button class="set-log-btn ${isLogged ? 'done' : ''}" aria-label="Log set ${index + 1}">${isLogged ? '✓' : '○'}</button>`);
  head.appendChild(logBtn);
  logBtn.addEventListener('click', async () => {
    haptic();
    const w = exr.hasWeight ? weightInput.getValue() : null;
    const reps = repsInput.getValue();
    const exList = orderedExercises();
    const exr2 = exList[ctx.currentIndex];
    const updated = await logSet(ctx.date, ctx.session, ctx.week, exr2, index, { w, reps });
    primeAudio();
    await startTimer(exr2.restSec, exr2.name);
    showToast(`Set ${index + 1} logged`, async () => {
      await undoLastSet();
      renderSingleView();
    });
    renderSingleView();
  });
  return row;
}

function buildStepper(value, step, unitLabel, isAssisted) {
  const wrap = document.createElement('div');
  wrap.className = 'field-col';
  const stepperEl = document.createElement('div');
  stepperEl.className = 'stepper';
  const minus = el(`<button type="button" aria-label="decrease">−</button>`);
  const input = el(`<input type="text" inputmode="decimal" value="${formatVal(value)}" />`);
  const plus = el(`<button type="button" aria-label="increase">+</button>`);
  stepperEl.appendChild(minus);
  stepperEl.appendChild(input);
  stepperEl.appendChild(plus);
  wrap.appendChild(stepperEl);
  wrap.appendChild(el(`<div class="field-unit">${isAssisted ? 'assist' : unitLabel}</div>`));

  function formatVal(v) {
    if (v == null) return '0';
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  }
  function getValue() {
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : 0;
  }
  minus.addEventListener('click', () => {
    input.value = formatVal(getValue() - step);
  });
  plus.addEventListener('click', () => {
    input.value = formatVal(getValue() + step);
  });
  return { wrap, getValue, input };
}

function buildHoldTimer(targetSeconds, achievedSeconds) {
  const wrap = document.createElement('div');
  wrap.className = 'field-col';
  let value = achievedSeconds ?? targetSeconds;
  let running = false;
  let rafHandle = null;
  let endAt = null;

  const row = el(`<div class="hold-timer-row"></div>`);
  const digits = el(`<div class="hold-timer-digits">${fmtHold(value)}</div>`);
  const btn = el(`<button type="button" class="hold-start-btn">Start ${targetSeconds}s hold</button>`);
  row.appendChild(digits);
  row.appendChild(btn);
  wrap.appendChild(row);
  wrap.appendChild(el(`<div class="field-unit">seconds held</div>`));

  function fmtHold(s) {
    return `${Math.max(0, Math.round(s))}s`;
  }

  function tick() {
    const remaining = Math.max(0, (endAt - Date.now()) / 1000);
    digits.textContent = fmtHold(remaining);
    if (remaining <= 0) {
      finish(targetSeconds);
      return;
    }
    rafHandle = requestAnimationFrame(tick);
  }

  function finish(achieved) {
    running = false;
    if (rafHandle) cancelAnimationFrame(rafHandle);
    value = Math.round(achieved);
    digits.textContent = fmtHold(value);
    btn.textContent = `Start ${targetSeconds}s hold`;
    btn.classList.remove('hold-stop-btn');
    btn.classList.add('hold-start-btn');
  }

  btn.addEventListener('click', () => {
    if (!running) {
      running = true;
      endAt = Date.now() + targetSeconds * 1000;
      btn.textContent = 'Stop';
      btn.classList.remove('hold-start-btn');
      btn.classList.add('hold-stop-btn');
      tick();
    } else {
      const achieved = targetSeconds - Math.max(0, (endAt - Date.now()) / 1000);
      finish(achieved);
    }
  });

  return { wrap, getValue: () => value };
}

function buildRpeRow(exr, record) {
  const wrap = el(`<div class="rpe-row"><div class="row-label">RPE</div><div class="rpe-chips" id="rpe-chips"></div></div>`);
  const chipsWrap = wrap.querySelector('#rpe-chips');
  for (let v = 6; v <= 10; v += 0.5) {
    const chip = el(`<button type="button" class="chip ${record.rpe === v ? 'selected' : ''}">${v}</button>`);
    chip.addEventListener('click', async () => {
      const list = orderedExercises();
      const exr2 = list[ctx.currentIndex];
      const newVal = record.rpe === v ? null : v;
      await setRpe(ctx.date, ctx.session, ctx.week, exr2, newVal);
      renderSingleView();
    });
    chipsWrap.appendChild(chip);
  }
  return wrap;
}

function buildPainRow(exr, record) {
  const wrap = el(`<div class="pain-row"></div>`);
  const btn = el(`<button type="button" class="pain-toggle-btn ${record.painFlag === 'Y' ? 'active' : ''}">${record.painFlag === 'Y' ? '⚠ Pain flagged' : '⚑ Flag pain'}</button>`);
  btn.addEventListener('click', () => openPainSheet(exr, record));
  wrap.appendChild(btn);
  return wrap;
}

function openPainSheet(exr, record) {
  const content = openSheet(`
    <h3 style="margin-bottom:12px;">Pain — ${exr.name}</h3>
    <div class="rpe-chips" id="pain-side-chips" style="margin-bottom:14px;">
      <button type="button" class="chip" data-side="Left">Left</button>
      <button type="button" class="chip" data-side="Right">Right</button>
      <button type="button" class="chip" data-side="Joint">Which joint?</button>
    </div>
    <div class="field"><textarea id="pain-note-input" placeholder="Note (optional)">${record.painNote || ''}</textarea></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-danger btn-block" id="pain-save-btn">Flag pain</button>
      ${record.painFlag ? '<button class="btn" id="pain-clear-btn">Clear</button>' : ''}
    </div>
  `);
  const noteInput = content.querySelector('#pain-note-input');
  content.querySelectorAll('[data-side]').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const tag = chip.dataset.side;
      if (chip.classList.contains('selected')) {
        noteInput.value = (noteInput.value ? noteInput.value + ' ' : '') + `[${tag}]`;
      }
    });
  });
  content.querySelector('#pain-save-btn').addEventListener('click', async () => {
    const list = orderedExercises();
    const exr2 = list[ctx.currentIndex];
    await setPain(ctx.date, ctx.session, ctx.week, exr2, 'Y', noteInput.value.trim());
    closeSheet();
    renderSingleView();
  });
  const clearBtn = content.querySelector('#pain-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const list = orderedExercises();
      const exr2 = list[ctx.currentIndex];
      await setPain(ctx.date, ctx.session, ctx.week, exr2, null, null);
      closeSheet();
      renderSingleView();
    });
  }
}

function openNoteSheet(exr, currentNote) {
  const content = openSheet(`
    <h3 style="margin-bottom:12px;">Note — ${exr.name}</h3>
    <div class="page-sub">Carries forward and shows up next time you do this exercise.</div>
    <div class="field"><textarea id="ex-note-input" placeholder="e.g. sit tail tucked, core engaged">${currentNote || ''}</textarea></div>
    <button class="btn btn-primary btn-block" id="ex-note-save">Save note</button>
  `);
  content.querySelector('#ex-note-save').addEventListener('click', async () => {
    await setExerciseNote(exr.id, content.querySelector('#ex-note-input').value.trim());
    closeSheet();
    renderSingleView();
  });
}

function openExerciseSettingsSheet(exr, settings) {
  const content = openSheet(`
    <h3 style="margin-bottom:12px;">${exr.name} settings</h3>
    <div class="field">
      <label>Weight unit</label>
      <select id="unit-select">
        <option value="kg" ${settings.unit === 'kg' ? 'selected' : ''}>kg</option>
        <option value="lb" ${settings.unit === 'lb' ? 'selected' : ''}>lb</option>
        <option value="stack" ${settings.unit === 'stack' ? 'selected' : ''}>Stack / plate number</option>
      </select>
    </div>
    <div class="field">
      <label>Increment step</label>
      <input type="number" step="0.5" id="increment-input" value="${settings.increment}" />
    </div>
    <div class="field">
      <label>Rest after a set (seconds)</label>
      <input type="number" step="5" id="rest-input" value="${settings.restSec}" />
    </div>
    <button class="btn btn-primary btn-block" id="ex-settings-save">Save</button>
  `);
  content.querySelector('#ex-settings-save').addEventListener('click', async () => {
    const unit = content.querySelector('#unit-select').value;
    const increment = parseFloat(content.querySelector('#increment-input').value) || settings.increment;
    const restSec = parseInt(content.querySelector('#rest-input').value, 10) || settings.restSec;
    await setExerciseSettings(exr.id, { unit, increment, restSec });
    closeSheet();
    renderSingleView();
  });
}

function buildBottomBar(exr, record) {
  const bar = el(`<div class="workout-bottombar"></div>`);
  const list = orderedExercises();
  const prevBtn = el(`<button class="nav-btn" id="wk-prev" ${ctx.currentIndex === 0 ? 'disabled' : ''}>‹</button>`);
  const nextBtn = el(`<button class="nav-btn" id="wk-next" ${ctx.currentIndex === list.length - 1 ? 'disabled' : ''}>›</button>`);
  const loggedCount = record.sets.filter(Boolean).length;
  const allDone = loggedCount >= exr.prescribedSets;
  const logBtn = el(`<button class="log-set-btn ${allDone ? 'all-done' : ''}" id="wk-log-primary">${allDone ? 'All sets logged ✓' : `Log set ${loggedCount + 1}`}</button>`);

  prevBtn.addEventListener('click', () => { ctx.currentIndex = Math.max(0, ctx.currentIndex - 1); persistCtx(); render(); });
  nextBtn.addEventListener('click', () => { ctx.currentIndex = Math.min(list.length - 1, ctx.currentIndex + 1); persistCtx(); render(); });
  logBtn.addEventListener('click', () => {
    if (allDone) {
      if (ctx.currentIndex < list.length - 1) { ctx.currentIndex++; persistCtx(); render(); }
      return;
    }
    const rows = document.querySelectorAll('#sets-list .set-row');
    const targetRow = rows[loggedCount];
    if (targetRow) targetRow.querySelector('.set-log-btn').click();
  });

  bar.appendChild(prevBtn);
  bar.appendChild(logBtn);
  bar.appendChild(nextBtn);
  return bar;
}

async function checkTopRangeHint(exr, record) {
  if (exr.timed || !exr.repsMax) return;
  const hint = document.getElementById('top-range-hint');
  if (!hint) return;
  const sets = record.sets.filter(Boolean);
  if (sets.length >= exr.prescribedSets && sets.every((s) => s.reps >= exr.repsMax)) {
    hint.classList.add('show');
  }
}

function attachSwipe(paneEl) {
  paneEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  paneEl.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 60) return;
    const list = orderedExercises();
    if (dx < 0 && ctx.currentIndex < list.length - 1) { ctx.currentIndex++; persistCtx(); render(); }
    if (dx > 0 && ctx.currentIndex > 0) { ctx.currentIndex--; persistCtx(); render(); }
  }, { passive: true });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function isWorkoutActive() {
  return !!ctx;
}
