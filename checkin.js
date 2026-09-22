import { el } from '../ui.js';
import {
  getDailyLog, setDailyLog, getMealLog, setMealEntry, acceptPlannedMeal,
  dailyProteinTotal, dailyKcalTotal, getProteinTarget,
} from '../daily-data.js';
import { sessionForDate, dateToWeek, LIFTING_SESSIONS, MEAL_PLAN, STEPS_TARGETS } from '../data/program.js';
import { openSheet, closeSheet } from '../ui.js';

export async function mountCheckin(date) {
  const root = document.getElementById('screen-checkin');
  root.innerHTML = '';
  const session = sessionForDate(date);
  const week = dateToWeek(date);
  const isUpperDay = session === 'Upper A' || session === 'Upper B';
  const stepsTarget = STEPS_TARGETS[Math.min(week, 8) - 1];

  const daily = await getDailyLog(date);
  const meal = await getMealLog(date);
  const proteinTarget = await getProteinTarget();
  const proteinSoFar = dailyProteinTotal(meal);
  const kcalSoFar = dailyKcalTotal(meal);

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  root.appendChild(el(`
    <div class="page-title">Check-in</div>
    <div class="page-sub">${dateLabel} · ${session}</div>
  `));

  // Weight + steps card
  const numbersCard = el(`<div class="card"></div>`);
  numbersCard.appendChild(buildNumberField('Morning weight (kg)', daily.weightKg, 0.1, async (v) => {
    await setDailyLog(date, { weightKg: v });
  }));
  numbersCard.appendChild(buildNumberField(`Steps (target ${stepsTarget.toLocaleString()})`, daily.steps, 500, async (v) => {
    await setDailyLog(date, { steps: v });
  }));
  root.appendChild(numbersCard);

  // Protein / meals card
  const proteinPct = Math.min(100, Math.round((proteinSoFar / proteinTarget) * 100));
  const mealsCard = el(`
    <div class="card">
      <div class="row-label">Protein</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
        <span style="font-size:28px;font-weight:800;">${proteinSoFar}g</span>
        <span style="color:var(--text-dim);">/ ${proteinTarget}g target · ${kcalSoFar} kcal</span>
      </div>
      <div style="height:8px;border-radius:4px;background:var(--bg-elev3);overflow:hidden;margin-bottom:14px;">
        <div style="height:100%;width:${proteinPct}%;background:var(--accent);"></div>
      </div>
      <div class="row-label">Meals</div>
      <div id="meals-list"></div>
    </div>
  `);
  const mealsList = mealsCard.querySelector('#meals-list');
  meal.meals.forEach((m) => {
    const row = el(`
      <div class="block-row" style="padding:10px 0;">
        <div style="flex:1;">
          <div class="block-title" style="font-size:14px;">${m.slot} <span style="color:var(--text-faint);font-weight:600;font-size:12px;">${m.confirmed ? `· ${m.kcal} kcal / ${m.protein}g` : `· target ${m.targetKcal} kcal / ${m.targetProtein}g`}</span></div>
          <div class="block-meta">${m.planned}</div>
        </div>
        ${m.confirmed
          ? '<span class="progress-chip done">Logged</span>'
          : '<button class="btn btn-primary" data-accept style="min-height:44px;padding:0 14px;">Confirm</button>'}
      </div>
    `);
    if (!m.confirmed) {
      row.querySelector('[data-accept]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await acceptPlannedMeal(date, m.slot);
        mountCheckin(date);
      });
      row.addEventListener('click', () => openMealEditSheet(date, m));
    } else {
      row.addEventListener('click', () => openMealEditSheet(date, m));
    }
    mealsList.appendChild(row);
  });
  root.appendChild(mealsCard);

  // Y/N toggles card
  const togglesCard = el(`<div class="card"></div>`);
  togglesCard.appendChild(buildToggleRow('Session completed', daily.sessionDone, async (v) => setDailyLog(date, { sessionDone: v })));
  if (!LIFTING_SESSIONS.includes(session)) {
    togglesCard.appendChild(buildToggleRow('Cardio / mobility done', daily.cardioDone, async (v) => setDailyLog(date, { cardioDone: v })));
  }
  if (isUpperDay) {
    togglesCard.appendChild(el(`<div class="toggle-row"><span style="color:var(--text-faint);">Ankle + fascia work</span><span style="color:var(--text-faint);font-size:13px;">n/a today</span></div>`));
  } else {
    togglesCard.appendChild(buildToggleRow('Ankle + fascia work done', daily.ankleFasciaDone, async (v) => setDailyLog(date, { ankleFasciaDone: v })));
  }
  root.appendChild(togglesCard);

  // notes
  const notesCard = el(`
    <div class="card">
      <div class="row-label">Notes</div>
      <textarea id="daily-notes" placeholder="Anything worth remembering today" style="width:100%;min-height:70px;background:var(--bg-elev2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:10px;font-size:15px;">${daily.notes || ''}</textarea>
    </div>
  `);
  const notesArea = notesCard.querySelector('#daily-notes');
  let notesTimer = null;
  notesArea.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => setDailyLog(date, { notes: notesArea.value }), 400);
  });
  root.appendChild(notesCard);
}

function buildNumberField(label, value, step, onChange) {
  const wrap = el(`
    <div class="toggle-row">
      <span style="font-weight:600;">${label}</span>
      <div class="stepper">
        <button type="button">−</button>
        <input type="text" inputmode="decimal" style="width:76px;" value="${value ?? ''}" placeholder="—" />
        <button type="button">+</button>
      </div>
    </div>
  `);
  const input = wrap.querySelector('input');
  const [minus, plus] = wrap.querySelectorAll('button');
  function commit() {
    const n = parseFloat(input.value);
    onChange(Number.isFinite(n) ? n : null);
  }
  minus.addEventListener('click', () => {
    const n = (parseFloat(input.value) || 0) - step;
    input.value = Math.round(n * 10) / 10;
    commit();
  });
  plus.addEventListener('click', () => {
    const n = (parseFloat(input.value) || 0) + step;
    input.value = Math.round(n * 10) / 10;
    commit();
  });
  input.addEventListener('change', commit);
  return wrap;
}

function buildToggleRow(label, value, onChange) {
  const wrap = el(`
    <div class="toggle-row">
      <span style="font-weight:600;">${label}</span>
      <div class="switch ${value ? 'on' : ''}"><div class="knob"></div></div>
    </div>
  `);
  const sw = wrap.querySelector('.switch');
  wrap.addEventListener('click', async () => {
    const newVal = !sw.classList.contains('on');
    sw.classList.toggle('on', newVal);
    await onChange(newVal);
  });
  return wrap;
}

function openMealEditSheet(date, m) {
  const content = openSheet(`
    <h3 style="margin-bottom:4px;">${m.slot}</h3>
    <div class="page-sub">${m.planned}</div>
    <div class="field"><label>Calories</label><input type="number" id="meal-kcal" value="${m.kcal ?? m.targetKcal}" /></div>
    <div class="field"><label>Protein (g)</label><input type="number" id="meal-protein" value="${m.protein ?? m.targetProtein}" /></div>
    <button class="btn btn-primary btn-block" id="meal-save">Save</button>
  `);
  content.querySelector('#meal-save').addEventListener('click', async () => {
    const kcal = parseFloat(content.querySelector('#meal-kcal').value) || 0;
    const protein = parseFloat(content.querySelector('#meal-protein').value) || 0;
    await setMealEntry(date, m.slot, { kcal, protein, confirmed: true });
    closeSheet();
    mountCheckin(date);
  });
}
