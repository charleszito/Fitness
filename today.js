import { el, openSheet, closeSheet } from './ui.js';
import {
  sessionForDate, dateToWeek, warmupListFor, stretchListFor, MILESTONES, STEPS_TARGETS, LIFTING_SESSIONS,
} from './program.js';
import { getExercisesForSession, getExerciseRecord } from './workout-data.js';
import { getWarmupStatus, setWarmupItem, getStretchStatusForSession, setStretchItem } from './daily-data.js';

export async function mountToday(date) {
  const root = document.getElementById('screen-today');
  root.innerHTML = '';
  const week = dateToWeek(date);
  const session = sessionForDate(date);
  const milestone = MILESTONES[Math.min(week, 8) - 1] || MILESTONES[0];
  const isLifting = LIFTING_SESSIONS.includes(session);
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  root.appendChild(el(`
    <div class="today-header">
      <div>
        <div class="page-title">${dateLabel}</div>
        <div class="page-sub">${session}</div>
      </div>
      <span class="week-pill">Week ${week} of 8</span>
    </div>
  `));

  root.appendChild(el(`
    <div class="card">
      <div class="row-label">This week's focus</div>
      <div style="font-size:15px;font-weight:600;">${milestone.focus}</div>
      <div style="color:var(--text-dim);font-size:13px;margin-top:4px;">Target weight ${milestone.targetWeightKg} kg · Steps ${STEPS_TARGETS[week - 1].toLocaleString()}</div>
    </div>
  `));

  if (isLifting) {
    await renderLiftingDay(root, date, session, week);
  } else {
    await renderNonLiftingDay(root, date, session, week);
  }
}

async function renderLiftingDay(root, date, session, week) {
  const warmup = warmupListFor(session);
  const exercises = await getExercisesForSession(session, week);
  const stretch = stretchListFor(session);

  let loggedCount = 0;
  for (const exr of exercises) {
    const rec = await getExerciseRecord(date, exr.id);
    if (rec && rec.sets.filter(Boolean).length >= exr.prescribedSets) loggedCount++;
  }

  const warmupDone = await getWarmupStatus(date, session);
  const warmupDoneCount = warmupDone.filter((w) => w.done === true).length;
  const stretchDone = await getStretchStatusForSession(date, session, week);
  const stretchDoneCount = stretchDone.filter((s) => s.held === true).length;

  const card = el(`<div class="card" id="today-blocks"></div>`);
  const warmRow = blockRow('Warm-up', `${warmupDoneCount}/${warmup.length} done`, '🔥', warmupDoneCount === warmup.length);
  warmRow.addEventListener('click', () => openWarmupSheet(date, session, week));
  card.appendChild(warmRow);

  const workoutRow = blockRow('Workout', `${exercises.length} exercises · ${loggedCount}/${exercises.length} done`, '🏋️', loggedCount === exercises.length);
  workoutRow.addEventListener('click', () => window.dispatchEvent(new CustomEvent('nav', { detail: { tab: 'workout', date, session } })));
  card.appendChild(workoutRow);

  const stretchRow = blockRow('Cooldown / Stretch', `${stretchDoneCount}/${stretch.length} done`, '🧘', stretchDoneCount === stretch.length);
  stretchRow.addEventListener('click', () => openStretchSheet(date, session, week));
  card.appendChild(stretchRow);
  root.appendChild(card);

  const startBtn = el(`<button class="btn btn-primary btn-block btn-lg" id="start-workout-btn" style="margin-top:8px;">${loggedCount > 0 ? 'Resume workout' : 'Start workout'}</button>`);
  startBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('nav', { detail: { tab: 'workout', date, session } }));
  });
  root.appendChild(startBtn);
}

