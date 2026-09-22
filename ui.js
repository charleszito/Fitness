export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function fmtTime(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtWeight(w, unit) {
  if (w == null) return '—';
  if (unit === 'assist' || (typeof w === 'number' && w < 0)) return `Assist ${Math.abs(w)}`;
  const rounded = Math.round(w * 10) / 10;
  return `${rounded}`;
}

let toastTimer = null;
export function showToast(msg, onUndo) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  const undoBtn = document.getElementById('toast-undo');
  msgEl.textContent = msg;
  undoBtn.style.display = onUndo ? '' : 'none';
  const newUndoBtn = undoBtn.cloneNode(true);
  undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);
  if (onUndo) {
    newUndoBtn.addEventListener('click', () => {
      onUndo();
      hideToast();
    });
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
export function hideToast() {
  document.getElementById('toast').classList.remove('show');
}

export function openSheet(innerHtml) {
  const backdrop = document.getElementById('sheet-backdrop');
  const content = document.getElementById('sheet-content');
  content.innerHTML = `<div class="sheet-handle"></div>` + innerHtml;
  backdrop.classList.remove('hidden');
  backdrop.onclick = (e) => { if (e.target === backdrop) closeSheet(); };
  return content;
}
export function closeSheet() {
  document.getElementById('sheet-backdrop').classList.add('hidden');
}

export function haptic() {
  // iOS Safari has no Vibration API; this is a harmless no-op fallback for
  // browsers that do support it.
  if (navigator.vibrate) {
    try { navigator.vibrate(8); } catch (e) { /* ignore */ }
  }
}

export function weekdayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
}
