import { el, openSheet, closeSheet } from './ui.js';
import { metaGet, metaSet } from './db.js';
import { SESSIONS, parseTarget, getBlocks } from './program.js';
import { addNextBlock } from './blocks-data.js';
import { setTheme } from './theme.js';
import { setWakeLockEnabled } from './timer.js';
import { exportToXlsx, exportToJson, importFromJson } from './export.js';

export async function mountPlan() {
  const root = document.getElementById('screen-plan');
  root.innerHTML = '';
  root.appendChild(el(`<div class="page-title">Plan</div><div class="page-sub">Program, targets, blocks and data</div>`));

  root.appendChild(await buildSettingsCard());
  root.appendChild(await buildBlocksCard());
  root.appendChild(buildProgramCard());
  root.appendChild(buildDataCard());
}

async function buildSettingsCard() {
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Settings</div>`));

  const proteinTarget = await metaGet('proteinTargetG', 185);
  const proteinRow = el(`
    <div class="toggle-row">
      <span style="font-weight:600;">Protein target (g/day)</span>
      <input type="number" id="protein-target-input" value="${proteinTarget}" style="width:76px;text-align:center;background:var(--bg-elev2);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:8px;font-size:16px;" />
    </div>
  `);
  proteinRow.querySelector('#protein-target-input').addEventListener('change', async (e) => {
    const v = parseInt(e.target.value, 10) || 185;
    await metaSet('proteinTargetG', v);
  });
  card.appendChild(proteinRow);

  const wakeLockEnabled = await metaGet('wakeLockEnabled', true);
  card.appendChild(buildSwitchRow('Keep screen on during workout', wakeLockEnabled, async (v) => {
    await metaSet('wakeLockEnabled', v);
    setWakeLockEnabled(v);
  }));

  const theme = await metaGet('theme', 'dark');
  const themeRow = el(`
    <div class="toggle-row">
      <span style="font-weight:600;">Appearance</span>
      <select id="theme-select" style="background:var(--bg-elev2);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:8px 10px;font-size:14px;">
        <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
        <option value="system" ${theme === 'system' ? 'selected' : ''}>System</option>
      </select>
    </div>
  `);
  themeRow.querySelector('#theme-select').addEventListener('change', (e) => setTheme(e.target.value));
  card.appendChild(themeRow);

  return card;
}

function buildSwitchRow(label, value, onChange) {
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

async function buildBlocksCard() {
  const blocks = getBlocks();
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Training blocks</div>`));
  blocks.forEach((b) => {
    const end = new Date(b.startDate + 'T00:00:00');
    end.setDate(end.getDate() + b.weeks * 7 - 1);
    card.appendChild(el(`
      <div class="block-row">
        <div><div class="block-title">${b.label}</div><div class="block-meta">${b.startDate} → ${end.toISOString().slice(0, 10)}</div></div>
      </div>
    `));
  });
  const addBtn = el(`<button class="btn btn-block" style="margin-top:8px;">+ Set up next block</button>`);
  addBtn.addEventListener('click', async () => {
    await addNextBlock();
    mountPlan();
  });
  card.appendChild(addBtn);
  card.appendChild(el(`<div class="page-sub" style="margin-top:8px;">Week 8 is a deload + re-test. Add the next block once you're ready, and it reuses this same weekly template starting the day after Block 1 ends.</div>`));
  return card;
}

function buildProgramCard() {
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Program</div>`));
  Object.entries(SESSIONS).forEach(([session, exercises]) => {
    const sessionHeader = el(`<div style="font-weight:800;margin:12px 0 4px;">${session}</div>`);
    card.appendChild(sessionHeader);
    exercises.forEach((exr) => {
      const row = el(`
        <div class="block-row" style="padding:8px 0;">
          <div><div class="block-title" style="font-size:14px;">${exr.name}</div><div class="block-meta">${exr.target} · rest ${exr.restSec}s</div></div>
          <span class="chevron">›</span>
        </div>
      `);
      row.addEventListener('click', () => openExerciseEditSheet(session, exr));
      card.appendChild(row);
    });
  });
  return card;
}

async function openExerciseEditSheet(session, exr) {
  const overrides = await metaGet('planOverrides', {});
  const existing = overrides[session]?.[exr.id] || {};
  const content = openSheet(`
    <h3 style="margin-bottom:12px;">${exr.name}</h3>
    <div class="field"><label>Swap to (leave blank to keep)</label><input type="text" id="swap-name" placeholder="${exr.name}" value="${existing.replacement?.name || ''}" /></div>
    <div class="field"><label>Target (e.g. 3x8-10)</label><input type="text" id="swap-target" value="${existing.replacement?.target || exr.target}" /></div>
    <div class="field"><label>Default rest (seconds)</label><input type="number" id="swap-rest" value="${existing.restSec ?? exr.restSec}" /></div>
    <button class="btn btn-primary btn-block" id="swap-save">Save</button>
    ${Object.keys(existing).length ? '<button class="btn btn-block" id="swap-reset" style="margin-top:8px;">Reset to original</button>' : ''}
  `);
  content.querySelector('#swap-save').addEventListener('click', async () => {
    const name = content.querySelector('#swap-name').value.trim();
    const targetStr = content.querySelector('#swap-target').value.trim();
    const restSec = parseInt(content.querySelector('#swap-rest').value, 10) || exr.restSec;
    const all = await metaGet('planOverrides', {});
    all[session] = all[session] || {};
    const replacement = name ? { name, target: targetStr, ...parseTarget(targetStr) } : (targetStr !== exr.target ? { target: targetStr, ...parseTarget(targetStr) } : undefined);
    all[session][exr.id] = { ...(replacement ? { replacement } : {}), restSec };
    await metaSet('planOverrides', all);
    closeSheet();
    mountPlan();
  });
  const resetBtn = content.querySelector('#swap-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const all = await metaGet('planOverrides', {});
      if (all[session]) delete all[session][exr.id];
      await metaSet('planOverrides', all);
      closeSheet();
      mountPlan();
    });
  }
}

function buildDataCard() {
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Data</div>`));
  const exportXlsxBtn = el(`<button class="btn btn-block" style="margin-bottom:8px;">Export as .xlsx</button>`);
  exportXlsxBtn.addEventListener('click', () => exportToXlsx());
  const exportJsonBtn = el(`<button class="btn btn-block" style="margin-bottom:8px;">Export JSON backup</button>`);
  exportJsonBtn.addEventListener('click', () => exportToJson());
  const importBtn = el(`<button class="btn btn-block">Restore from JSON backup</button>`);
  const fileInput = el(`<input type="file" accept="application/json" style="display:none;" />`);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await importFromJson(text);
    alert('Backup restored. Reloading…');
    location.reload();
  });
  card.appendChild(exportXlsxBtn);
  card.appendChild(exportJsonBtn);
  card.appendChild(importBtn);
  card.appendChild(fileInput);
  return card;
}
