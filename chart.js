// Minimal inline-SVG chart helpers: thin lines, rounded ends, one hue per
// measure, no dual axes, legend for 2+ series. See the dataviz skill.
export function lineChartSVG({ width = 320, height = 140, series, yTarget, padding = 8 }) {
  const allVals = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null);
  if (yTarget != null) allVals.push(yTarget);
  if (!allVals.length) return '<div class="empty-state">No data yet</div>';
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const rangeY = maxY - minY || 1;
  const padY = rangeY * 0.12;
  const y0 = minY - padY, y1 = maxY + padY;

  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const rangeX = maxX - minX || 1;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const sx = (x) => padding + ((x - minX) / rangeX) * innerW;
  const sy = (y) => padding + innerH - ((y - y0) / (y1 - y0)) * innerH;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;display:block;">`;

  if (yTarget != null) {
    const ty = sy(yTarget);
    svg += `<line x1="${padding}" y1="${ty}" x2="${width - padding}" y2="${ty}" stroke="var(--text-faint)" stroke-width="1.5" stroke-dasharray="4 4" />`;
  }

  series.forEach((s) => {
    const pts = s.points.filter((p) => p.y != null);
    if (s.type === 'dots') {
      pts.forEach((p) => {
        svg += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3" fill="${s.color}" opacity="0.7" />`;
      });
    } else {
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
      svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }
  });

  svg += '</svg>';
  return svg;
}

export function barChartSVG({ width = 320, height = 120, bars, color = 'var(--accent)', padding = 8 }) {
  if (!bars.length) return '<div class="empty-state">No data yet</div>';
  const maxV = Math.max(...bars.map((b) => b.value), 1);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2 - 16;
  const gap = 6;
  const barW = (innerW - gap * (bars.length - 1)) / bars.length;
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;display:block;">`;
  bars.forEach((b, i) => {
    const h = maxV > 0 ? (b.value / maxV) * innerH : 0;
    const x = padding + i * (barW + gap);
    const y = padding + innerH - h;
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="3" fill="${color}" />`;
    svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--text-faint)">${b.label}</text>`;
  });
  svg += '</svg>';
  return svg;
}

export function statRow(label, value, sub) {
  return `<div class="block-row"><div><div class="block-title" style="font-size:14px;">${label}</div>${sub ? `<div class="block-meta">${sub}</div>` : ''}</div><div style="font-weight:800;font-size:16px;">${value}</div></div>`;
}

export function progressBar(pct, color = 'var(--accent)') {
  const clamped = Math.max(0, Math.min(100, pct));
  return `<div style="height:8px;border-radius:4px;background:var(--bg-elev3);overflow:hidden;"><div style="height:100%;width:${clamped}%;background:${color};"></div></div>`;
}