async function renderNonLiftingDay(root, date, session, week) {
  const card = el(`<div class="card"></div>`);
  if (session === 'Zone-2 Cardio' || session === 'Cardio Intervals') {
    card.appendChild(el(`<div class="row-label">Cardio</div><div style="font-weight:700;">${session}</div><div class="page-sub" style="margin-top:4px;">Log it from Check-in when done.</div>`));
  } else {
    card.appendChild(el(`<div class="row-label">Rest day</div><div style="font-weight:700;">Light mobility only</div>`));
  }
  root.appendChild(card);

  const stretchStatus = await getStretchStatusForSession(date, session, week);
  const mobCard = el(`<div class="card" id="mob-card"></div>`);
  const doneCount = stretchStatus.filter((s) => s.held === true).length;
  mobCard.appendChild(el(`<div class="row-label">Mobility · ${doneCount}/${stretchStatus.length} done</div>`));
  stretchStatus.forEach((s) => {
    const row = el(`
      <div class="toggle-row">
        <div><div style="font-weight:600;font-size:14px;">${s.item}</div><div class="block-meta">${s.target}</div></div>
        <div class="switch ${s.held ? 'on' : ''}"><div class="knob"></div></div>
      </div>
    `);
    const sw = row.querySelector('.switch');
    row.addEventListener('click', async () => {
      const newVal = !sw.classList.contains('on');
      sw.classList.toggle('on', newVal);
      await setStretchItem(date, session, week, s.item, newVal, s.notes);
    });
    mobCard.appendChild(row);
  });
  root.appendChild(mobCard);

  const checkinBtn = el(`<button class="btn btn-primary btn-block btn-lg" style="margin-top:8px;">Go to check-in</button>`);
  checkinBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('nav', { detail: { tab: 'checkin' } })));
  root.appendChild(checkinBtn);
}

function openWarmupSheet(date, session, week) {
  getWarmupStatus(date, session).then((items) => {
    const content = openSheet(`
      <h3 style="margin-bottom:12px;">Warm-up — ${session}</h3>
      <div id="warmup-sheet-list"></div>
    `);
    const list = content.querySelector('#warmup-sheet-list');
    items.forEach((w) => {
      const row = el(`
        <div class="toggle-row">
          <div><div style="font-weight:600;font-size:14px;">${w.item}</div><div class="block-meta">${w.target}</div></div>
          <div class="switch ${w.done ? 'on' : ''}"><div class="knob"></div></div>
        </div>
      `);
      const sw = row.querySelector('.switch');
      row.addEventListener('click', async () => {
        const newVal = !sw.classList.contains('on');
        sw.classList.toggle('on', newVal);
        await setWarmupItem(date, session, week, w.item, newVal, w.notes);
      });
      list.appendChild(row);
    });
  });
}

function openStretchSheet(date, session, week) {
  getStretchStatusForSession(date, session, week).then((items) => {
    const content = openSheet(`
      <h3 style="margin-bottom:12px;">Cooldown / Stretch — ${session}</h3>
      <div id="stretch-sheet-list"></div>
    `);
    const list = content.querySelector('#stretch-sheet-list');
    items.forEach((s) => {
      const row = el(`
        <div class="toggle-row">
          <div><div style="font-weight:600;font-size:14px;">${s.item}</div><div class="block-meta">${s.target}</div></div>
          <div class="switch ${s.held ? 'on' : ''}"><div class="knob"></div></div>
        </div>
      `);
      const sw = row.querySelector('.switch');
      row.addEventListener('click', async () => {
        const newVal = !sw.classList.contains('on');
        sw.classList.toggle('on', newVal);
        await setStretchItem(date, session, week, s.item, newVal, s.notes);
      });
      list.appendChild(row);
    });
  });
}

function blockRow(title, meta, icon, done) {
  return el(`
    <div class="block-row">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">${icon}</span>
        <div>
          <div class="block-title">${title}</div>
          <div class="block-meta">${meta}</div>
        </div>
      </div>
      ${done ? '<span class="progress-chip done">Done</span>' : '<span class="chevron">›</span>'}
    </div>
  `);
}
